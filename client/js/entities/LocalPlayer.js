import * as THREE from 'three';
import { PlayerPhysics } from '../../../shared/physics/playerPhysics.js';
import { CFG } from '../../../shared/config/config.js';

const SCALE = 4.0;
const CAPSULE_RADIUS = 0.4;
const CAPSULE_HEIGHT = 1.8;

export class LocalPlayer {
  constructor(scene, gltf) {
    this.physics = new PlayerPhysics();
    this.group = new THREE.Group();
    this.animPhase = 0;
    this._cachedGY = null;
    this._cachedGYX = 0;
    this._cachedGYZ = 0;

    this.prevPos = new THREE.Vector3();
    this.currPos = new THREE.Vector3();

    this.body = null;
    this.head = null;
    this.legL = null;
    this.legR = null;
    this.armL = null;
    this.armR = null;
    this.legLPivot = null;
    this.legRPivot = null;
    this.armLPivot = null;
    this.armRPivot = null;

    if (gltf && gltf.scene) {
      this._loadModel(gltf);
    }

    this.group.scale.setScalar(SCALE);
    scene.add(this.group);
  }

  _loadModel(gltf) {
    const model = gltf.scene.clone(true);
    this.group.add(model);

    let legLRaw = null, legRRaw = null;
    let armLRaw = null, armRRaw = null;

    model.traverse((obj) => {
      const n = obj.name ? obj.name.toLowerCase() : '';
      if (n === 'leg1') legLRaw = obj;
      else if (n === 'leg2') legRRaw = obj;
      else if (n === 'arm1') armLRaw = obj;
      else if (n === 'arm2') armRRaw = obj;
      else if (n === 'body') this.body = obj;
      else if (n === 'head') this.head = obj;
    });

    this.legL = legLRaw;
    this.legR = legRRaw;
    this.armL = armLRaw;
    this.armR = armRRaw;

    if (legLRaw) this.legLPivot = this._makeTopPivot(legLRaw);
    if (legRRaw) this.legRPivot = this._makeTopPivot(legRRaw);
    if (armLRaw) this.armLPivot = this._makeTopPivot(armLRaw);
    if (armRRaw) this.armRPivot = this._makeTopPivot(armRRaw);
  }

  _makeTopPivot(obj) {
    const parent = obj.parent;
    if (!parent) return null;

    parent.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const pivotWorld = new THREE.Vector3(center.x, box.max.y, center.z);
    const parentWorldInv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
    const pivotLocal = pivotWorld.clone().applyMatrix4(parentWorldInv);

    const pivot = new THREE.Group();
    pivot.name = (obj.name || 'limb') + '_pivot';
    pivot.position.copy(pivotLocal);
    parent.add(pivot);

    const objWorldPos = new THREE.Vector3();
    obj.getWorldPosition(objWorldPos);

    parent.remove(obj);
    pivot.add(obj);

    const objWorldPos2 = new THREE.Vector3();
    obj.getWorldPosition(objWorldPos2);

    obj.position.x += objWorldPos.x - objWorldPos2.x;
    obj.position.y += objWorldPos.y - objWorldPos2.y;
    obj.position.z += objWorldPos.z - objWorldPos2.z;

    return pivot;
  }

  spawn(collisionWorld, x, z, yaw = 0) {
    let y = 0;
    if (collisionWorld && collisionWorld.isReady()) {
      const gY = collisionWorld.raycastDown(x, z, 500, -50);
      if (gY !== null) y = gY + 0.1;
    }
    this.physics.reset({ x, y, z }, yaw);
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
    this.prevPos.set(x, y, z);
    this.currPos.set(x, y, z);
    this.animPhase = 0;
    this._cachedGY = null;
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
      collisionWorld.resolvePlayerCapsule(
        this.physics.position,
        this.physics.velocity,
        CAPSULE_RADIUS,
        CAPSULE_HEIGHT,
        dt
      );

      const px = this.physics.position.x;
      const pz = this.physics.position.z;
      const py = this.physics.position.y;

      const dxc = Math.abs(px - this._cachedGYX);
      const dzc = Math.abs(pz - this._cachedGYZ);

      const fromY = py + 1.5;
      const toY = py - 50.0;

      if (this._cachedGY === null || dxc > 0.4 || dzc > 0.4) {
        this._cachedGY = collisionWorld.raycastDown(px, pz, fromY, toY);
        this._cachedGYX = px;
        this._cachedGYZ = pz;
      }

      const gY = this._cachedGY;
      if (gY !== null) {
        const minY = gY + 0.1;
        if (this.physics.position.y < minY) {
          this.physics.position.y = minY;
          if (this.physics.velocity.y < 0) this.physics.velocity.y = 0;
        }
      }
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
    if (this.legLPivot) this.legLPivot.rotation.x = swing;
    if (this.legRPivot) this.legRPivot.rotation.x = -swing;
    if (this.armLPivot) this.armLPivot.rotation.x = -swing;
    if (this.armRPivot) this.armRPivot.rotation.x = swing;
  }

  get position() { return this.physics.position; }
  get yaw() { return this.physics.yaw; }
  get alive() { return this.physics.alive; }
}