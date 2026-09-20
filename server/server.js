import { WebSocketServer } from 'ws';
import { Player } from './core/player.js';
import { RoomManager } from './core/roomManager.js';
import {
  MSG, unwrapBinary, decodeEventCrash, decodeEventHit,
  buildSnapshot, wrapBinary,
  decodePlayerState, decodeDroneState,
} from '../shared/net/protocol.js';
import { validatePlayerState, validateDroneState } from './validation/movementValidator.js';
import { validateCrash } from './validation/crashValidator.js';
import { validateHit } from './validation/hitValidator.js';

const PORT = process.env.PORT || 8080;
const SNAPSHOT_HZ = 20;
const SNAPSHOT_INTERVAL = 1000 / SNAPSHOT_HZ;

const MAX_PACKETS_PER_SEC = 90;
const MAX_VALIDATION_FAILS = 200;
const ENTER_DRONE_MAX_DIST = 15;

const roomManager = new RoomManager(10);
const wss = new WebSocketServer({ port: PORT });

function log(tag, ...args) {
  const t = new Date().toISOString().slice(11, 23);
  console.log(`[${t}] [${tag}]`, ...args);
}

let nextPlayerId = 1;

const stats = {
  conn: 0, joins: 0, leaves: 0, in: 0, out: 0,
  stP: 0, stD: 0, crash: 0, hit: 0, snap: 0, fail: 0, kicks: 0,
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
    for (const p of room.players.values()) {
      if (p.ws.readyState === 1) { p.ws.send(data); stats.out++; }
    }
  }
}

wss.on('connection', (ws) => {
  ws.binaryType = 'arraybuffer';
  ws.player = null;
  ws.pktCount = 0;
  ws.pktReset = Date.now();
  stats.conn++;

  ws.on('message', (data, isBinary) => {
    stats.in++;

    const now = Date.now();
    if (now - ws.pktReset > 1000) {
      ws.pktCount = 0;
      ws.pktReset = now;
    }
    ws.pktCount++;
    if (ws.pktCount > MAX_PACKETS_PER_SEC) {
      log('RATE', `kick — pkt/s > ${MAX_PACKETS_PER_SEC}`);
      stats.kicks++;
      ws.close();
      return;
    }

    if (!ws.player) {
      if (isBinary) return;
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'join') {
        const id = nextPlayerId++;
        const name = String(msg.name || 'anon').slice(0, 16);
        const player = new Player(id, ws, name);
        ws.player = player;

        for (const room of roomManager.rooms.values()) {
          for (const existing of [...room.players.values()]) {
            if (existing.ws !== ws && existing.name === name) {
              log('DUP', `closing old session for "${name}" (P${existing.id})`);
              try { existing.ws.close(); } catch {}
              room.remove(existing.id);
              room.broadcastJSON({ type: 'leave', id: existing.id });
              room.broadcastJSON(room.playerListPayload());
            }
          }
        }

        const room = roomManager.findOrCreateRoom();
        if (!room.add(player)) {
          ws.send(JSON.stringify({ type: 'error', reason: 'server_full' }), () => ws.close());
          return;
        }

        stats.joins++;
        sendJSON(ws, { type: 'welcome', id, count: room.count(), max: room.maxPlayers, roomId: room.id });
        room.broadcastJSON(room.playerListPayload());
        broadcastAllJSON({ type: 'room_state', rooms: roomManager.roomsState(), total: roomManager.totalPlayers() });
        sendJSON(ws, { type: 'team_choice', teams: room.teamsState() });

        log('JOIN', `${id} "${name}" → ${room.id} (${room.count()}/${room.maxPlayers})`);
        return;
      }

      if (msg.type === 'ping') {
        sendJSON(ws, { type: 'pong', ts: msg.ts });
        return;
      }
      return;
    }

    const player = ws.player;
    const room = roomManager.getRoom(player.roomId);
    if (!room) return;
    player.touch();

    if (isBinary) {
      const { type, payload } = unwrapBinary(data);

      if (type === MSG.STATE_PLAYER) {
        if (player.mode !== 'walk') return;
        const s = decodePlayerState(new DataView(payload), 0);
        stats.stP++;
        if (validatePlayerState(player, s.x, s.y, s.z)) {
          player.lastPX = s.x; player.lastPY = s.y; player.lastPZ = s.z;
          player.x = s.x; player.y = s.y; player.z = s.z;
          player.yaw = s.yaw;
          player.hp = s.hp;
          player.alive = s.alive;
        } else {
          stats.fail++;
          player.validationFails++;
          if (player.validationFails > MAX_VALIDATION_FAILS) {
            log('KICK', `P${player.id} — too many validation fails`);
            stats.kicks++;
            ws.close();
          }
        }
        return;
      }

      if (type === MSG.STATE_DRONE) {
        const s = decodeDroneState(new DataView(payload), 0);
        stats.stD++;
        if (validateDroneState(player, s.x, s.y, s.z)) {
          player.lastDX = s.x; player.lastDY = s.y; player.lastDZ = s.z;
          player.drone.x = s.x; player.drone.y = s.y; player.drone.z = s.z;
          player.drone.qx = s.qx; player.drone.qy = s.qy;
          player.drone.qz = s.qz; player.drone.qw = s.qw;
          player.drone.crashed = s.crashed;
          player.drone.rpm = s.rpm;
        } else {
          stats.fail++;
          player.validationFails++;
          if (player.validationFails > MAX_VALIDATION_FAILS) {
            log('KICK', `P${player.id} — too many validation fails`);
            stats.kicks++;
            ws.close();
          }
        }
        return;
      }

      if (type === MSG.EVENT_CRASH) {
        const ev = decodeEventCrash(payload);
        stats.crash++;
        if (validateCrash(player, ev.x, 0, ev.z)) {
          player.drone.x = ev.x;
          player.drone.z = ev.z;
          player.drone.crashed = true;
          player.lastDX = ev.x;
          player.lastDZ = ev.z;
          room.broadcastBinary(data, null);
          log('CRASH', `P${player.id} at (${ev.x.toFixed(1)}, ${ev.z.toFixed(1)})`);
        } else {
          stats.fail++;
        }
        return;
      }

      if (type === MSG.EVENT_HIT) {
        const ev = decodeEventHit(payload);
        stats.hit++;
        const victim = room.players.get(ev.victimId);
        if (victim && validateHit(player, victim, ev.damage)) {
          victim.hp = Math.max(0, victim.hp - ev.damage);
          if (victim.hp <= 0) victim.alive = false;
          room.broadcastBinary(data, null);
          log('HIT', `P${player.id} → P${victim.id} dmg=${ev.damage} hp=${victim.hp}`);
        } else {
          stats.fail++;
        }
        return;
      }
      return;
    }

    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'ping') {
      sendJSON(ws, { type: 'pong', ts: msg.ts });
      return;
    }

    if (msg.type === 'choose_team') {
      const team = msg.team === 'red' ? 'red' : 'blue';
      const counts = room.teamCounts();
      const other = team === 'red' ? 'blue' : 'red';
      if (counts[team] > counts[other]) {
        sendJSON(ws, { type: 'team_reject', reason: 'unbalanced' });
        return;
      }
      player.team = team;
      const spawn = team === 'red' ? room.spawnRed : room.spawnBlue;
      sendJSON(ws, { type: 'team_assigned', team, spawn });
      room.broadcastJSON({ type: 'team_update', id: player.id, team });
      room.broadcastJSON(room.playerListPayload());
      return;
    }

    if (msg.type === 'enter_drone') {
      if (player.mode === 'fpv') return;
      const requestedDroneId = String(msg.droneId || 'dron1').slice(0, 32);

      const px = typeof msg.px === 'number' ? msg.px : player.x;
      const pz = typeof msg.pz === 'number' ? msg.pz : player.z;
      player.x = px; player.z = pz;
      player.lastPX = px; player.lastPZ = pz;

      const dx = typeof msg.dx === 'number' ? msg.dx : px;
      const dz = typeof msg.dz === 'number' ? msg.dz : pz;

      const spawn = player.team === 'blue' ? room.spawnBlue : room.spawnRed;
      const padX = spawn.x + 4.5;
      const padZ = spawn.z;
      const distToPad = Math.hypot(px - padX, pz - padZ);
      const distToDrone = Math.hypot(px - dx, pz - dz);

      if (distToPad > ENTER_DRONE_MAX_DIST && distToDrone > ENTER_DRONE_MAX_DIST) {
        sendJSON(ws, { type: 'error', reason: 'too_far_from_pad' });
        return;
      }

      player.mode = 'fpv';
      player.droneId = requestedDroneId;
      player.drone.x = dx;
      player.drone.y = player.y;
      player.drone.z = dz;
      player.drone.qx = 0;
      player.drone.qy = 0;
      player.drone.qz = 0;
      player.drone.qw = 1;
      player.drone.crashed = false;
      player.drone.rpm = 0;
      player.lastDX = dx;
      player.lastDY = player.y;
      player.lastDZ = dz;
      player.hasDroneState = true;
      player.validationFails = 0;

      sendJSON(ws, { type: 'drone_selected', droneId: player.droneId });
      room.broadcastJSON({ type: 'mode', id: player.id, mode: player.mode, droneId: player.droneId });
      return;
    }

    if (msg.type === 'drone_reset') {
      const x = typeof msg.x === 'number' ? msg.x : player.drone.x;
      const y = typeof msg.y === 'number' ? msg.y : player.drone.y;
      const z = typeof msg.z === 'number' ? msg.z : player.drone.z;
      player.drone.x = x;
      player.drone.y = y;
      player.drone.z = z;
      player.drone.crashed = false;
      player.lastDX = x;
      player.lastDY = y;
      player.lastDZ = z;
      player.hasDroneState = true;
      player.validationFails = 0;
      return;
    }

    if (msg.type === 'exit_drone') {
      if (player.mode !== 'fpv') return;
      player.mode = 'walk';
      player.validationFails = 0;
      room.broadcastJSON({ type: 'mode', id: player.id, mode: player.mode });
      return;
    }
  });

  ws.on('close', () => {
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
    broadcastAllJSON({ type: 'room_state', rooms: roomManager.roomsState(), total: roomManager.totalPlayers() });
    log('LEAVE', `P${player.id} "${player.name}"`);
  });

  ws.on('error', (err) => log('ERROR', err.message));
});

setInterval(() => roomManager.checkTimeouts(), 1000);

setInterval(() => {
  for (const room of roomManager.rooms.values()) {
    const players = [];
    const drones = [];
    for (const p of room.players.values()) {
      if (p.hasPlayerState) {
        players.push({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: p.hp, alive: p.alive });
      }
      if (p.mode === 'fpv' && p.drone) {
        drones.push({
          id: p.id,
          x: p.drone.x, y: p.drone.y, z: p.drone.z,
          qx: p.drone.qx, qy: p.drone.qy, qz: p.drone.qz, qw: p.drone.qw,
          crashed: p.drone.crashed,
          rpm: p.drone.rpm || 0,
        });
      }
    }
    if (players.length === 0 && drones.length === 0) continue;
    room.broadcastBinary(wrapBinary(MSG.SNAPSHOT, buildSnapshot(players, drones)), null);
    stats.snap++;
  }
}, SNAPSHOT_INTERVAL);

setInterval(() => {
  log('STATS',
    `conn=${stats.conn} joins=${stats.joins} leaves=${stats.leaves} kicks=${stats.kicks}`,
    `in=${stats.in} out=${stats.out}`,
    `plr=${stats.stP} drn=${stats.stD} crash=${stats.crash} hit=${stats.hit}`,
    `snap=${stats.snap} fail=${stats.fail}`);
}, 10000);

log('server', `ws listening on :${PORT}`);