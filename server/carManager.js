import { SERVER_CONFIG } from './config.js';
import { log } from './log.js';

function sendJSON(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

const CAR_COLORS = [
  { team: 'red', color: 0xe85555 },
  { team: 'blue', color: 0x5599ff },
];

function pickColorIdx(player) {
  return player.team === 'blue' ? 1 : 0;
}

export function handleEnterCar(ws, player, room, msg) {
  if (player.mode === 'car') return;
  if (player.mode === 'fpv') return;

  const px = typeof msg.px === 'number' ? msg.px : player.x;
  const pz = typeof msg.pz === 'number' ? msg.pz : player.z;
  const cx = typeof msg.cx === 'number' ? msg.cx : px;
  const cz = typeof msg.cz === 'number' ? msg.cz : pz;
  const cy = typeof msg.cy === 'number' ? msg.cy : player.y;

  player.x = px;
  player.z = pz;
  player.lastPX = px;
  player.lastPZ = pz;

  const dx = px - cx;
  const dz = pz - cz;
  const distSq = dx * dx + dz * dz;
  const maxSq = SERVER_CONFIG.ENTER_CAR_MAX_DIST * SERVER_CONFIG.ENTER_CAR_MAX_DIST;

  if (distSq > maxSq) {
    sendJSON(ws, { type: 'error', reason: 'too_far_from_car' });
    return;
  }

  player.mode = 'car';
  player.car.x = cx;
  player.car.y = cy;
  player.car.z = cz;
  player.car.yaw = typeof msg.cyaw === 'number' ? msg.cyaw : 0;
  player.car.hp = 200;
  player.car.alive = true;
  player.car.colorIdx = pickColorIdx(player);
  player.carIdleSince = 0;

  player.lastCarX = cx;
  player.lastCarY = cy;
  player.lastCarZ = cz;

  player.hasCar = true;
  player.resetValidation();

  sendJSON(ws, { type: 'car_entered' });
  room.broadcastJSON({
    type: 'mode',
    id: player.id,
    mode: player.mode,
    carId: player.carId,
  });

  log('ENTER-CAR', `P${player.id} @ (${cx.toFixed(1)}, ${cz.toFixed(1)})`);
}

export function handleExitCar(ws, player, room) {
  if (player.mode !== 'car') return;
  player.mode = 'walk';
  player.hasCar = false;
  player.carIdleSince = 0;
  player.resetValidation();
  room.broadcastJSON({ type: 'mode', id: player.id, mode: player.mode });
  log('EXIT-CAR', `P${player.id}`);
}

export function handleCarReset(ws, player, msg) {
  const x = typeof msg.x === 'number' ? msg.x : player.car.x;
  const y = typeof msg.y === 'number' ? msg.y : player.car.y;
  const z = typeof msg.z === 'number' ? msg.z : player.car.z;
  const yaw = typeof msg.yaw === 'number' ? msg.yaw : player.car.yaw;

  player.car.x = x;
  player.car.y = y;
  player.car.z = z;
  player.car.yaw = yaw;
  player.car.hp = 200;
  player.car.alive = true;

  player.lastCarX = x;
  player.lastCarY = y;
  player.lastCarZ = z;

  player.hasCar = true;
  player.carIdleSince = 0;
  player.resetValidation();
}

export function checkCarIdle(roomManager) {
  const now = Date.now();
  for (const room of roomManager.rooms.values()) {
    for (const p of room.players.values()) {
      if (p.mode !== 'car') continue;
      if (!p.carIdleSince) continue;
      if (now - p.carIdleSince < SERVER_CONFIG.CAR_IDLE_DESPAWN_MS) continue;

      p.mode = 'walk';
      p.hasCar = false;
      p.carIdleSince = 0;
      room.broadcastJSON({ type: 'mode', id: p.id, mode: p.mode });
      log('CAR-IDLE', `P${p.id} despawned (idle > 60s)`);
    }
  }
}