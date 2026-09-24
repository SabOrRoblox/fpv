import * as THREE from 'three';

const SKIN = 0.15;
const CACHE_CELL = 2.0;
const MAX_CACHE = 1000;
const GRID_CELL = 16;
const GRID_INV = 1 / GRID_CELL;
const MAX_NEARBY = 60;

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
    this._grid = new Map();
    this._nearbyBuf = [];
    this._bbox = new THREE.Box3();
    this._hit = { nx: 0, ny: 0, nz: 0, push: 0 };
    this._capStart = new THREE.Vector3();
    this._capEnd = new THREE.Vector3();
    this._capRadius = 0.4;
    this._capHeight = 1.8;
  }

  attachRoot(root) {
    this.meshes = [];
    this._groundCache.clear();
    this._grid.clear();
    this._ready = false;
    if (!root) return;

    root.updateMatrixWorld(true);
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
      this.meshes.push(obj);
    });

    this._buildGrid();
    this._ready = this.meshes.length > 0;
  }

  _buildGrid() {
    const box = this._bbox;
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      box.setFromObject(mesh);

      const minX = Math.floor(box.min.x * GRID_INV);
      const maxX = Math.floor(box.max.x * GRID_INV);
      const minZ = Math.floor(box.min.z * GRID_INV);
      const maxZ = Math.floor(box.max.z * GRID_INV);

      for (let ix = minX; ix <= maxX; ix++) {
        for (let iz = minZ; iz <= maxZ; iz++) {
          const key = ix * 100000 + iz;
          let arr = this._grid.get(key);
          if (!arr) {
            arr = [];
            this._grid.set(key, arr);
          }
          arr.push(mesh);
        }
      }
    }
  }

  _getNearbyMeshes(x, z, out) {
    out.length = 0;
    const cx = Math.floor(x * GRID_INV);
    const cz = Math.floor(z * GRID_INV);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const key = ix * 100000 + iz;
        const arr = this._grid.get(key);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const m = arr[i];
          if (out.indexOf(m) === -1) {
            out.push(m);
            if (out.length >= MAX_NEARBY) return out;
          }
        }
      }
    }
    return out;
  }

  isReady() {
    return this._ready && this.meshes.length > 0;
  }

  raycastDown(x, z, fromY = 1000, toY = -1000) {
    if (!this.isReady()) return null;
    const nearby = this._getNearbyMeshes(x, z, this._nearbyBuf);
    if (nearby.length === 0) return null;

    this._origin.set(x, fromY, z);
    this._dir.set(0, -1, 0);
    this.raycaster.set(this._origin, this._dir);
    this.raycaster.far = fromY - toY;
    this.raycaster.firstHitOnly = true;
    const hits = this.raycaster.intersectObjects(nearby, false);
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
      this._groundCache.clear();
    }
    return gY;
  }

  resolvePlayerCapsule(position, velocity, radius, height, dt = 1 / 60) {
    if (!this.isReady()) return;
    const effR = radius + SKIN;
    const effR2 = effR * effR;

    const capStart = this._capStart.set(position.x, position.y, position.z);
    const capEnd = this._capEnd.set(position.x, position.y + height, position.z);

    const nearby = this._getNearbyMeshes(position.x, position.z, this._nearbyBuf);
    if (nearby.length === 0) return;

    let floorPush = 0;
    let ceilPush = 0;
    let wallNx = 0;
    let wallNy = 0;
    let wallNz = 0;
    let wallPush = 0;
    let wallCount = 0;

    for (let i = 0; i < nearby.length; i++) {
      const mesh = nearby[i];
      const bs = mesh.geometry.boundingSphere;
      if (bs) {
        const e = mesh.matrixWorld.elements;
        const dx = position.x - e[12];
        const dy = position.y - e[13];
        const dz = position.z - e[14];
        const r = bs.radius + effR * 2 + height;
        if (Math.abs(dy) > r) continue;
        if (dx * dx + dz * dz > r * r) continue;
      }

      const hit = this._capsuleVsMesh(capStart, capEnd, effR, effR2, mesh);
      if (!hit) continue;

      const ny = hit.ny;

      if (ny > 0.85) {
        if (hit.push > floorPush) floorPush = hit.push;
      } else if (ny < -0.85) {
        if (hit.push > ceilPush) ceilPush = hit.push;
      } else {
        wallNx += hit.nx;
        wallNy += hit.ny;
        wallNz += hit.nz;
        if (hit.push > wallPush) wallPush = hit.push;
        wallCount++;
      }
    }

    if (floorPush > 0) {
      position.y += floorPush;
      if (velocity.y < 0) velocity.y = 0;
    }
    if (ceilPush > 0) {
      position.y -= ceilPush;
      if (velocity.y > 0) velocity.y = 0;
    }
    if (wallCount > 0) {
      const len = Math.sqrt(wallNx * wallNx + wallNy * wallNy + wallNz * wallNz);
      if (len > 1e-4) {
        const nx = wallNx / len;
        const ny = wallNy / len;
        const nz = wallNz / len;
        const smooth = Math.min(1, 20 * dt);

        position.x += nx * wallPush * smooth;
        position.z += nz * wallPush * smooth;

        const vn = velocity.x * nx + velocity.z * nz;
        if (vn < 0) {
          velocity.x -= nx * vn;
          velocity.z -= nz * vn;
        }
      }
    }
  }

  _capsuleVsMesh(capStart, capEnd, radius, radiusSq, mesh) {
    if (!mesh.geometry || !mesh.geometry.boundsTree) return null;
    try {
      const invMat = this._invMat.copy(mesh.matrixWorld).invert();
      const localStart = this._localTarget.copy(capStart).applyMatrix4(invMat);
      const localEnd = this._localClosest.copy(capEnd).applyMatrix4(invMat);

      const midX = (localStart.x + localEnd.x) * 0.5;
      const midY = (localStart.y + localEnd.y) * 0.5;
      const midZ = (localStart.z + localEnd.z) * 0.5;
      const target = this._targetCopy.set(midX, midY, midZ);

      const closestPoint = this._closestPoint;
      let found = false;
      let closestDistSq = Infinity;
      const targetCopy = this._targetCopy;

      mesh.geometry.boundsTree.shapecast({
        intersectsBounds: (box) => box.distanceToPoint(targetCopy) <= radius + 1.0,
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

      const h = this._hit;
      h.nx = worldNormal.x;
      h.ny = worldNormal.y;
      h.nz = worldNormal.z;
      h.push = push;
      return h;
    } catch (e) {
      return null;
    }
  }

  resolvePlayer(position, velocity, radius, dt = 1 / 60) {
    if (!this.isReady()) return;
    const effR = radius + SKIN;
    const effR2 = effR * effR;

    const nearby = this._getNearbyMeshes(position.x, position.z, this._nearbyBuf);
    if (nearby.length === 0) return;

    let floorPush = 0;
    let ceilPush = 0;
    let wallNx = 0;
    let wallNy = 0;
    let wallNz = 0;
    let wallPush = 0;
    let wallCount = 0;

    for (let i = 0; i < nearby.length; i++) {
      const mesh = nearby[i];
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

      const ny = hit.ny;

      if (ny > 0.85) {
        if (hit.push > floorPush) floorPush = hit.push;
      } else if (ny < -0.85) {
        if (hit.push > ceilPush) ceilPush = hit.push;
      } else {
        wallNx += hit.nx;
        wallNy += hit.ny;
        wallNz += hit.nz;
        if (hit.push > wallPush) wallPush = hit.push;
        wallCount++;
      }
    }

    if (floorPush > 0) {
      position.y += floorPush;
      if (velocity.y < 0) velocity.y = 0;
    }
    if (ceilPush > 0) {
      position.y -= ceilPush;
      if (velocity.y > 0) velocity.y = 0;
    }
    if (wallCount > 0) {
      const len = Math.sqrt(wallNx * wallNx + wallNy * wallNy + wallNz * wallNz);
      if (len > 1e-4) {
        const nx = wallNx / len;
        const ny = wallNy / len;
        const nz = wallNz / len;
        const smooth = Math.min(1, 20 * dt);

        position.x += nx * wallPush * smooth;
        if (Math.abs(ny) > 0.3) position.y += ny * wallPush * smooth * 0.5;
        position.z += nz * wallPush * smooth;

        const vn = velocity.x * nx + velocity.y * ny + velocity.z * nz;
        if (vn < 0) {
          velocity.x -= nx * vn;
          if (Math.abs(ny) > 0.3) velocity.y -= ny * vn;
          velocity.z -= nz * vn;
        }
      }
    }
  }

  raycastSphere(position, radius, velocity) {
    if (!this.isReady()) return 0;
    const nearby = this._getNearbyMeshes(position.x, position.z, this._nearbyBuf);
    if (nearby.length === 0) return 0;

    const r2 = radius * radius;
    let hardestImpact = 0;

    for (let i = 0; i < nearby.length; i++) {
      const hit = this._sphereVsMesh(position, radius, r2, nearby[i]);
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

      const h = this._hit;
      h.nx = worldNormal.x;
      h.ny = worldNormal.y;
      h.nz = worldNormal.z;
      h.push = push;
      return h;
    } catch (e) {
      return null;
    }
  }
}