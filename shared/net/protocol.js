export const MSG = {
  JOIN: 1, WELCOME: 2, PLAYER_LIST: 3, PLAYER_LEAVE: 4,
  PING: 5, PONG: 6,
  STATE_PLAYER: 7, STATE_DRONE: 8,
  EVENT_CRASH: 9, EVENT_HIT: 10,
  ROOM_STATE: 11, VALIDATION_FAIL: 12, SNAPSHOT: 13,
  STATE_CAR: 14,
};

export const PLAYER_STATE_SIZE = 22;
export const DRONE_STATE_SIZE = 28;
export const CAR_STATE_SIZE = 22;
export const EVENT_CRASH_SIZE = 12;
export const EVENT_HIT_SIZE = 8;

export const DRONE_IDS = ['dron1', 'dron2', 'dron3', 'dron4'];

export function droneIdToIndex(id) {
  const i = DRONE_IDS.indexOf(id);
  return i >= 0 ? i : 0;
}

export function droneIndexToId(idx) {
  return DRONE_IDS[idx] || 'dron1';
}

const QSCALE = 32767;
const MAX_COUNT = 255;

function clampQ(v) {
  if (!isFinite(v)) return 0;
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

export function wrapBinary(msgType, payloadBuffer) {
  const src = new Uint8Array(payloadBuffer);
  const out = new Uint8Array(1 + src.byteLength);
  out[0] = msgType;
  out.set(src, 1);
  return out.buffer;
}

export function unwrapBinary(buffer) {
  const view = new Uint8Array(buffer);
  const payload = view.subarray(1);
  return {
    type: view[0],
    payload: payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength),
  };
}

export function encodePlayerState(buffer, offset, id, x, y, z, yaw, hp, alive) {
  const dv = new DataView(buffer);
  dv.setUint32(offset, id | 0, true);
  dv.setFloat32(offset + 4, x, true);
  dv.setFloat32(offset + 8, y, true);
  dv.setFloat32(offset + 12, z, true);
  dv.setFloat32(offset + 16, yaw, true);
  dv.setUint8(offset + 20, Math.max(0, Math.min(100, hp | 0)));
  dv.setUint8(offset + 21, alive ? 1 : 0);
}

export function decodePlayerState(dv, offset) {
  return {
    id: dv.getUint32(offset, true),
    x: dv.getFloat32(offset + 4, true),
    y: dv.getFloat32(offset + 8, true),
    z: dv.getFloat32(offset + 12, true),
    yaw: dv.getFloat32(offset + 16, true),
    hp: dv.getUint8(offset + 20),
    alive: dv.getUint8(offset + 21) === 1,
  };
}

export function encodeDroneState(buffer, offset, id, x, y, z, qx, qy, qz, qw, crashed, rpm, droneIdx) {
  const dv = new DataView(buffer);
  dv.setUint32(offset, id | 0, true);
  dv.setFloat32(offset + 4, x, true);
  dv.setFloat32(offset + 8, y, true);
  dv.setFloat32(offset + 12, z, true);
  dv.setInt16(offset + 16, Math.round(clampQ(qx) * QSCALE), true);
  dv.setInt16(offset + 18, Math.round(clampQ(qy) * QSCALE), true);
  dv.setInt16(offset + 20, Math.round(clampQ(qz) * QSCALE), true);
  dv.setInt16(offset + 22, Math.round(clampQ(qw) * QSCALE), true);
  dv.setUint8(offset + 24, crashed ? 1 : 0);
  dv.setUint16(offset + 25, Math.max(0, Math.min(65535, rpm | 0)), true);
  dv.setUint8(offset + 27, (droneIdx | 0) & 0xff);
}

export function decodeDroneState(dv, offset) {
  let qx = dv.getInt16(offset + 16, true) / QSCALE;
  let qy = dv.getInt16(offset + 18, true) / QSCALE;
  let qz = dv.getInt16(offset + 20, true) / QSCALE;
  let qw = dv.getInt16(offset + 22, true) / QSCALE;
  const l = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (l < 1e-6) { qx = 0; qy = 0; qz = 0; qw = 1; }
  else { qx /= l; qy /= l; qz /= l; qw /= l; }
  return {
    id: dv.getUint32(offset, true),
    x: dv.getFloat32(offset + 4, true),
    y: dv.getFloat32(offset + 8, true),
    z: dv.getFloat32(offset + 12, true),
    qx, qy, qz, qw,
    crashed: dv.getUint8(offset + 24) === 1,
    rpm: dv.getUint16(offset + 25, true),
    droneIdx: dv.getUint8(offset + 27),
  };
}

export function encodeCarState(buffer, offset, id, x, y, z, yaw, hp, colorIdx) {
  const dv = new DataView(buffer);
  dv.setUint32(offset, id | 0, true);
  dv.setFloat32(offset + 4, x, true);
  dv.setFloat32(offset + 8, y, true);
  dv.setFloat32(offset + 12, z, true);
  dv.setFloat32(offset + 16, yaw, true);
  dv.setUint8(offset + 20, Math.max(0, Math.min(255, hp | 0)));
  dv.setUint8(offset + 21, (colorIdx | 0) & 0xff);
}

export function decodeCarState(dv, offset) {
  return {
    id: dv.getUint32(offset, true),
    x: dv.getFloat32(offset + 4, true),
    y: dv.getFloat32(offset + 8, true),
    z: dv.getFloat32(offset + 12, true),
    yaw: dv.getFloat32(offset + 16, true),
    hp: dv.getUint8(offset + 20),
    colorIdx: dv.getUint8(offset + 21),
  };
}

export function buildSnapshot(players, drones, cars) {
  const pc = Math.min(players.length, MAX_COUNT);
  const dc = Math.min(drones.length, MAX_COUNT);
  const cc = Math.min(cars ? cars.length : 0, MAX_COUNT);
  const size = 3 + pc * PLAYER_STATE_SIZE + dc * DRONE_STATE_SIZE + cc * CAR_STATE_SIZE;
  const buffer = new ArrayBuffer(size);
  const dv = new DataView(buffer);
  dv.setUint8(0, pc);
  dv.setUint8(1, dc);
  dv.setUint8(2, cc);
  let offset = 3;
  for (let i = 0; i < pc; i++) {
    const p = players[i];
    encodePlayerState(buffer, offset, p.id, p.x, p.y, p.z, p.yaw, p.hp, p.alive);
    offset += PLAYER_STATE_SIZE;
  }
  for (let i = 0; i < dc; i++) {
    const d = drones[i];
    const idx = typeof d.droneIdx === 'number' ? d.droneIdx : 0;
    encodeDroneState(
      buffer, offset,
      d.id, d.x, d.y, d.z,
      d.qx, d.qy, d.qz, d.qw,
      d.crashed, d.rpm || 0, idx
    );
    offset += DRONE_STATE_SIZE;
  }
  for (let i = 0; i < cc; i++) {
    const c = cars[i];
    encodeCarState(
      buffer, offset,
      c.id, c.x, c.y, c.z, c.yaw,
      c.hp !== undefined ? c.hp : 200,
      c.colorIdx || 0
    );
    offset += CAR_STATE_SIZE;
  }
  return buffer;
}

export function parseSnapshot(buffer) {
  const dv = new DataView(buffer);
  const pc = dv.getUint8(0);
  const dc = dv.getUint8(1);
  const cc = dv.getUint8(2);
  const players = [];
  const drones = [];
  const cars = [];
  let offset = 3;
  for (let i = 0; i < pc; i++) {
    players.push(decodePlayerState(dv, offset));
    offset += PLAYER_STATE_SIZE;
  }
  for (let i = 0; i < dc; i++) {
    drones.push(decodeDroneState(dv, offset));
    offset += DRONE_STATE_SIZE;
  }
  for (let i = 0; i < cc; i++) {
    cars.push(decodeCarState(dv, offset));
    offset += CAR_STATE_SIZE;
  }
  return { players, drones, cars };
}

export function encodeEventCrash(buffer, id, x, z) {
  const dv = new DataView(buffer);
  dv.setUint32(0, id | 0, true);
  dv.setFloat32(4, x, true);
  dv.setFloat32(8, z, true);
}

export function decodeEventCrash(buffer) {
  const dv = new DataView(buffer);
  return {
    id: dv.getUint32(0, true),
    x: dv.getFloat32(4, true),
    z: dv.getFloat32(8, true),
  };
}

export function encodeEventHit(buffer, victimId, damage) {
  const dv = new DataView(buffer);
  dv.setUint32(0, victimId | 0, true);
  dv.setFloat32(4, damage, true);
}

export function decodeEventHit(buffer) {
  const dv = new DataView(buffer);
  return {
    victimId: dv.getUint32(0, true),
    damage: dv.getFloat32(4, true),
  };
}