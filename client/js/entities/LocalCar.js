import * as THREE from 'three';
import { CFG } from '../../../shared/config/config.js';
import { CarPhysics } from '../../../shared/physics/carPhysics.js';
import { CarWheelAnimator } from '../render/carWheelAnimator.js';

export class LocalCar {
  constructor(scene, gltf) {
    this.physics = new CarPhysics(CFG);
    this.group = new THREE.Group();
    this.model = null;
    this.wheels = null;
    this._gltf = null;
    this._baseScale = 1;
    this._interpPos = new THREE.Vector3();

    if (gltf && gltf.scene) this._loadModel(gltf);
    scene.add(this.group);
    this.physics.reset({ x: 0, y: 0, z: 0 }, 0);
  }

  _loadModel(gltf) {
    if (this.model) {
      this.model.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
      this.group.remove(this.model);
    }

    this._gltf = gltf;
    this.model = gltf.scene.clone(true);

    const box = new THREE.Box3().setFromObject(this.model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 7.5;
    this._baseScale = maxDim > 0 ? targetSize / maxDim : 1;
    this.model.scale.setScalar(this._baseScale);

    const center = new THREE.Vector3();
    box.getCenter(center);
    this.model.position.set(
      -center.x * this._baseScale,
      -center.y * this._baseScale,
      -center.z * this._baseScale
    );

    this.group.add(this.model);
    this.wheels = new CarWheelAnimator(this.model);
  }

  setModel(gltf) {
    if (gltf && gltf.scene) this._loadModel(gltf);
  }

  spawn(collisionWorld, x, z, yaw = 0) {
    let y = 0;
    if (collisionWorld && collisionWorld.isReady()) {
      const gY = collisionWorld.raycastDown(x, z, 500, -50);
      if (gY !== null) y = gY + this.physics.params.GROUND_OFFSET;
    }
    this.physics.groundY = y;
    this.physics.reset({ x, y, z }, yaw);
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw;
  }

  update(dt, input, collisionWorld) {
    this.physics.step(dt, input);

    if (collisionWorld && collisionWorld.isReady()) {
      const px = this.physics.position.x;
      const pz = this.physics.position.z;
      const py = this.physics.position.y;

      const fromY = py + 1.0;
      const toY = py - 50.0;
      const gY = collisionWorld.raycastDown(px, pz, fromY, toY);
      if (gY !== null) {
        this.physics.groundY = gY;
      }

      let floorY = this.physics.groundY + this.physics.params.GROUND_OFFSET;
      if (this.physics.position.y < floorY) {
        this.physics.position.y = floorY;
        if (this.physics.velocity.y < 0) this.physics.velocity.y = 0;
      }

      if (Math.abs(this.physics.speed) > 0.1) {
        collisionWorld.resolvePlayer(
          this.physics.position,
          this.physics.velocity,
          2.2,
          dt
        );
        collisionWorld.resolvePlayer(
          this.physics.position,
          this.physics.velocity,
          2.2,
          dt
        );

        const velMag = Math.hypot(this.physics.velocity.x, this.physics.velocity.z);
        const physSpeed = Math.abs(this.physics.speed);
        if (physSpeed > 0.5 && velMag < physSpeed * 0.5) {
          this.physics.speed *= 0.5;
        }
      }

      floorY = this.physics.groundY + this.physics.params.GROUND_OFFSET;
      if (this.physics.position.y < floorY) {
        this.physics.position.y = floorY;
        if (this.physics.velocity.y < 0) this.physics.velocity.y = 0;
      }
    }

    if (this.wheels) {
      this.wheels.update(dt, this.physics.speed);
    }
  }

  render(alpha) {
    this.physics.getInterpolatedPosition(alpha, this._interpPos);
    this.group.position.copy(this._interpPos);
    this.group.rotation.y = this.physics.getInterpolatedYaw(alpha);
  }

  get position() { return this.physics.position; }
  get yaw() { return this.physics.yaw; }
  get hp() { return this.physics.hp; }
  get alive() { return this.physics.alive; }
}