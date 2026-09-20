import {
  MSG, decodePlayerState, decodeDroneState,
  decodeEventCrash, decodeEventHit,
} from '../shared/net/protocol.js';
import { validatePlayerState, validateDroneState } from './validation/movementValidator.js';
import { validateCrash } from './validation/crashValidator.js';
import { validateHit } from './validation/hitValidator.js';
import { SERVER_CONFIG } from './config.js';
import { log } from './log.js';

export function handleStatePlayer(ws, player, payload, stats) {
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
    if (player.validationFails > SERVER_CONFIG.MAX_VALIDATION_FAILS) {
      log('KICK', `P${player.id} too many validation fails (player)`);
      stats.kicks++;
      ws.close();
    }
  }
}

export function handleStateDrone(ws, player, payload, stats) {
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
    if (player.validationFails > SERVER_CONFIG.MAX_VALIDATION_FAILS) {
      log('KICK', `P${player.id} too many validation fails (drone)`);
      stats.kicks++;
      ws.close();
    }
  }
}

export function handleEventCrash(player, room, rawData, payload, stats) {
  const ev = decodeEventCrash(payload);
  stats.crash++;

  if (!validateCrash(player, ev.x, 0, ev.z)) {
    stats.fail++;
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

  const victim = room.get(ev.victimId);
  if (!victim || !validateHit(player, victim, ev.damage)) {
    stats.fail++;
    return;
  }

  victim.hp = Math.max(0, victim.hp - ev.damage);
  if (victim.hp <= 0) victim.alive = false;

  room.broadcastBinary(rawData, null);
  log('HIT', `P${player.id} → P${victim.id} dmg=${ev.damage} hp=${victim.hp}`);
}