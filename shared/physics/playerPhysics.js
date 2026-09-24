import { CFG } from '../config/config.js';

export class PlayerPhysics {
  constructor() {
    this.position = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;
    this.radius = 0.5;
    this.invulnTime = 0;
  }

  reset(pos, yaw = 0) {
    this.position.x = pos.x;
    this.position.y = pos.y;
    this.position.z = pos.z;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.yaw = yaw;
    this.hp = this.maxHp;
    this.alive = true;
    this.invulnTime = 0;
  }

  step(dt, moveX, moveZ, speed, accel, gravity) {
    if (this.invulnTime > 0) this.invulnTime -= dt;
    if (!this.alive) return;

    const targetVx = moveX * speed;
    const targetVz = moveZ * speed;
    const k = 1 - Math.exp(-accel * dt);
    this.velocity.x += (targetVx - this.velocity.x) * k;
    this.velocity.z += (targetVz - this.velocity.z) * k;
    this.velocity.y -= gravity * dt;

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    if (this.invulnTime > 0) return false;

    this.hp -= amount;
    this.invulnTime = 0.2;

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  isInRadius(centerPos, radius) {
    const dx = this.position.x - centerPos.x;
    const dy = (this.position.y + CFG.PLAYER_HEAD_HEIGHT) - centerPos.y;
    const dz = this.position.z - centerPos.z;
    return dx * dx + dy * dy + dz * dz <= radius * radius;
  }

  distanceTo(x, y, z) {
    const dx = this.position.x - x;
    const dy = this.position.y - y;
    const dz = this.position.z - z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}