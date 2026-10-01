import {
  MSG, decodePlayerState, decodeDroneState,
  decodeEventCrash, decodeEventHit,
} from '../shared/net/protocol.js';
import { validatePlayerState, validateDroneState } from './validation/movementValidator.js';
import { validateCrash } from './validation/crashValidator.js';
import { validateHit } from './validation/hitValidator.js';
import { SERVER_CONFIG } from './config.js';
import { log } from './log.js';
import { dbgIn, dbgValidate } from './core/debug.js';

export function handleStatePlayer(ws, player, payload, stats) {
  if (player.mode !== 'walk') return;

  const s = decodePlayerState(new DataView(payload), 0);
  stats.stP++;

  dbgIn(player, 'STATE_PLAYER', s);

  if (validatePlayerState(player, s.x, s.y, s.z)) {
    player.lastPX = s.x; player.lastPY = s.y; player.lastPZ = s.z;
    player.x = s.x; player.y = s.y; player.z = s.z;
    player.yaw = s.yaw;
    player.hp = s.hp;
    player.alive = s.alive;
    player.hasPlayerState = true;
    player.validationFails = 0;
  } else {
    stats.fail++;
    player.validationFails++;
    log('VALIDATE-FAIL-PLAYER', `P${player.id} dist=${Math.hypot(s.x - player.lastPX, s.y - player.lastPY, s.z - player.lastPZ).toFixed(2)} fails=${player.validationFails}`);
    dbgValidate(player, 'STATE_PLAYER', false,
      `pos=(${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}) last=(${player.lastPX.toFixed(2)},${player.lastPY.toFixed(2)},${player.lastPZ.toFixed(2)})`);
    if (player.validationFails > SERVER_CONFIG.MAX_VALIDATION_FAILS) {
      log('KICK', `P${player.id} too many validation fails (player), last pos=(${s.x},${s.y},${s.z})`);
      stats.kicks++;
      try { ws.send(JSON.stringify({ type: 'kick', reason: 'validation_player' })); } catch {}
      ws.close();
    }
  }
}

export function handleStateDrone(ws, player, payload, stats) {
  if (player.mode !== 'fpv') return;

  const s = decodeDroneState(new DataView(payload), 0);
  stats.stD++;

  dbgIn(player, 'STATE_DRONE', s);

  if (validateDroneState(player, s.x, s.y, s.z)) {
    player.lastDX = s.x; player.lastDY = s.y; player.lastDZ = s.z;
    player.drone.x = s.x; player.drone.y = s.y; player.drone.z = s.z;
    player.drone.qx = s.qx; player.drone.qy = s.qy;
    player.drone.qz = s.qz; player.drone.qw = s.qw;
    player.drone.crashed = s.crashed;
    player.drone.rpm = s.rpm;
    player.hasDroneState = true;
    player.validationFails = 0;
  } else {
    stats.fail++;
    player.validationFails++;
    log('VALIDATE-FAIL-DRONE', `P${player.id} dist=${Math.hypot(s.x - player.lastDX, s.y - player.lastDY, s.z - player.lastDZ).toFixed(2)} fails=${player.validationFails}`);
    dbgValidate(player, 'STATE_DRONE', false,
      `pos=(${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}) last=(${player.lastDX.toFixed(2)},${player.lastDY.toFixed(2)},${player.lastDZ.toFixed(2)})`);
    if (player.validationFails > SERVER_CONFIG.MAX_VALIDATION_FAILS) {
      log('KICK', `P${player.id} too many validation fails (drone), last pos=(${s.x},${s.y},${s.z})`);
      stats.kicks++;
      try { ws.send(JSON.stringify({ type: 'kick', reason: 'validation_drone' })); } catch {}
      ws.close();
    }
  }
}

export function handleStateCar(ws, player, payload, stats, room) {
  if (player.mode !== 'car') return;

  const dv = new DataView(payload);
  const id = dv.getUint32(0, true);
  if (id !== player.id) return;

  const x = dv.getFloat32(4, true);
  const y = dv.getFloat32(8, true);
  const z = dv.getFloat32(12, true);
  const yaw = dv.getFloat32(16, true);
  const hp = dv.getUint8(20);
  const colorIdx = dv.getUint8(21);

  stats.stC = (stats.stC || 0) + 1;

  dbgIn(player, 'STATE_CAR', { x, y, z, yaw, hp });

  if (!isFinite(x) || !isFinite(y) || !isFinite(z) || !isFinite(yaw)) {
    stats.fail++;
    log('VALIDATE-FAIL-CAR', `P${player.id} NaN pos=(${x},${y},${z},${yaw})`);
    return;
  }

  const dx = x - player.lastCarX;
  const dy = y - player.lastCarY;
  const dz = z - player.lastCarZ;
  const maxDistSq = 500 * 500;
  if (dx * dx + dy * dy + dz * dz > maxDistSq) {
    stats.fail++;
    player.validationFails++;
    log('VALIDATE-FAIL-CAR', `P${player.id} dist=${Math.hypot(dx, dy, dz).toFixed(2)} fails=${player.validationFails}`);
    dbgValidate(player, 'STATE_CAR', false,
      `pos=(${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}) last=(${player.lastCarX.toFixed(2)},${player.lastCarY.toFixed(2)},${player.lastCarZ.toFixed(2)})`);
    if (player.validationFails > SERVER_CONFIG.MAX_VALIDATION_FAILS) {
      log('KICK', `P${player.id} too many validation fails (car)`);
      stats.kicks++;
      try { ws.send(JSON.stringify({ type: 'kick', reason: 'validation_car' })); } catch {}
      ws.close();
    }
    return;
  }

  player.lastCarX = x;
  player.lastCarY = y;
  player.lastCarZ = z;
  player.car.x = x;
  player.car.y = y;
  player.car.z = z;
  player.car.yaw = yaw;
  player.car.hp = hp;
  player.car.colorIdx = colorIdx;
  player.car.alive = hp > 0;
  player.hasCar = true;
  player.validationFails = 0;

  if (Math.abs(dx) < 0.01 && Math.abs(dz) < 0.01) {
    player.carIdleSince = player.carIdleSince || Date.now();
  } else {
    player.carIdleSince = 0;
  }
}

export function handleEventCrash(player, room, rawData, payload, stats) {
  const ev = decodeEventCrash(payload);
  stats.crash++;

  dbgIn(player, 'EVENT_CRASH', ev);

  if (!validateCrash(player, ev.x, player.drone.y, ev.z)) {
    stats.fail++;
    log('VALIDATE-FAIL-CRASH', `P${player.id} dist=${Math.hypot(ev.x - player.drone.x, ev.z - player.drone.z).toFixed(2)}`);
    dbgValidate(player, 'EVENT_CRASH', false,
      `crash=(${ev.x.toFixed(2)},${ev.z.toFixed(2)}) drone=(${player.drone.x.toFixed(2)},${player.drone.y.toFixed(2)},${player.drone.z.toFixed(2)})`);
    return;
  }

  player.drone.x = ev.x;
  player.drone.z = ev.z;
  player.drone.crashed = true;
  player.lastDX = ev.x;
  player.lastDZ = ev.z;

  room.broadcastBinary(rawData, null);
  log('CRASH', `P${player.id} at (${ev.x.toFixed(1)}, ${ev.z.toFixed(1)})`);
}

export function handleEventHit(player, room, rawData, payload, stats) {
  const ev = decodeEventHit(payload);
  stats.hit++;

  dbgIn(player, 'EVENT_HIT', ev);

  const victim = room.get(ev.victimId);
  if (!victim || !validateHit(player, victim, ev.damage)) {
    stats.fail++;
    log('VALIDATE-FAIL-HIT', `P${player.id} → P${ev.victimId} dmg=${ev.damage}`);
    dbgValidate(player, 'EVENT_HIT', false,
      `victim=P${ev.victimId} dmg=${ev.damage} exists=${!!victim}`);
    return;
  }

  victim.hp = Math.max(0, victim.hp - ev.damage);
  if (victim.hp <= 0) victim.alive = false;

  room.broadcastBinary(rawData, null);
  log('HIT', `P${player.id} → P${victim.id} dmg=${ev.damage} hp=${victim.hp}`);
}