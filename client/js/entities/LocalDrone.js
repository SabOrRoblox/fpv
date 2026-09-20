import * as THREE from 'three';
import { CFG } from '../../../shared/config/config.js';
import { DronePhysics } from '../../../shared/physics/dronePhysics.js';
import { PropellerAnimator } from '../render/propellerAnimator.js';

export class LocalDrone {
  constructor(scene, gltf, audioManager) {
    this.physics = new DronePhysics(CFG);
    this.group = new THREE.Group();
    this.piloted = false;
    this.audio = audioManager;
    this.model = null;
    this.props = null;
    this.targetSize = 10.0;
    this.scene = scene;
    this.droneId = 'dron1';
    this._gltf = null;
    this._baseScale = 1;

    this.battery = 100;
    this._lastBeepTimer = 0;

    this._interpPos = new THREE.Vector3();
    this._interpQuat = new THREE.Quaternion();

    if (gltf && gltf.scene) this._loadModel(gltf);
    scene.add(this.group);
    this.resetToPos(null, { x: 0, y: 0, z: 0 }, 0);
  }

  get params() { return this.physics.params; }

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
    this._baseScale = maxDim > 0 ? this.targetSize / maxDim : 1;
    this.model.scale.setScalar(this._baseScale);

    const center = new THREE.Vector3();
    box.getCenter(center);
    this.model.position.set(-center.x * this._baseScale, -center.y * this._baseScale, -center.z * this._baseScale);
    this.model.rotation.y = THREE.MathUtils.degToRad(CFG.DRONE_MODEL_YAW_OFFSET_DEG);

    this.group.add(this.model);
    this.props = new PropellerAnimator(this.model);
  }

  setModel(gltf) {
    if (gltf && gltf.scene) this._loadModel(gltf);
  }

  setParams(params) {
    this.physics.setParams(params);
  }

  setTargetSize(size) {
    this.targetSize = size;
    if (!this.model || !this._gltf) return;
    const box = new THREE.Box3().setFromObject(this._gltf.scene);
    const s = new THREE.Vector3();
    box.getSize(s);
    const maxDim = Math.max(s.x, s.y, s.z);
    this._baseScale = maxDim > 0 ? size / maxDim : 1;
    this.model.scale.setScalar(this._baseScale);
    const center = new THREE.Vector3();
    box.getCenter(center);
    this.model.position.set(-center.x * this._baseScale, -center.y * this._baseScale, -center.z * this._baseScale);
  }

  resetToPos(collisionWorld, pos, yaw = 0) {
    let y = pos.y;
    let gY = 0;
    if (collisionWorld && collisionWorld.isReady()) {
      const h = collisionWorld.raycastDown(pos.x, pos.z, 10000, -10000);
      if (h !== null) {
        gY = h;
        y = h + CFG.DRONE_RADIUS + 0.02;
      }
    }
    this.physics.reset({ x: pos.x, y, z: pos.z }, yaw);
    this.physics.groundY = gY;
    this.battery = 100;
    this._sync();
  }

  spawnAheadOf(collisionWorld, playerPos, playerYaw) {
    const d = CFG.DRONE_SPAWN_AHEAD;
    const x = playerPos.x + Math.sin(playerYaw) * d;
    const z = playerPos.z + Math.cos(playerYaw) * d;
    this.resetToPos(collisionWorld, { x, y: 0, z }, playerYaw);
  }

  update(dt, input, collisionWorld) {
    this.physics.piloted = this.piloted;
    this.physics.step(dt, input);

    if (collisionWorld && collisionWorld.isReady()) {
      const gY = collisionWorld.raycastDown(
        this.physics.position.x,
        this.physics.position.z,
        10000, -10000
      );
      if (gY !== null) {
        const maxRise = this.physics.position.y + CFG.DRONE_RADIUS;
        if (gY <= maxRise) this.physics.groundY = gY;
      }

      if (!this.physics.crashed) {
        const airHeight = this.physics.position.y - (this.physics.groundY + CFG.DRONE_RADIUS);
        if (airHeight > CFG.DRONE_RADIUS * 3) {
          const impact = collisionWorld.raycastSphere(
            this.physics.position,
            CFG.DRONE_RADIUS,
            this.physics.velocity
          );
          if (impact > CFG.DRONE_CRASH_SPEED * 2) this.physics.crashed = true;
        }
      }
    }

    const p = this.params;
    const rpmNorm = this.physics.rpm / (p.MAX_RPM || 26000);

    if (this.piloted && !this.physics.crashed && this.battery > 0) {
      let drain = p.BATTERY_DRAIN_IDLE;
      if (rpmNorm > 0.6) drain = p.BATTERY_DRAIN_FULL;
      else if (rpmNorm > 0.1) drain = p.BATTERY_DRAIN_HOVER;
      this.battery = Math.max(0, this.battery - drain * dt);
    }

    if (this.battery <= 0 && this.piloted) {
      this.physics.armed = false;
      this.physics.piloted = false;
      this.piloted = false;
    }

    if (this.piloted && this.battery < 20) {
      this._lastBeepTimer += dt;
      const interval = this.battery < 5 ? 0.4 : 1.0;
      if (this._lastBeepTimer > interval) {
        this._lastBeepTimer = 0;
        if (this.audio && this.audio.playBeep) this.audio.playBeep(this.battery < 5);
      }
    }

    if (this.props) this.props.update(dt, this.physics.rpm);
  }

  render(alpha) {
    this.physics.getInterpolatedPosition(alpha, this._interpPos);
    this.physics.getInterpolatedQuat(alpha, this._interpQuat);
    this.group.position.copy(this._interpPos);
    this.group.quaternion.copy(this._interpQuat);
  }

  _sync() {
    this.group.position.copy(this.physics.position);
    this.group.quaternion.set(
      this.physics.quaternion.x,
      this.physics.quaternion.y,
      this.physics.quaternion.z,
      this.physics.quaternion.w
    );
  }

  getBattery() { return this.battery; }
  get position() { return this.physics.position; }
  get quaternion() { return this.physics.quaternion; }
}