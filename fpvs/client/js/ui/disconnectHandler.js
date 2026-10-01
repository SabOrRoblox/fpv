import { NetworkOverlay } from './networkOverlay.js';
import { ConnectionBadge } from './connectionBadge.js';
import { GameState } from '../core/gameState.js';

export function setupNetworkHandlers(socket, opts = {}) {
  const overlay = new NetworkOverlay();
  const badge = new ConnectionBadge();

  const onKickReset = opts.onKickReset || (() => {});
  const onBan = opts.onBan || (() => {});

  socket.on('offline', () => {
    overlay.showOffline();
    badge.setState('offline');
  });

  socket.on('online', () => {
    if (!socket.connected && !socket.banned && !socket.kicked) {
      overlay.showConnecting();
      badge.setState('reconnecting');
    }
  });

  socket.on('reconnecting', (info) => {
    if (socket.banned || socket.kicked) return;
    overlay.showReconnecting(info.attempt, info.delay);
    badge.setState('reconnecting');
  });

  socket.on('stale', () => {
    overlay.showStale();
    badge.setState('reconnecting');
  });

  socket.on('open', () => {
    overlay.hide();
    badge.setState('connected', 0);
  });

  socket.on('welcome', () => {
    overlay.hide();
    badge.setState('connected', socket.ping);
  });

  socket.on('close', () => {
    if (socket.banned || socket.kicked) return;
    if (!navigator.onLine) {
      overlay.showOffline();
      badge.setState('offline');
    } else if (!overlay.isVisible()) {
      overlay.showReconnecting(0, 1500);
      badge.setState('reconnecting');
    }
  });

  socket.on('kicked', (reason) => {
    overlay.showKicked(reason);
    badge.setState('kicked');
    if (typeof onKickReset === 'function') onKickReset(reason);
  });

  socket.on('banned', (reason) => {
    overlay.showBanned(reason);
    badge.setState('banned');
    if (typeof onBan === 'function') onBan(reason);
  });

  window.addEventListener('net:retry', () => {
    if (socket.banned) return;
    socket.kicked = false;
    socket.shouldReconnect = true;
    socket.reconnectDelay = 1000;
    socket.reconnectAttempts = 0;
    overlay.showConnecting();
    badge.setState('reconnecting');
    socket._open();
  });

  let _lastBadge = '';
  let _lastPing = -1;
  setInterval(() => {
    let state, ping = 0;
    if (socket.connected) {
      state = 'connected';
      ping = socket.ping | 0;
    } else if (!navigator.onLine) {
      state = 'offline';
    } else if (socket.banned) {
      state = 'banned';
    } else if (socket.kicked) {
      state = 'kicked';
    } else if (!overlay.isVisible()) {
      state = 'reconnecting';
    } else {
      return;
    }
    if (state === _lastBadge && (state !== 'connected' || ping === _lastPing)) return;
    _lastBadge = state;
    _lastPing = ping;
    badge.setState(state, ping);
  }, 1000);

  return { overlay, badge };
}