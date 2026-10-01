import { MSG, buildSnapshot, wrapBinary, droneIdToIndex } from '../shared/net/protocol.js';

export function createSnapshotModule(roomManager, stats) {
  function tick() {
    for (const room of roomManager.rooms.values()) {
      const players = [];
      const drones = [];
      const cars = [];

      for (const p of room.players.values()) {
        if (p.mode === 'walk' && p.hasPlayerState) {
          players.push({
            id: p.id,
            x: p.x,
            y: p.y,
            z: p.z,
            yaw: p.yaw,
            hp: p.hp,
            alive: p.alive,
          });
        }
        if (p.mode === 'fpv' && p.drone && p.hasDroneState) {
          drones.push({
            id: p.id,
            x: p.drone.x, y: p.drone.y, z: p.drone.z,
            qx: p.drone.qx, qy: p.drone.qy, qz: p.drone.qz, qw: p.drone.qw,
            crashed: p.drone.crashed,
            rpm: p.drone.rpm || 0,
            droneIdx: droneIdToIndex(p.droneId),
          });
        }
        if (p.mode === 'car' && p.car && p.hasCar) {
          cars.push({
            id: p.id,
            x: p.car.x, y: p.car.y, z: p.car.z,
            yaw: p.car.yaw,
            hp: p.car.hp,
            colorIdx: p.car.colorIdx || 0,
          });
        }
      }

      if (players.length === 0 && drones.length === 0 && cars.length === 0) continue;

      const raw = buildSnapshot(players, drones, cars);
      const wrapped = wrapBinary(MSG.SNAPSHOT, raw);
      room.broadcastBinary(wrapped, null);
      stats.snap++;
      stats.snapBytes += wrapped.byteLength;
    }
  }

  return { tick };
}