import * as THREE from 'three';
import { PlayerPhysics } from '../../../shared/physics/playerPhysics.js';
import { CFG } from '../../../shared/config/config.js';

const SCALE = 4.0;

export class LocalPlayer {
  constructor(scene, gltf) {
    this.physics = new PlayerPhysics();
    this.group = new THREE.Group();
    this.animPhase = 0;

    this.prevPos = new THREE.Vector3();
    this.currPos = new THREE.Vector3();

    this.body = null;
    this.head = null;
    this.legL = null;
    this.legR = null;
    this.armL = null;
    this.armR = null;

    if (gltf && gltf.scene) {
      const model = gltf.scene.clone(true);
      model.traverse((obj) => {
        const n = obj.name ? obj.name.toLowerCase() : '';
        if (n === 'leg1') this.legL = obj;
        else if (n === 'leg2') this.legR = obj;
        else if (n === 'arm1') this.armL = obj;
        else if (n === 'arm2') this.armR = obj;
        else if (n === 'body') this.body = obj;
        else if (n === 'head') this.head = obj;
      });
      this.group.add(model);
    }

    this.group.scale.setScalar(SCALE);
    scene.add(this.group);
  }

  spawn(collisionWorld, x, z, yaw = 0) {
    let y = 0;
    if (collisionWorld && collisionWorld.isReady()) {
      const gY = collisionWorld.raycastDown(x, z, 10000, -10000);
      if (gY !== null) y = gY + 0.1;
    }
    this.physics.reset({ x, y, z }, yaw);
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    this.prevPos.set(x, y, z);
    this.currPos.set(x, y, z);
    this.animPhase = 0;
  }

  update(dt, input, camYaw, collisionWorld) {
    this.prevPos.copy(this.currPos);

    const mx = input.moveX;
    const my = input.moveY;
    const forwardX = Math.sin(camYaw);
    const forwardZ = Math.cos(camYaw);
    const rightX = -Math.cos(camYaw);
    const rightZ = Math.sin(camYaw);
    const worldMoveX = mx * rightX + my * forwardX;
    const worldMoveZ = mx * rightZ + my * forwardZ;

    const inLen = Math.hypot(worldMoveX, worldMoveZ);
    const isMoving = inLen > 0.15;

    if (this.physics.alive && isMoving) {
      const targetYaw = Math.atan2(worldMoveX, worldMoveZ);
      let diff = targetYaw - this.physics.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turnK = 1 - Math.exp(-CFG.PLAYER_TURN_SPEED * dt);
      this.physics.yaw += diff * turnK;
    }

    this.physics.step(dt, worldMoveX, worldMoveZ, CFG.PLAYER_SPEED, CFG.PLAYER_ACCEL, CFG.GRAVITY);

    if (collisionWorld && collisionWorld.isReady()) {
      const gY = collisionWorld.raycastDown(
        this.physics.position.x,
        this.physics.position.z,
        10000, -10000
      );
      if (gY !== null) {
        const minY = gY + 0.1;
        if (this.physics.position.y < minY) {
          this.physics.position.y = minY;
          if (this.physics.velocity.y < 0) this.physics.velocity.y = 0;
        }
      }
      collisionWorld.resolvePlayer(this.physics.position, this.physics.velocity, this.physics.radius, dt);
    }

    if (this.physics.position.y < -50) {
      this.physics.position.y = 0;
      this.physics.velocity.x = 0;
      this.physics.velocity.y = 0;
      this.physics.velocity.z = 0;
    }

    this.currPos.set(this.physics.position.x, this.physics.position.y, this.physics.position.z);
    this.group.rotation.y = this.physics.yaw;
    this._animate(dt, isMoving ? inLen : 0);
  }

  render(alpha) {
    this.group.position.set(
      this.prevPos.x + (this.currPos.x - this.prevPos.x) * alpha,
      this.prevPos.y + (this.currPos.y - this.prevPos.y) * alpha,
      this.prevPos.z + (this.currPos.z - this.prevPos.z) * alpha
    );
  }

  _animate(dt, moveIntensity) {
    if (moveIntensity > 0.15) {
      this.animPhase += dt * CFG.PLAYER_ANIM_FREQ * moveIntensity;
    } else {
      this.animPhase *= Math.exp(-6 * dt);
    }
    const swing = Math.sin(this.animPhase) * 0.7 * Math.min(1, moveIntensity);
    if (this.legL) this.legL.rotation.x = swing;
    if (this.legR) this.legR.rotation.x = -swing;
    if (this.armL) this.armL.rotation.x = -swing;
    if (this.armR) this.armR.rotation.x = swing;
    const bob = Math.abs(Math.sin(this.animPhase)) * 0.04 * moveIntensity;
    if (this.body) this.body.position.y = 1.05 + bob;
    if (this.head) this.head.position.y = 1.6 + bob;
  }

  get position() { return this.physics.position; }
  get yaw() { return this.physics.yaw; }
  get alive() { return this.physics.alive; }
}