import { log } from '../log.js';

let ENABLED = false;

export function enableDebug(on = true) {
  ENABLED = !!on;
  if (ENABLED) log('DEBUG', 'debug enabled');
}

export function isDebug() {
  return ENABLED;
}

function fmtPos(x, y, z) {
  if (typeof x !== 'number' || !isFinite(x)) return '(NaN)';
  return `(${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)})`;
}

function fmtQ(qx, qy, qz, qw) {
  if (typeof qx !== 'number' || !isFinite(qx)) return '(NaN)';
  return `(${qx.toFixed(3)},${qy.toFixed(3)},${qz.toFixed(3)},${qw.toFixed(3)})`;
}

function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

export function dbgIn(player, kind, payload) {
  if (!ENABLED) return;
  const pid = player ? `P${player.id}` : '?';
  let info = '';
  switch (kind) {
    case 'STATE_PLAYER':
      info = `pos=${fmtPos(payload.x, payload.y, payload.z)} yaw=${(payload.yaw || 0).toFixed(2)} hp=${payload.hp} alive=${payload.alive}`;
      break;
    case 'STATE_DRONE':
      info = `pos=${fmtPos(payload.x, payload.y, payload.z)} q=${fmtQ(payload.qx, payload.qy, payload.qz, payload.qw)} rpm=${payload.rpm} crashed=${payload.crashed}`;
      break;
    case 'STATE_CAR':
      info = `pos=${fmtPos(payload.x, payload.y, payload.z)} yaw=${(payload.yaw || 0).toFixed(2)} hp=${payload.hp}`;
      break;
    case 'EVENT_CRASH':
      info = `at=(${payload.x?.toFixed(2)},${payload.z?.toFixed(2)})`;
      break;
    case 'EVENT_HIT':
      info = `victim=P${payload.victimId} dmg=${payload.damage}`;
      break;
    default:
      info = JSON.stringify(payload);
  }
  log('DBG-IN', `${pid} ${kind} ${info}`);
}

export function dbgOut(room, kind, payload) {
  if (!ENABLED) return;
  if (!room) return;
  const n = room.players ? room.players.size : 0;
  log('DBG-OUT', `${kind} → ${n} players: ${JSON.stringify(payload).slice(0, 180)}`);
}

export function dbgJoin(player, room) {
  if (!ENABLED) return;
  log('DBG-JOIN', `P${player.id} "${player.name}" → ${room.id} (${room.count()}/${room.maxPlayers})`);
}

export function dbgLeave(player, reason) {
  if (!ENABLED) return;
  log('DBG-LEAVE', `P${player.id} "${player.name}" reason=${reason}`);
}

export function dbgValidate(player, kind, ok, info) {
  if (!ENABLED) return;
  if (ok) return;
  log('DBG-VALIDATE', `P${player.id} ${kind} FAIL: ${info}`);
}

export function dbgEnterDrone(player, droneId, pos) {
  if (!ENABLED) return;
  log('DBG-DRONE', `P${player.id} ENTER ${droneId} @ ${fmtPos(pos.x, pos.y, pos.z)}`);
}

export function dbgExitDrone(player) {
  if (!ENABLED) return;
  log('DBG-DRONE', `P${player.id} EXIT`);
}

export function dbgEnterCar(player, pos) {
  if (!ENABLED) return;
  log('DBG-CAR', `P${player.id} ENTER @ ${fmtPos(pos.x, pos.y, pos.z)}`);
}

export function dbgExitCar(player) {
  if (!ENABLED) return;
  log('DBG-CAR', `P${player.id} EXIT`);
}

export function dbgTeam(player, team) {
  if (!ENABLED) return;
  log('DBG-TEAM', `P${player.id} → ${team}`);
}

export function dbgSnapshot(roomManager, snapshotBytes) {
  if (!ENABLED) return;
  const rooms = roomManager.rooms.size;
  const total = roomManager.totalPlayers();
  log('DBG-SNAP', `rooms=${rooms} players=${total} bytes=${fmtBytes(snapshotBytes)}`);
}

export function dbgPacket(player, dir, type, bytes) {
  if (!ENABLED) return;
  const pid = player ? `P${player.id}` : '?';
  log('DBG-PKT', `${dir} ${pid} type=${type} size=${fmtBytes(bytes)}`);
}

export function dbgZoneAccepted(zones) {
  if (!ENABLED) return;
  if (!Array.isArray(zones)) return;
  for (const z of zones) {
    log('DBG-ZONE', `${z.team} X[${z.minX.toFixed(1)}..${z.maxX.toFixed(1)}] Y[${z.minY.toFixed(1)}..${z.maxY.toFixed(1)}] Z[${z.minZ.toFixed(1)}..${z.maxZ.toFixed(1)}]`);
  }
}