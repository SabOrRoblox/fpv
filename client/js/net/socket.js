import { unwrapBinary } from '../../../shared/net/protocol.js';

export class GameSocket {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.playerId = 0;
    this.roomId = null;
    this.ping = 0;
    this.handlers = new Map();
    this.reconnectDelay = 1000;
    this.shouldReconnect = false;
    this.playerName = 'anon';
    this.pingInterval = null;
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
  }

  emit(event, ...args) {
    const arr = this.handlers.get(event);
    if (!arr) return;
    for (const fn of arr) {
      try { fn(...args); } catch (e) { console.error(e); }
    }
  }

  connect(name) {
    this.shouldReconnect = true;
    this.playerName = name;
    this._open();
  }

  _open() {
    try { this.ws = new WebSocket(this.url); }
    catch { return; }
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      this.sendJSON({ type: 'join', name: this.playerName });
      this._startPing();
      this.emit('open');
    };

    this.ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'welcome') { this.playerId = msg.id; this.roomId = msg.roomId; this.emit('welcome', msg); }
        else if (msg.type === 'players') this.emit('players', msg);
        else if (msg.type === 'leave') this.emit('leave', msg);
        else if (msg.type === 'room_state') this.emit('room_state', msg);
        else if (msg.type === 'validation_fail') this.emit('validation_fail', msg);
        else if (msg.type === 'pong') this.ping = performance.now() - msg.ts;
        else if (msg.type === 'error') this.emit('error', msg);
        else if (msg.type === 'drone_selected') this.emit('drone_selected', msg);
        else if (msg.type === 'mode') this.emit('mode', msg);
      } else {
        const { type, payload } = unwrapBinary(ev.data);
        this.emit('binary', type, payload);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this._stopPing();
      this.emit('close');
      if (this.shouldReconnect) {
        setTimeout(() => this._open(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
      }
    };

    this.ws.onerror = () => this.emit('error', { reason: 'ws_error' });
  }

  sendJSON(obj) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(obj));
  }

  sendBinary(buffer) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;
    this.ws.send(buffer);
  }

  _startPing() {
    this._stopPing();
    this.pingInterval = setInterval(() => {
      this.sendJSON({ type: 'ping', ts: performance.now() });
    }, 1000);
  }

  _stopPing() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
  }

  disconnect() {
    this.shouldReconnect = false;
    this._stopPing();
    if (this.ws) this.ws.close();
  }
}