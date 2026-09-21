import * as THREE from 'three';

const SKIN = 0.05;
const CACHE_CELL = 2.0;
const MAX_CACHE = 4000;

export class CollisionWorld {
  constructor() {
    this.meshes = [];
    this.raycaster = new THREE.Raycaster();
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3(0, -1, 0);
    this._groundCache = new Map();
    this._ready = false;
    this._invMat = new THREE.Matrix4();
    this._localTarget = new THREE.Vector3();
    this._localClosest = new THREE.Vector3();
    this._localNormal = new THREE.Vector3();
    this._worldNormal = new THREE.Vector3();
    this._targetCopy = new THREE.Vector3();
    this._closestPoint = new THREE.Vector3();
    this._tmpVec = new THREE.Vector3();
  }

  attachRoot(root) {
    this.meshes = [];
    this._groundCache.clear();
    this._ready = false;
    if (!root) return;

    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
      this.meshes.push(obj);
    });

    this._ready = this.meshes.length > 0;
  }

  isReady() {
    return this._ready && this.meshes.length > 0;
  }

  raycastDown(x, z, fromY = 1000, toY = -1000) {
    if (!this.isReady()) return null;
    this._origin.set(x, fromY, z);
    this._dir.set(0, -1, 0);
    this.raycaster.set(this._origin, this._dir);
    this.raycaster.far = fromY - toY;
    this.raycaster.firstHitOnly = true;
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    if (!hits.length) return null;
    return hits[0].point.y;
  }

  raycastDownCached(x, z, fromY = 1000, toY = -1000) {
    if (!this.isReady()) return null;
    const cx = Math.floor(x / CACHE_CELL);
    const cz = Math.floor(z / CACHE_CELL);
    const key = cx * 100000 + cz;
    if (this._groundCache.has(key)) return this._groundCache.get(key);
    const gY = this.raycastDown(x, z, fromY, toY);
    if (gY !== null) this._groundCache.set(key, gY);
    if (this._groundCache.size > MAX_CACHE) {
      this._groundCache.delete(this._groundCache.keys().next().value);
    }
    return gY;
  }

  resolvePlayer(position, velocity, radius, dt = 1 / 60) {
    if (!this.isReady()) return;
    const effR = radius + SKIN;
    const effR2 = effR * effR;
    const smooth = Math.min(1, 20 * dt);

    let bestHit = null;
    let bestDepth = 0;

    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      const bs = mesh.geometry.boundingSphere;
      if (bs) {
        const e = mesh.matrixWorld.elements;
        const dx = position.x - e[12];
        const dy = position.y - e[13];
        const dz = position.z - e[14];
        const r = bs.radius + effR;
        if (Math.abs(dy) > r) continue;
        if (dx * dx + dz * dz > r * r) continue;
      }

      const hit = this._sphereVsMesh(position, effR, effR2, mesh);
      if (!hit) continue;

      if (hit.push > bestDepth) {
        bestDepth = hit.push;
        bestHit = hit;
      }
    }

    if (!bestHit) return;

    const ny = bestHit.ny;
    const isFloor = ny > 0.85;
    const isCeiling = ny < -0.85;

    if (isFloor) {
      position.y += bestHit.ny * bestHit.push;
      if (velocity.y < 0) velocity.y = 0;
      return;
    }

    if (isCeiling) {
      position.y += bestHit.ny * bestHit.push;
      if (velocity.y > 0) velocity.y = 0;
      return;
    }

    const nx = bestHit.nx;
    const nz = bestHit.nz;
    const nl = Math.sqrt(nx * nx + nz * nz) || 1;
    const wnx = nx / nl;
    const wnz = nz / nl;

    position.x += wnx * bestHit.push * smooth;
    position.z += wnz * bestHit.push * smooth;

    const vn = velocity.x * wnx + velocity.z * wnz;
    if (vn < 0) {
      velocity.x -= wnx * vn;
      velocity.z -= wnz * vn;
    }
  }

  resolvePlayerVertical(position, velocity) {
    if (!this.isReady()) return;
    const gY = this.raycastDownCached(position.x, position.z, 10000, -10000);
    if (gY === null) return;
    if (position.y < gY) {
      position.y = gY;
      if (velocity.y < 0) velocity.y = 0;
    }
  }

  raycastSphere(position, radius, velocity) {
    if (!this.isReady()) return 0;
    const r2 = radius * radius;
    let hardestImpact = 0;

    for (let i = 0; i < this.meshes.length; i++) {
      const hit = this._sphereVsMesh(position, radius, r2, this.meshes[i]);
      if (!hit) continue;

      if (velocity) {
        const vn = velocity.x * hit.nx + velocity.y * hit.ny + velocity.z * hit.nz;
        if (vn < 0) {
          hardestImpact = Math.max(hardestImpact, -vn);
          velocity.x -= hit.nx * vn * 1.2;
          velocity.y -= hit.ny * vn * 1.2;
          velocity.z -= hit.nz * vn * 1.2;
          velocity.x *= 0.7;
          velocity.z *= 0.7;
        }
      }
      position.x += hit.nx * hit.push;
      position.y += hit.ny * hit.push;
      position.z += hit.nz * hit.push;
    }

    return hardestImpact;
  }

  _sphereVsMesh(pos, radius, radiusSq, mesh) {
    if (!mesh.geometry || !mesh.geometry.boundsTree) return null;
    try {
      const invMat = this._invMat.copy(mesh.matrixWorld).invert();
      const target = this._localTarget.set(pos.x, pos.y, pos.z).applyMatrix4(invMat);

      this._targetCopy.copy(target);

      const closest = this._localClosest;
      const closestPoint = this._closestPoint;
      let found = false;
      let closestDistSq = Infinity;
      const targetCopy = this._targetCopy;

      mesh.geometry.boundsTree.shapecast({
        intersectsBounds: (box) => box.distanceToPoint(targetCopy) <= radius,
        intersectsTriangle: (tri) => {
          tri.closestPointToPoint(targetCopy, closestPoint);
          const d = closestPoint.distanceToSquared(targetCopy);
          if (d < closestDistSq) {
            closestDistSq = d;
            closest.copy(closestPoint);
            found = true;
          }
        },
      });

      if (!found) return null;
      if (closestDistSq >= radiusSq) return null;

      const localNormal = this._localNormal.copy(target).sub(closest).normalize();
      const push = radius - Math.sqrt(closestDistSq);
      const worldNormal = this._worldNormal.copy(localNormal).transformDirection(mesh.matrixWorld);

      return {
        nx: worldNormal.x,
        ny: worldNormal.y,
        nz: worldNormal.z,
        push: push,
      };
    } catch (e) {
      return null;
    }
  }
}