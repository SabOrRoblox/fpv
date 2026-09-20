import { MSG, unwrapBinary } from '../../../shared/net/protocol.js';

const RECONNECT_DELAY_BASE = 1000;
const RECONNECT_DELAY_MAX = 15000;
const PING_INTERVAL_MS = 1000;
const STALE_PING_MS = 6000;
const MAX_FAST_RETRIES = 3;

export class GameSocket {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.playerId = 0;
    this.roomId = null;
    this.ping = 0;
    this.handlers = new Map();

    this.reconnectAttempts = 0;
    this.reconnectDelay = RECONNECT_DELAY_BASE;
    this.shouldReconnect = false;
    this.reconnecting = false;
    this.banned = false;
    this.kicked = false;
    this.lastKickReason = null;

    this.playerName = 'anon';
    this.pingInterval = null;
    this.lastPongTime = 0;
    this.staleWatchdog = null;

    this.online = navigator.onLine;

    window.addEventListener('online', () => {
      this.online = true;
      this.emit('online');
      if (this.shouldReconnect && !this.connected && !this.banned && !this.kicked) {
        this._scheduleReconnect(0);
      }
    });
    window.addEventListener('offline', () => {
      this.online = false;
      this.emit('offline');
    });
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
  }

  emit(event, ...args) {
    const arr = this.handlers.get(event);
    if (!arr) return;
    for (const fn of arr) {
      try { fn(...args); } catch (e) { console.error('[socket handler]', e); }
    }
  }

  connect(name) {
    if (this.banned || this.kicked) {
      console.warn('[socket] connect blocked: banned/kicked');
      return;
    }
    this.shouldReconnect = true;
    this.playerName = name;
    this.reconnectAttempts = 0;
    this.reconnectDelay = RECONNECT_DELAY_BASE;
    this._open();
  }

  _open() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    if (!navigator.onLine) {
      this.online = false;
      this.emit('offline');
      this._scheduleReconnect();
      return;
    }

    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      console.error('[socket] create failed', e);
      this._scheduleReconnect();
      return;
    }

    this.ws = ws;
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      this.connected = true;
      this.reconnecting = false;
      this.reconnectAttempts = 0;
      this.reconnectDelay = RECONNECT_DELAY_BASE;
      this.lastPongTime = performance.now();

      this.sendJSON({ type: 'join', name: this.playerName });
      this._startPing();
      this._startStaleWatchdog();

      this.emit('open');
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }

        switch (msg.type) {
          case 'welcome':
            this.playerId = msg.id;
            this.roomId = msg.roomId;
            this.lastPongTime = performance.now();
            this.emit('welcome', msg);
            break;
          case 'players':
            this.emit('players', msg);
            break;
          case 'leave':
            this.emit('leave', msg);
            break;
          case 'room_state':
            this.emit('room_state', msg);
            break;
          case 'validation_fail':
            this.emit('validation_fail', msg);
            break;
          case 'pong':
            this.ping = performance.now() - msg.ts;
            this.lastPongTime = performance.now();
            break;
          case 'error':
            this._handleServerError(msg);
            this.emit('error', msg);
            break;
          case 'kick':
            this._handleKick(msg);
            break;
          case 'ban':
            this._handleBan(msg);
            break;
          default:
            this.emit(msg.type, msg);
            break;
        }
      } else {
        const { type, payload } = unwrapBinary(ev.data);
        this.emit('binary', type, payload);
      }
    };

    ws.onclose = (ev) => {
      this.connected = false;
      this._stopPing();
      this._stopStaleWatchdog();

      if (this.banned || this.kicked) {
        this.emit('close', { banned: this.banned, kicked: this.kicked, reason: this.lastKickReason });
        return;
      }

      this.emit('close', { code: ev.code, reason: ev.reason });

      if (this.shouldReconnect) {
        this._scheduleReconnect();
      }
    };

    ws.onerror = () => {
      this.emit('ws_error');
    };
  }

  _scheduleReconnect(forceDelay) {
    if (this.banned || this.kicked) return;
    if (this.reconnecting) return;

    this.reconnecting = true;
    const delay = forceDelay !== undefined ? forceDelay : this.reconnectDelay;

    this.reconnectAttempts++;
    const tries = this.reconnectAttempts;
    this.emit('reconnecting', { attempt: tries, delay });

    setTimeout(() => {
      this.reconnecting = false;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.6, RECONNECT_DELAY_MAX);
      this._open();
    }, delay);
  }

  _startPing() {
    this._stopPing();
    this.pingInterval = setInterval(() => {
      if (this.connected) {
        this.sendJSON({ type: 'ping', ts: performance.now() });
      }
    }, PING_INTERVAL_MS);
  }

  _stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  _startStaleWatchdog() {
    this._stopStaleWatchdog();
    this.staleWatchdog = setInterval(() => {
      if (!this.connected) return;
      const idle = performance.now() - this.lastPongTime;
      if (idle > STALE_PING_MS) {
        console.warn('[socket] stale connection, forcing reconnect');
        this.emit('stale');
        try { this.ws.close(); } catch {}
      }
    }, 1000);
  }

  _stopStaleWatchdog() {
    if (this.staleWatchdog) {
      clearInterval(this.staleWatchdog);
      this.staleWatchdog = null;
    }
  }

  _handleServerError(msg) {
    if (msg.reason === 'banned') {
      this._handleBan(msg);
    }
  }

  _handleKick(msg) {
    this.kicked = true;
    this.shouldReconnect = false;
    this.lastKickReason = msg.reason || 'kicked';
    this.emit('kicked', this.lastKickReason);
    try { this.ws.close(); } catch {}
  }

  _handleBan(msg) {
    this.banned = true;
    this.shouldReconnect = false;
    this.emit('banned', msg.reason || 'banned');
    try { this.ws.close(); } catch {}
  }

  sendJSON(obj) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return false;
    try {
      this.ws.send(JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }

  sendBinary(buffer) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return false;
    try {
      this.ws.send(buffer);
      return true;
    } catch (e) {
      return false;
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    this._stopPing();
    this._stopStaleWatchdog();
    if (this.ws) try { this.ws.close(); } catch {}
  }
}