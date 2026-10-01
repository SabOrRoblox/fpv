import * as THREE from 'three';

const POOL_SIZE = 6;

export class ExplosionFX {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];

    const sphereGeo = new THREE.SphereGeometry(1, 6, 6);
    const debrisGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const ringGeo = new THREE.RingGeometry(0.6, 1.4, 32);
    const flashGeo = new THREE.SphereGeometry(1, 16, 16);
    const coreGeo = new THREE.SphereGeometry(1, 16, 16);

    const MAX_FIRE = 160;
    const MAX_SMOKE = 80;
    const MAX_DEBRIS = 60;

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

      const ring1 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }));
      ring1.rotation.x = -Math.PI / 2;
      group.add(ring1);

      const ring2 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffcc88,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }));
      ring2.rotation.x = -Math.PI / 2;
      group.add(ring2);

      const fire = [];
      for (let j = 0; j < MAX_FIRE; j++) {
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
      for (let j = 0; j < MAX_SMOKE; j++) {
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
      for (let j = 0; j < MAX_DEBRIS; j++) {
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
        group, core, flash, ring1, ring2, fire, smoke, debris,
        active: false, elapsed: 0, duration: 3.5,
        damageDealt: false, opts: null, onDamage: null,
      });
    }
  }

  trigger(position, options, onDamage) {
    if (!position) return;
    if (!isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z)) return;

    const opts = Object.assign({
      radius: 14,
      damage: 250,
      height: 28,
      waveSpeed: 24,
      duration: 3.5,
      fireCount: 110,
      smokeCount: 50,
      debrisCount: 40,
      coreColor: '#ffdd66',
      fireColor: '#ff6600',
      smokeColor: '#1a1a1a',
      debrisColor: '#3d2817',
    }, options || {});

    let exp = null;
    for (const e of this.pool) {
      if (!e.active) { exp = e; break; }
    }
    if (!exp) {
      exp = this.pool[0];
      exp.group.visible = false;
    }

    exp.active = true;
    exp.elapsed = 0;
    exp.duration = opts.duration;
    exp.damageDealt = false;
    exp.opts = opts;
    exp.onDamage = onDamage;
    exp.group.visible = true;
    exp.group.position.copy(position);

    exp.core.visible = true;
    exp.core.scale.setScalar(0.3);
    exp.core.material.opacity = 1;
    exp.core.material.color.set(opts.coreColor);

    exp.flash.visible = true;
    exp.flash.scale.setScalar(0.5);
    exp.flash.material.opacity = 1;

    exp.ring1.visible = true;
    exp.ring1.scale.setScalar(1);
    exp.ring1.material.opacity = 0.9;
    exp.ring1.rotation.z = Math.random() * Math.PI * 2;

    exp.ring2.visible = true;
    exp.ring2.scale.setScalar(1.3);
    exp.ring2.material.opacity = 0.7;
    exp.ring2.rotation.z = Math.random() * Math.PI * 2;

    const fireRatio = Math.min(1, opts.fireCount / exp.fire.length);
    const smokeRatio = Math.min(1, opts.smokeCount / exp.smoke.length);
    const debrisRatio = Math.min(1, opts.debrisCount / exp.debris.length);

    const fireColorBase = new THREE.Color(opts.fireColor);

    for (let i = 0; i < exp.fire.length; i++) {
      const p = exp.fire[i];
      if (i / exp.fire.length > fireRatio) { p.mesh.visible = false; continue; }
      p.mesh.visible = true;
      p.mesh.position.set(0, 0, 0);

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 6 + Math.random() * 18;
      const upBias = 1.2 + (opts.height / 20);

      p.vx = Math.sin(phi) * Math.cos(theta) * speed;
      p.vy = Math.abs(Math.cos(phi)) * speed * upBias + 6;
      p.vz = Math.sin(phi) * Math.sin(theta) * speed;
      p.life = 0;
      p.maxLife = 0.9 + Math.random() * 1.6;
      p.size = 0.3 + Math.random() * 1.0;
      p.mesh.scale.setScalar(p.size);
      p.mesh.material.opacity = 1;
      p.mesh.material.color.copy(fireColorBase);
      p.mesh.material.color.offsetHSL((Math.random() - 0.5) * 0.05, 0, 0.1 * Math.random());
    }

    const smokeColorBase = new THREE.Color(opts.smokeColor);

    for (let i = 0; i < exp.smoke.length; i++) {
      const p = exp.smoke[i];
      if (i / exp.smoke.length > smokeRatio) { p.mesh.visible = false; continue; }
      p.mesh.visible = true;
      p.mesh.position.set(0, 0, 0);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 2 + Math.random() * 7;
      const upBias = 2.5 + (opts.height / 12);

      p.vx = Math.sin(phi) * Math.cos(theta) * speed;
      p.vy = 4 + Math.random() * 6 + upBias;
      p.vz = Math.sin(phi) * Math.sin(theta) * speed;
      p.life = 0;
      p.maxLife = 1.5 + Math.random() * 2.2;
      p.size = 1.4 + Math.random() * 2.6;
      p.mesh.scale.setScalar(p.size);
      p.mesh.material.opacity = 0.6;
      p.mesh.material.color.copy(smokeColorBase);
    }

    const debrisColorBase = new THREE.Color(opts.debrisColor);

    for (let i = 0; i < exp.debris.length; i++) {
      const p = exp.debris[i];
      if (i / exp.debris.length > debrisRatio) { p.mesh.visible = false; continue; }
      p.mesh.visible = true;
      p.mesh.position.set(0, 0, 0);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 10 + Math.random() * 22;
      const upBias = 1.4 + (opts.height / 25);

      p.vx = Math.sin(phi) * Math.cos(theta) * speed;
      p.vy = 8 + Math.random() * 18 * upBias;
      p.vz = Math.sin(phi) * Math.sin(theta) * speed;
      p.life = 0;
      p.maxLife = 1.8 + Math.random() * 1.5;
      p.spin = (Math.random() - 0.5) * 22;
      p.mesh.scale.setScalar(0.5 + Math.random() * 1.3);
      p.mesh.material.opacity = 1;
      p.mesh.material.color.copy(debrisColorBase);
      p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    }
  }

  update(dt) {
    for (const exp of this.pool) {
      if (!exp.active) {
        if (exp.group.visible) exp.group.visible = false;
        continue;
      }

      if (!exp.damageDealt) {
        exp.damageDealt = true;
        if (exp.onDamage && exp.opts) exp.onDamage(exp.group.position, exp.opts.radius, exp.opts.damage);
      }

      exp.elapsed += dt;
      const t = exp.elapsed / exp.duration;

      if (t >= 1) {
        exp.active = false;
        exp.group.visible = false;
        continue;
      }

      const early = Math.min(1, exp.elapsed / 0.25);
      const heightScale = (exp.opts.height || 28) / 20;

      exp.core.scale.setScalar((0.3 + early * 4.5 - t * 3) * (0.7 + heightScale * 0.5));
      exp.core.material.opacity = Math.max(0, 1 - t * 1.6);

      exp.flash.scale.setScalar((0.5 + early * 8) * (0.8 + heightScale * 0.4));
      exp.flash.material.opacity = Math.max(0, 1 - early * 1.8);

      const waveSpeed = (exp.opts.waveSpeed || 24) / 24;

      const rt1 = Math.min(1, exp.elapsed / 1.0);
      exp.ring1.scale.setScalar(1 + rt1 * 14 * waveSpeed);
      exp.ring1.material.opacity = Math.max(0, 0.9 - rt1 * 1.1);

      const rt2 = Math.min(1, exp.elapsed / 1.4);
      exp.ring2.scale.setScalar(1.3 + rt2 * 18 * waveSpeed);
      exp.ring2.material.opacity = Math.max(0, 0.7 - rt2 * 0.9);

      for (const p of exp.fire) {
        if (!p.mesh.visible) continue;
        p.life += dt;
        const pt = p.life / p.maxLife;
        if (pt >= 1) { p.mesh.visible = false; continue; }
        p.vy -= 12 * dt;
        p.vx *= 1 - 1.8 * dt;
        p.vz *= 1 - 1.8 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.material.opacity = 1 - pt * pt;
        p.mesh.scale.setScalar(p.size * (1 + pt * 2.5));
        const h = 0.02 + pt * 0.06;
        p.mesh.material.color.setHSL(h, 1, 0.55 - pt * 0.55);
      }

      for (const p of exp.smoke) {
        if (!p.mesh.visible) continue;
        p.life += dt;
        const pt = p.life / p.maxLife;
        if (pt >= 1) { p.mesh.visible = false; continue; }
        p.vy -= 1.5 * dt;
        p.vx *= 1 - 0.5 * dt;
        p.vz *= 1 - 0.5 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.material.opacity = 0.6 * (1 - pt);
        p.mesh.scale.setScalar(p.size * (1 + pt * 3.5));
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