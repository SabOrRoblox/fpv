import { WebSocketServer } from 'ws';
import { Player } from './core/player.js';
import { RoomManager } from './core/roomManager.js';
import { unwrapBinary, MSG } from '../shared/net/protocol.js';
import {
  handleStatePlayer, handleStateDrone, handleStateCar,
  handleEventCrash, handleEventHit,
} from './binaryHandlers.js';
import { handleJSON } from './jsonHandlers.js';
import { createSnapshotModule } from './snapshot.js';
import { checkCarIdle } from './carManager.js';
import { SERVER_CONFIG } from './config.js';
import { log } from './log.js';
import {
  enableDebug, dbgJoin, dbgLeave, dbgPacket,
  dbgSnapshot, dbgZoneAccepted,
} from './core/debug.js';

const DEBUG = false;

enableDebug(DEBUG);

const roomManager = new RoomManager(SERVER_CONFIG.MAX_PLAYERS_PER_ROOM);
const wss = new WebSocketServer({ port: SERVER_CONFIG.PORT });

let nextPlayerId = 1;
let spawnZones = [];

const stats = {
  conn: 0, joins: 0, leaves: 0, in: 0, out: 0,
  stP: 0, stD: 0, stC: 0, crash: 0, hit: 0, snap: 0, snapBytes: 0, fail: 0, kicks: 0,
};

function sendJSON(ws, obj) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
    stats.out++;
  }
}

function broadcastAllJSON(obj) {
  const data = JSON.stringify(obj);
  for (const room of roomManager.rooms.values()) {
    room.broadcastPrepared(data, null);
  }
}

function handleJoin(ws, msg) {
  const id = nextPlayerId++;
  const name = String(msg.name || 'anon').slice(0, 16);
  const player = new Player(id, ws, name);
  ws.player = player;

  for (const room of roomManager.rooms.values()) {
    for (const existing of room.players.values()) {
      if (existing.ws !== ws && existing.name === name) {
        log('DUP', `mark old "${name}" P${existing.id} for kick`);
        existing._kicked = true;
        try { existing.ws.close(); } catch {}
      }
    }
  }

  const room = roomManager.findOrCreateRoom();
  if (!room.add(player)) {
    ws.send(JSON.stringify({ type: 'error', reason: 'server_full' }), () => ws.close());
    return;
  }

  roomManager.markDirty();
  stats.joins++;

  sendJSON(ws, {
    type: 'welcome',
    id,
    count: room.count(),
    max: room.maxPlayers,
    roomId: room.id,
    protocol: 1,
  });

  room.broadcastJSON(room.playerListPayload());
  broadcastAllJSON({
    type: 'room_state',
    rooms: roomManager.roomsState(),
    total: roomManager.totalPlayers(),
  });

  room.markDirty();
  sendJSON(ws, { type: 'team_choice', teams: room.teamsState() });
  const c = room.teamCounts();
  room.broadcastJSON({ type: 'team_counts', red: c.red, blue: c.blue });

  log('JOIN', `P${id} "${name}" → ${room.id} (${room.count()}/${room.maxPlayers})`);
  dbgJoin(player, room);
}

function handleLeave(ws) {
  const player = ws.player;
  if (!player) return;

  stats.leaves++;
  const room = roomManager.getRoom(player.roomId);
  if (room) {
    room.remove(player.id);
    room.broadcastJSON({ type: 'leave', id: player.id });
    room.broadcastJSON(room.playerListPayload());
  }

  roomManager.removePlayer(player);
  broadcastAllJSON({
    type: 'room_state',
    rooms: roomManager.roomsState(),
    total: roomManager.totalPlayers(),
  });

  const tag = player._kicked ? 'KICKED' : 'LEAVE';
  log(tag, `P${player.id} "${player.name}"`);
  dbgLeave(player, player._kicked ? 'kicked' : 'close');
  ws.player = null;
}

wss.on('connection', (ws) => {
  ws.binaryType = 'arraybuffer';
  ws.player = null;
  stats.conn++;

  ws.on('message', (data, isBinary) => {
    stats.in++;

    if (DEBUG && data) {
      const size = data.byteLength || (data.length || 0);
      dbgPacket(ws.player, 'IN', isBinary ? 'binary' : 'json', size);
    }

    if (!ws.player) {
      if (isBinary) return;
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === 'join') { handleJoin(ws, msg); return; }
      if (msg.type === 'ping') { sendJSON(ws, { type: 'pong', ts: msg.ts }); return; }
      return;
    }

    const player = ws.player;

    if (!player.checkRate()) {
      log('KICK-RATE', `P${player.id} pkt > ${SERVER_CONFIG.MAX_PACKETS_PER_SEC}/s, count=${player.pktCount}`);
      stats.kicks++;
      try { ws.send(JSON.stringify({ type: 'kick', reason: 'rate' })); } catch {}
      ws.close();
      return;
    }

    const room = roomManager.getRoom(player.roomId);
    if (!room) return;
    player.touch();

    if (isBinary) {
      const { type, payload } = unwrapBinary(data);

      switch (type) {
        case MSG.STATE_PLAYER: handleStatePlayer(ws, player, payload, stats); return;
        case MSG.STATE_DRONE: handleStateDrone(ws, player, payload, stats); return;
        case MSG.STATE_CAR: handleStateCar(ws, player, payload, stats, room); return;
        case MSG.EVENT_CRASH: handleEventCrash(player, room, data, payload, stats); return;
        case MSG.EVENT_HIT: handleEventHit(player, room, data, payload, stats); return;
        default: return;
      }
    }

    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'zones') {
      if (Array.isArray(msg.zones) && msg.zones.length > 0 && spawnZones.length === 0) {
        spawnZones = msg.zones;
        log('ZONES', `received ${spawnZones.length} zones`);
        dbgZoneAccepted(spawnZones);
      }
      return;
    }

    handleJSON(ws, player, room, msg, stats, roomManager, spawnZones);
  });

  ws.on('close', (code, reason) => {
    const pid = ws.player ? `P${ws.player.id}` : 'unknown';
    log('CLOSE', `${pid} code=${code} reason=${reason ? reason.toString().slice(0, 80) : '-'}`);
    handleLeave(ws);
  });

  ws.on('error', (err) => {
    const pid = ws.player ? `P${ws.player.id}` : 'unknown';
    log('WS-ERR', `${pid}: ${err.message}`, err.code || '');
  });
});

const snapshot = createSnapshotModule(roomManager, stats);

let snapshotRunning = true;
function snapshotLoop() {
  if (!snapshotRunning) return;
  const start = Date.now();
  snapshot.tick();
  const elapsed = Date.now() - start;
  if (DEBUG) {
    dbgSnapshot(roomManager, stats.snapBytes);
  }
  const interval = 1000 / SERVER_CONFIG.SNAPSHOT_HZ;
  const delay = Math.max(0, interval - elapsed);
  setTimeout(snapshotLoop, delay);
}
snapshotLoop();

setInterval(() => roomManager.checkTimeouts(), SERVER_CONFIG.CLEANUP_INTERVAL_MS);
setInterval(() => checkCarIdle(roomManager), 5000);

log('server', `ws listening on :${SERVER_CONFIG.PORT}`);

process.on('SIGINT', () => {
  log('SHUTDOWN', 'closing...');
  snapshotRunning = false;
  for (const room of roomManager.rooms.values()) {
    for (const p of room.players.values()) {
      try { p.ws.close(); } catch {}
    }
  }
  wss.close(() => process.exit(0));
});