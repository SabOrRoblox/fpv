import { MSG, buildSnapshot, wrapBinary, droneIdToIndex } from '../shared/net/protocol.js';

export function createSnapshotModule(roomManager, stats) {
  function tick() {
    for (const room of roomManager.rooms.values()) {
      const players = [];
      const drones = [];
      const cars = [];

      for (const p of room.players.values()) {
        if (p.mode === 'walk') {
          players.push({
            id: p.id,
            x: p.hasPlayerState ? p.x : 0,
            y: p.hasPlayerState ? p.y : 0,
            z: p.hasPlayerState ? p.z : 0,
            yaw: p.yaw,
            hp: p.hp,
            alive: p.alive,
          });
        }
        if (p.mode === 'fpv' && p.drone) {
          drones.push({
            id: p.id,
            x: p.drone.x, y: p.drone.y, z: p.drone.z,
            qx: p.drone.qx, qy: p.drone.qy, qz: p.drone.qz, qw: p.drone.qw,
            crashed: p.drone.crashed,
            rpm: p.drone.rpm || 0,
            droneIdx: droneIdToIndex(p.droneId),
          });
        }
        if (p.mode === 'car' && p.car) {
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
    }
  }

  return { tick };
}