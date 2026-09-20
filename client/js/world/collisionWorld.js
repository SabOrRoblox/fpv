import * as THREE from 'three';

const SKIN = 0.05;

export class CollisionWorld {
  constructor() {
    this.meshes = [];
    this.raycaster = new THREE.Raycaster();
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3(0, -1, 0);
    this._groundCache = new Map();
    this._cacheCellSize = 2.0;
    this._ready = false;
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
    try {
      const hits = this.raycaster.intersectObjects(this.meshes, false);
      if (!hits.length) return null;
      return hits[0].point.y;
    } catch (e) {
      return null;
    }
  }

  raycastDownCached(x, z, fromY = 1000, toY = -1000) {
    if (!this.isReady()) return null;
    const cx = Math.floor(x / this._cacheCellSize);
    const cz = Math.floor(z / this._cacheCellSize);
    const key = cx + ',' + cz;
    if (this._groundCache.has(key)) return this._groundCache.get(key);
    const gY = this.raycastDown(x, z, fromY, toY);
    if (gY !== null) this._groundCache.set(key, gY);
    if (this._groundCache.size > 5000) {
      const first = this._groundCache.keys().next().value;
      this._groundCache.delete(first);
    }
    return gY;
  }

  raycast(originX, originY, originZ, dirX, dirY, dirZ, far = 1000) {
    if (!this.isReady()) return null;
    this._origin.set(originX, originY, originZ);
    this._dir.set(dirX, dirY, dirZ).normalize();
    this.raycaster.set(this._origin, this._dir);
    this.raycaster.far = far;
    this.raycaster.firstHitOnly = true;
    try {
      const hits = this.raycaster.intersectObjects(this.meshes, false);
      if (!hits.length) return null;
      const h = hits[0];
      return { x: h.point.x, y: h.point.y, z: h.point.z, distance: h.distance };
    } catch (e) {
      return null;
    }
  }

  resolvePlayer(position, velocity, radius, dt = 1 / 60) {
    if (!this.isReady()) return;
    const effectiveRadius = radius + SKIN;
    const smooth = Math.min(1, 20 * dt);

    for (const mesh of this.meshes) {
      const bb = mesh.geometry.boundingBox;
      if (bb) {
        if (position.x + effectiveRadius < bb.min.x) continue;
        if (position.x - effectiveRadius > bb.max.x) continue;
        if (position.y + effectiveRadius < bb.min.y) continue;
        if (position.y - effectiveRadius > bb.max.y) continue;
        if (position.z + effectiveRadius < bb.min.z) continue;
        if (position.z - effectiveRadius > bb.max.z) continue;
      }

      const hit = this._sphereVsMesh(position, effectiveRadius, mesh);
      if (!hit) continue;

      if (Math.abs(hit.ny) > 0.7) {
        position.y += hit.ny * hit.push;
        if (hit.ny > 0 && velocity.y < 0) velocity.y = 0;
      } else {
        const vn = velocity.x * hit.nx + velocity.z * hit.nz;
        if (vn < 0) {
          velocity.x -= hit.nx * vn;
          velocity.z -= hit.nz * vn;
        }
        position.x += hit.nx * hit.push * smooth;
        position.z += hit.nz * hit.push * smooth;
      }
    }
  }

  raycastSphere(position, radius, velocity) {
    if (!this.isReady()) return 0;
    let hardestImpact = 0;

    for (const mesh of this.meshes) {
      const hit = this._sphereVsMesh(position, radius, mesh);
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

  _sphereVsMesh(pos, radius, mesh) {
    if (!mesh.geometry || !mesh.geometry.boundsTree) return null;
    try {
      const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
      const local = new THREE.Vector3(pos.x, pos.y, pos.z).applyMatrix4(inv);
      const target = local.clone();
      const geometry = mesh.geometry;

      let closest = null;
      let closestDistSq = Infinity;

      geometry.boundsTree.shapecast({
        intersectsBounds: (box) => box.distanceToPoint(target) <= radius,
        intersectsTriangle: (tri) => {
          const p = new THREE.Vector3();
          tri.closestPointToPoint(target, p);
          const d = p.distanceToSquared(target);
          if (d < closestDistSq) {
            closestDistSq = d;
            closest = p.clone();
          }
        },
      });

      if (!closest) return null;
      if (closestDistSq >= radius * radius) return null;

      const localNormal = local.clone().sub(closest).normalize();
      const push = radius - Math.sqrt(closestDistSq);
      const outMatrix = mesh.matrixWorld;
      const worldNormal = localNormal.clone().transformDirection(outMatrix);
      const worldClosest = closest.clone().applyMatrix4(outMatrix);

      return {
        nx: worldNormal.x,
        ny: worldNormal.y,
        nz: worldNormal.z,
        push: push,
        point: worldClosest,
      };
    } catch (e) {
      return null;
    }
  }
}