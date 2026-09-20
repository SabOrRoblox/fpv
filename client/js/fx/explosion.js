import * as THREE from 'three';

const POOL_SIZE = 6;
const FIRE_PARTICLES = 90;
const SMOKE_PARTICLES = 40;
const DEBRIS_PARTICLES = 30;
const SHOCK_RINGS = 2;

export class ExplosionFX {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];

    const sphereGeo = new THREE.SphereGeometry(1, 6, 6);
    const debrisGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const ringGeo = new THREE.RingGeometry(0.6, 1.4, 32);
    const flashGeo = new THREE.SphereGeometry(1, 16, 16);
    const coreGeo = new THREE.SphereGeometry(1, 16, 16);

    for (let i = 0; i < POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;
      group.frustumCulled = false;

      const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({
        color: 0xffdd66,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      group.add(core);

      const flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));
      group.add(flash);

      const rings = [];
      for (let r = 0; r < SHOCK_RINGS; r++) {
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
          color: r === 0 ? 0xffaa44 : 0xffcc88,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }));
        ring.rotation.x = -Math.PI / 2;
        group.add(ring);
        rings.push(ring);
      }

      const fire = [];
      for (let j = 0; j < FIRE_PARTICLES; j++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xff6600,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(sphereGeo, mat);
        mesh.visible = false;
        group.add(mesh);
        fire.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1 });
      }

      const smoke = [];
      for (let j = 0; j < SMOKE_PARTICLES; j++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0x222222,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(sphereGeo, mat);
        mesh.visible = false;
        group.add(mesh);
        smoke.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1 });
      }

      const debris = [];
      for (let j = 0; j < DEBRIS_PARTICLES; j++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0x553311,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(debrisGeo, mat);
        mesh.visible = false;
        group.add(mesh);
        debris.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, spin: 0 });
      }

      this.scene.add(group);
      this.pool.push({
        group, core, flash, rings, fire, smoke, debris,
        active: false, elapsed: 0, duration: 3.0,
        damageDealt: false, radius: 8, damage: 120, onDamage: null,
      });
    }
  }

  trigger(position, radius = 8, damage = 120, onDamage = null) {
    let exp = null;
    for (const e of this.pool) if (!e.active) { exp = e; break; }
    if (!exp) exp = this.pool[0];

    exp.active = true;
    exp.elapsed = 0;
    exp.duration = 3.0;
    exp.damageDealt = false;
    exp.radius = radius;
    exp.damage = damage;
    exp.onDamage = onDamage;
    exp.group.visible = true;
    exp.group.position.copy(position);

    exp.core.visible = true;
    exp.core.scale.setScalar(0.3);
    exp.core.material.opacity = 1;

    exp.flash.visible = true;
    exp.flash.scale.setScalar(0.5);
    exp.flash.material.opacity = 1;

    for (let r = 0; r < exp.rings.length; r++) {
      const ring = exp.rings[r];
      ring.visible = true;
      ring.scale.setScalar(1 + r * 0.3);
      ring.material.opacity = 0.9 - r * 0.2;
      ring.rotation.z = Math.random() * Math.PI * 2;
    }

    for (const p of exp.fire) {
      p.mesh.visible = true;
      p.mesh.position.set(0, 0, 0);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 6 + Math.random() * 22;
      p.vx = Math.sin(phi) * Math.cos(theta) * speed;
      p.vy = Math.abs(Math.cos(phi)) * speed * 1.4 + 4;
      p.vz = Math.sin(phi) * Math.sin(theta) * speed;
      p.life = 0;
      p.maxLife = 0.9 + Math.random() * 1.4;
      p.size = 0.3 + Math.random() * 0.9;
      p.mesh.scale.setScalar(p.size);
      p.mesh.material.opacity = 1;
      p.mesh.material.color.setHSL(0.02 + Math.random() * 0.10, 1, 0.55 + Math.random() * 0.15);
    }

    for (const p of exp.smoke) {
      p.mesh.visible = true;
      p.mesh.position.set(0, 0, 0);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 2 + Math.random() * 8;
      p.vx = Math.sin(phi) * Math.cos(theta) * speed;
      p.vy = 3 + Math.random() * 8;
      p.vz = Math.sin(phi) * Math.sin(theta) * speed;
      p.life = 0;
      p.maxLife = 1.2 + Math.random() * 1.8;
      p.size = 1.2 + Math.random() * 2.2;
      p.mesh.scale.setScalar(p.size);
      p.mesh.material.opacity = 0.55;
      p.mesh.material.color.setHSL(0, 0, 0.05 + Math.random() * 0.15);
    }

    for (const p of exp.debris) {
      p.mesh.visible = true;
      p.mesh.position.set(0, 0, 0);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 10 + Math.random() * 25;
      p.vx = Math.sin(phi) * Math.cos(theta) * speed;
      p.vy = 8 + Math.random() * 20;
      p.vz = Math.sin(phi) * Math.sin(theta) * speed;
      p.life = 0;
      p.maxLife = 1.5 + Math.random() * 1.5;
      p.spin = (Math.random() - 0.5) * 20;
      p.mesh.scale.setScalar(0.5 + Math.random() * 1.2);
      p.mesh.material.opacity = 1;
      p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    }
  }

  update(dt) {
    for (const exp of this.pool) {
      if (!exp.active) continue;

      if (!exp.damageDealt) {
        exp.damageDealt = true;
        if (exp.onDamage) exp.onDamage(exp.group.position, exp.radius, exp.damage);
      }

      exp.elapsed += dt;
      const t = exp.elapsed / exp.duration;

      if (t >= 1) {
        exp.active = false;
        exp.group.visible = false;
        continue;
      }

      const early = Math.min(1, exp.elapsed / 0.25);

      exp.core.scale.setScalar(0.3 + early * 4.5 - t * 3);
      exp.core.material.opacity = Math.max(0, 1 - t * 1.6);

      exp.flash.scale.setScalar(0.5 + early * 8);
      exp.flash.material.opacity = Math.max(0, 1 - early * 1.8);

      for (let r = 0; r < exp.rings.length; r++) {
        const ring = exp.rings[r];
        const rt = Math.min(1, exp.elapsed / (1.0 + r * 0.4));
        ring.scale.setScalar(1 + rt * (14 + r * 4));
        ring.material.opacity = Math.max(0, (0.9 - r * 0.2) - rt * 1.1);
      }

      for (const p of exp.fire) {
        if (!p.mesh.visible) continue;
        p.life += dt;
        const pt = p.life / p.maxLife;
        if (pt >= 1) { p.mesh.visible = false; continue; }
        p.vy -= 14 * dt;
        p.vx *= 1 - 1.8 * dt;
        p.vz *= 1 - 1.8 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.material.opacity = 1 - pt * pt;
        p.mesh.scale.setScalar(p.size * (1 + pt * 2.5));
        p.mesh.material.color.setHSL(0.02 + pt * 0.06, 1, 0.55 - pt * 0.55);
      }

      for (const p of exp.smoke) {
        if (!p.mesh.visible) continue;
        p.life += dt;
        const pt = p.life / p.maxLife;
        if (pt >= 1) { p.mesh.visible = false; continue; }
        p.vy -= 2 * dt;
        p.vx *= 1 - 0.6 * dt;
        p.vz *= 1 - 0.6 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.material.opacity = 0.55 * (1 - pt);
        p.mesh.scale.setScalar(p.size * (1 + pt * 3));
        p.mesh.material.color.setHSL(0, 0, 0.05 + (1 - pt) * 0.15);
      }

      for (const p of exp.debris) {
        if (!p.mesh.visible) continue;
        p.life += dt;
        const pt = p.life / p.maxLife;
        if (pt >= 1) { p.mesh.visible = false; continue; }
        p.vy -= 22 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += p.spin * dt;
        p.mesh.rotation.y += p.spin * 0.8 * dt;
        p.mesh.rotation.z += p.spin * 1.2 * dt;
        p.mesh.material.opacity = 1 - pt;
      }
    }
  }
}