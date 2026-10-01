import { SERVER_CONFIG } from './config.js';
import { log } from './log.js';
import { dbgEnterDrone, dbgExitDrone } from './core/debug.js';

function sendJSON(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

export function handleEnterDrone(ws, player, room, msg, spawnZones) {
  if (player.mode === 'fpv') return;

  const checkX = typeof msg.dx === 'number' ? msg.dx : player.x;
  const checkZ = typeof msg.dz === 'number' ? msg.dz : player.z;

  if (Array.isArray(spawnZones) && spawnZones.length > 0) {
    for (const z of spawnZones) {
      if (z.team === player.team) continue;
      if (checkX >= z.minX && checkX <= z.maxX && checkZ >= z.minZ && checkZ <= z.maxZ) {
        log('ENTER-DRONE-FAIL',
          `P${player.id}`,
          `in enemy zone ${z.team}`,
          `pos=(${checkX.toFixed(1)},${checkZ.toFixed(1)})`);
        sendJSON(ws, { type: 'error', reason: 'in_spawn_zone' });
        return;
      }
    }
  }

  const requestedDroneId = String(msg.droneId || 'dron1').slice(0, 32);
  const validIds = ['dron1', 'dron2', 'dron3', 'dron4'];
  const finalDroneId = validIds.includes(requestedDroneId) ? requestedDroneId : 'dron1';

  const px = typeof msg.px === 'number' ? msg.px : player.x;
  const pz = typeof msg.pz === 'number' ? msg.pz : player.z;
  player.x = px; player.z = pz;
  player.lastPX = px; player.lastPZ = pz;

  const dx = typeof msg.dx === 'number' ? msg.dx : px;
  const dz = typeof msg.dz === 'number' ? msg.dz : pz;

  const spawn = player.team === 'blue' ? room.spawnBlue : room.spawnRed;
  const padX = spawn.x;
  const padZ = spawn.z;

  const dPadX = px - padX, dPadZ = pz - padZ;
  const dDroneX = px - dx, dDroneZ = pz - dz;
  const distPadSq = dPadX * dPadX + dPadZ * dPadZ;
  const distDroneSq = dDroneX * dDroneX + dDroneZ * dDroneZ;
  const maxSq = SERVER_CONFIG.ENTER_DRONE_MAX_DIST * SERVER_CONFIG.ENTER_DRONE_MAX_DIST;

  if (distPadSq > maxSq && distDroneSq > maxSq) {
    log('ENTER-DRONE-FAIL',
      `P${player.id}`,
      `padDist=${Math.sqrt(distPadSq).toFixed(1)}`,
      `droneDist=${Math.sqrt(distDroneSq).toFixed(1)}`);
    sendJSON(ws, { type: 'error', reason: 'too_far_from_pad' });
    return;
  }

  player.mode = 'fpv';
  player.resetValidation();

  player.droneId = finalDroneId;
  player.drone.x = dx;
  player.drone.y = player.y;
  player.drone.z = dz;
  player.drone.qx = 0;
  player.drone.qy = 0;
  player.drone.qz = 0;
  player.drone.qw = 1;
  player.drone.crashed = false;
  player.drone.rpm = 0;

  player.hasDroneState = true;
  player.lastDX = dx;
  player.lastDY = player.y;
  player.lastDZ = dz;

  sendJSON(ws, { type: 'drone_selected', droneId: player.droneId });
  room.broadcastJSON({
    type: 'mode',
    id: player.id,
    mode: player.mode,
    droneId: player.droneId,
  });

  log('ENTER-DRONE', `P${player.id} → ${finalDroneId}`);
  dbgEnterDrone(player, finalDroneId, player.drone);
}

export function handleExitDrone(ws, player, room) {
  if (player.mode !== 'fpv') return;
  player.mode = 'walk';
  player.resetValidation();
  room.broadcastJSON({ type: 'mode', id: player.id, mode: player.mode });
  log('EXIT-DRONE', `P${player.id}`);
  dbgExitDrone(player);
}

export function handleDroneReset(ws, player, msg) {
  const x = typeof msg.x === 'number' ? msg.x : player.drone.x;
  const y = typeof msg.y === 'number' ? msg.y : player.drone.y;
  const z = typeof msg.z === 'number' ? msg.z : player.drone.z;

  player.resetValidation();

  player.drone.x = x;
  player.drone.y = y;
  player.drone.z = z;
  player.drone.crashed = false;

  player.hasDroneState = true;
  player.lastDX = x;
  player.lastDY = y;
  player.lastDZ = z;
}