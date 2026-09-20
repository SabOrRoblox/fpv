import { SERVER_CONFIG } from '../config.js';

export class Player {
  constructor(id, ws, name) {
    this.id = id;
    this.ws = ws;
    this.name = name;
    this.roomId = null;
    this.lastSeen = Date.now();

    this.lastPX = 0; this.lastPY = 0; this.lastPZ = 0;
    this.lastDX = 0; this.lastDY = 0; this.lastDZ = 0;
    this.hasPlayerState = false;
    this.hasDroneState = false;

    this.x = 0; this.y = 0; this.z = 0;
    this.yaw = 0;
    this.hp = 100;
    this.alive = true;
    this.team = null;

    this.drone = {
      x: 0, y: 0, z: 0,
      qx: 0, qy: 0, qz: 0, qw: 1,
      crashed: false,
      rpm: 0,
    };
    this.droneId = 'dron1';
    this.mode = 'walk';
    this.crashed = false;
    this.validationFails = 0;

    this.pktCount = 0;
    this.pktReset = Date.now();
  }

  touch() { this.lastSeen = Date.now(); }
  isTimedOut() { return Date.now() - this.lastSeen > SERVER_CONFIG.PLAYER_TIMEOUT_MS; }

  checkRate() {
    const now = Date.now();
    if (now - this.pktReset > SERVER_CONFIG.RATE_WINDOW_MS) {
      this.pktCount = 0;
      this.pktReset = now;
    }
    this.pktCount++;
    return this.pktCount <= SERVER_CONFIG.MAX_PACKETS_PER_SEC;
  }

  resetValidation() { this.validationFails = 0; }
}