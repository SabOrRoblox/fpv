const KMH_TO_MS = 1 / 3.6;

export class CarPhysics {
  constructor(cfg) {
    this.cfg = cfg;
    this.params = {
      MAX_SPEED_KMH: 145,
      MAX_REVERSE_KMH: 30,
      BASE_ACCEL: 14.0,
      ACCEL_FALLOFF: 0.6,
      BRAKE_DECEL: 25.0,
      DRAG: 1.8,
      TURN_RATE_DEG: 75,
      TURN_MIN_SPEED: 2.0,
      TURN_SPEED_FALLOFF: 12.0,
      DRIFT_THRESHOLD: 15.0,
      DRIFT_RATE: 1.2,
      DRIFT_DECAY: 3.0,
      DRIFT_STEER_GAIN: 1.4,
      MASS: 1200,
      WIDTH: 2.2,
      LENGTH: 5.5,
      HEIGHT: 1.6,
      GROUND_OFFSET: 0.05,
      GRAVITY_MULT: 1.0,
      IDLE_DESPAWN: 60.0,
    };

    this.position = { x: 0, y: 0, z: 0 };
    this.prevPosition = { x: 0, y: 0, z: 0 };
    this.currPosition = { x: 0, y: 0, z: 0 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.prevYaw = 0;
    this.currYaw = 0;
    this.driftAngle = 0;
    this.speed = 0;
    this.hp = 200;
    this.maxHp = 200;
    this.alive = true;
    this.driverId = 0;
    this.idleTime = 0;
    this.groundY = 0;
    this._simTime = 0;
    this._braking = false;
  }

  reset(pos, yaw = 0) {
    this.position.x = pos.x;
    this.position.y = pos.y;
    this.position.z = pos.z;
    this.prevPosition.x = pos.x;
    this.prevPosition.y = pos.y;
    this.prevPosition.z = pos.z;
    this.currPosition.x = pos.x;
    this.currPosition.y = pos.y;
    this.currPosition.z = pos.z;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.velocity.z = 0;
    this.yaw = yaw;
    this.prevYaw = yaw;
    this.currYaw = yaw;
    this.driftAngle = 0;
    this.speed = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.idleTime = 0;
    this._simTime = 0;
    this._braking = false;
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  step(dt, input) {
    this.prevPosition.x = this.position.x;
    this.prevPosition.y = this.position.y;
    this.prevPosition.z = this.position.z;
    this.prevYaw = this.yaw;

    this._simTime += dt;

    const p = this.params;
    const maxSpeed = p.MAX_SPEED_KMH * KMH_TO_MS;
    const maxReverse = -p.MAX_REVERSE_KMH * KMH_TO_MS;

    const throttle = input.throttle || 0;
    const steer = input.steer || 0;

    this._braking = false;

    if (!this.alive) {
      this.speed *= Math.max(0, 1 - 4 * dt);
    } else {
      if (throttle > 0.01) {
        const speedRatio = Math.max(0, Math.min(1, this.speed / maxSpeed));
        const falloff = Math.pow(1 - speedRatio, p.ACCEL_FALLOFF);
        const accel = p.BASE_ACCEL * falloff;
        this.speed += accel * throttle * dt;
      } else if (throttle < -0.01) {
        this._braking = true;
        if (this.speed > 0.1) {
          this.speed -= p.BRAKE_DECEL * -throttle * dt;
          if (this.speed < 0) this.speed = 0;
        } else {
          const reverseAccel = p.BASE_ACCEL * 0.5;
          this.speed -= reverseAccel * -throttle * dt;
        }
      } else {
        const dragDecel = p.DRAG * dt;
        if (this.speed > 0) {
          this.speed = Math.max(0, this.speed - dragDecel);
        } else if (this.speed < 0) {
          this.speed = Math.min(0, this.speed + dragDecel);
        }
      }

      this.speed = Math.max(maxReverse, Math.min(maxSpeed, this.speed));
    }

    const absSpeed = Math.abs(this.speed);
    let steerFactor = 0;
    if (absSpeed > 0.05) {
      if (absSpeed < p.TURN_MIN_SPEED) {
        steerFactor = absSpeed / p.TURN_MIN_SPEED;
      } else {
        const overspeed = absSpeed - p.TURN_MIN_SPEED;
        steerFactor = 1 - Math.min(1, overspeed / p.TURN_SPEED_FALLOFF) * 0.55;
      }
      steerFactor *= Math.sign(this.speed);
    }

    if (absSpeed > 0.05 && Math.abs(steer) > 0.01) {
      const turnRate = (p.TURN_RATE_DEG * Math.PI / 180) * steerFactor;
      this.yaw += steer * turnRate * dt;
    }

    if (this._braking && absSpeed > p.DRIFT_THRESHOLD) {
      const driftInput = Math.abs(steer) > 0.05 ? steer : Math.sign(this.driftAngle);
      this.driftAngle += driftInput * p.DRIFT_RATE * p.DRIFT_STEER_GAIN * dt;
    }

    this.driftAngle *= Math.exp(-p.DRIFT_DECAY * dt);

    const maxDrift = 0.9;
    if (this.driftAngle > maxDrift) this.driftAngle = maxDrift;
    if (this.driftAngle < -maxDrift) this.driftAngle = -maxDrift;

    const moveYaw = this.yaw + this.driftAngle;
    const cosYaw = Math.cos(moveYaw);
    const sinYaw = Math.sin(moveYaw);

    this.velocity.x = sinYaw * this.speed;
    this.velocity.z = cosYaw * this.speed;

    this.velocity.y -= this.cfg.GRAVITY * p.GRAVITY_MULT * dt;

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    const floorY = this.groundY + p.GROUND_OFFSET;
    if (this.position.y < floorY) {
      this.position.y = floorY;
      if (this.velocity.y < 0) this.velocity.y = 0;
    }

    if (!isFinite(this.position.x) || !isFinite(this.position.y) || !isFinite(this.position.z)) {
      this.position.x = 0;
      this.position.y = 5;
      this.position.z = 0;
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.velocity.z = 0;
      this.speed = 0;
      this.driftAngle = 0;
    }

    this.currPosition.x = this.position.x;
    this.currPosition.y = this.position.y;
    this.currPosition.z = this.position.z;
    this.currYaw = this.yaw;

    if (Math.abs(throttle) < 0.01 && Math.abs(steer) < 0.01 && absSpeed < 0.1) {
      this.idleTime += dt;
    } else {
      this.idleTime = 0;
    }
  }

  getInterpolatedPosition(alpha, out) {
    out.x = this.prevPosition.x + (this.currPosition.x - this.prevPosition.x) * alpha;
    out.y = this.prevPosition.y + (this.currPosition.y - this.prevPosition.y) * alpha;
    out.z = this.prevPosition.z + (this.currPosition.z - this.prevPosition.z) * alpha;
    return out;
  }

  getInterpolatedYaw(alpha) {
    let dYaw = this.currYaw - this.prevYaw;
    while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
    while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
    return this.prevYaw + dYaw * alpha;
  }

  getSpeedKmh() {
    const s = Math.abs(this.speed) * 3.6;
    return isFinite(s) ? s : 0;
  }
}