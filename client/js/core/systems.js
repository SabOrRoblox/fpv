import * as THREE from 'three';
import { CFG } from '../../../shared/config/config.js';
import { GameState } from './gameState.js';
import { MSG, encodeEventCrash, wrapBinary } from '../../../shared/net/protocol.js';

export function distToPad() {
  const gs = GameState;
  if (!gs.localPlayer || !gs.localDrone) return 999;
  const dx = gs.localPlayer.position.x - gs.localDrone.position.x;
  const dz = gs.localPlayer.position.z - gs.localDrone.position.z;
  return Math.hypot(dx, dz);
}

export function distToCar() {
  const gs = GameState;
  if (!gs.localPlayer || !gs.localCar) return 999;
  const dx = gs.localPlayer.position.x - gs.localCar.position.x;
  const dz = gs.localPlayer.position.z - gs.localCar.position.z;
  return Math.hypot(dx, dz);
}

export function setUIMode(mode, els) {
  const gs = GameState;

  if (mode === 'fpv') {
    els.joyMove.style.display = 'none';
    els.cylDrone.style.display = 'flex';
    if (els.carCyl) els.carCyl.style.display = 'none';
    if (els.carSteer) els.carSteer.style.display = 'none';
    els.btnEnter.style.display = 'none';
    els.btnExit.style.display = 'block';
    els.btnCarEnter.style.display = 'none';
    els.btnCarExit.style.display = 'none';
    els.sideButtons.style.display = 'none';
    gs.hud.setMode('fpv');
  } else if (mode === 'car') {
    els.joyMove.style.display = 'none';
    els.cylDrone.style.display = 'none';
    if (els.carCyl) els.carCyl.style.display = 'flex';
    if (els.carSteer) els.carSteer.style.display = 'flex';
    els.btnEnter.style.display = 'none';
    els.btnExit.style.display = 'none';
    els.btnCarEnter.style.display = 'none';
    els.btnCarExit.style.display = 'block';
    els.sideButtons.style.display = 'none';
    gs.hud.setMode('car');
  } else {
    els.joyMove.style.display = 'block';
    els.cylDrone.style.display = 'none';
    if (els.carCyl) els.carCyl.style.display = 'none';
    if (els.carSteer) els.carSteer.style.display = 'none';
    els.btnEnter.style.display = 'none';
    els.btnExit.style.display = 'none';
    els.btnCarEnter.style.display = 'none';
    els.btnCarExit.style.display = 'none';
    els.sideButtons.style.display = 'flex';
    gs.hud.setMode('walk');
  }

  requestAnimationFrame(() => {
    if (els.playerControls && els.playerControls.refresh) els.playerControls.refresh();
    if (els.droneControls && els.droneControls.refresh) els.droneControls.refresh();
  });
  gs.mode = mode;
}

export function respawnAll(els, spawnOverride) {
  const gs = GameState;
  const spawn = spawnOverride || (gs.myTeam === 'blue' ? CFG.TEAM_SPAWN_BLUE : CFG.TEAM_SPAWN_RED);

  gs.lastPlayerPos = null;
  gs.localPlayer.spawn(gs.collisionWorld, spawn.x, spawn.z, 0);
  if (gs.localPlayer.group) gs.localPlayer.group.visible = true;

  const padX = gs.myTeam === 'blue' ? CFG.DRONE_PAD_POS_BLUE.x : CFG.DRONE_PAD_POS.x;
  const padZ = gs.myTeam === 'blue' ? CFG.DRONE_PAD_POS_BLUE.z : CFG.DRONE_PAD_POS.z;
  gs.localDrone.resetToPos(gs.collisionWorld, { x: padX, y: 0, z: padZ }, 0);

  if (gs.localCar) {
    const carX = spawn.x + 5;
    const carZ = spawn.z;
    gs.localCar.spawn(gs.collisionWorld, carX, carZ, 0);
  }

  gs.lastCrashProcessed = false;
  gs.camYaw = 0;
  gs._fpvInit = false;
  gs._walkInit = false;
  gs._carInit = false;

  els.touchCam.yaw = 0;
  els.touchCam.pitch = 0;
  els.touchCam._targetYaw = 0;
  els.touchCam._currentYaw = 0;
  els.touchCam._targetPitch = 0;
  els.touchCam._currentPitch = 0;
  els.touchCam.distance = CFG.CAMERA_3RD_DIST;
  els.touchCam.resetPitchOnRelease = false;

  setUIMode('walk', els);
}

export function enterDrone(els) {
  const gs = GameState;
  if (gs.mode !== 'walk') return;
  if (!gs.localPlayer.alive) return;
  if (distToPad() > CFG.PAD_RADIUS + 2.0) return;

  gs.lastPlayerPos = {
    x: gs.localPlayer.position.x,
    y: gs.localPlayer.position.y,
    z: gs.localPlayer.position.z,
    yaw: gs.localPlayer.yaw,
  };

  if (gs.collisionWorld && gs.collisionWorld.isReady()) {
    const dx = gs.localDrone.position.x;
    const dz = gs.localDrone.position.z;
    const dy = gs.localDrone.position.y;
    const gY = gs.collisionWorld.raycastDown(dx, dz, dy + 5, dy - 50);
    if (gY !== null) gs.localDrone.physics.groundY = gY;
  }

  gs.localDrone.piloted = true;
  gs.localDrone.physics.armed = true;
  gs.localDrone.physics.crashed = false;
  gs.lastCrashProcessed = false;
  els.droneControls.reset();
  els.droneSelect.close();

  gs._fpvInit = false;
  gs._walkInit = false;
  gs._carInit = false;

  els.touchCam.resetPitchOnRelease = true;
  els.touchCam._targetYaw = gs.localDrone.physics.yaw;
  els.touchCam._currentYaw = gs.localDrone.physics.yaw;
  els.touchCam.yaw = gs.localDrone.physics.yaw;
  els.touchCam._targetPitch = 0;
  els.touchCam._currentPitch = 0;
  els.touchCam.pitch = 0;

  if (gs.socket && gs.socket.connected) {
    gs.socket.sendJSON({
      type: 'enter_drone',
      droneId: gs.localDrone.droneId || 'dron1',
      dx: gs.localDrone.position.x,
      dz: gs.localDrone.position.z,
      px: gs.localPlayer.position.x,
      pz: gs.localPlayer.position.z,
    });
  }

  setUIMode('fpv', els);
  gs.audio.playDrone();
}

export function exitDrone(els) {
  const gs = GameState;
  if (gs.mode !== 'fpv') return;

  gs.localDrone.piloted = false;
  gs.localDrone.physics.armed = false;
  gs.localDrone.physics.crashed = false;
  els.droneControls.reset();
  gs.audio.stopDrone();
  els.touchCam.resetPitchOnRelease = false;

  const droneX = gs.localDrone.position.x;
  const droneZ = gs.localDrone.position.z;
  const droneY = gs.localDrone.position.y;

  let spawnX, spawnZ;

  if (gs.collisionWorld && gs.collisionWorld.isReady()) {
    const gY = gs.collisionWorld.raycastDown(droneX, droneZ, droneY + 5, droneY - 50);
    const isHighAir = gY !== null && droneY > gY + 3.0;

    if (isHighAir) {
      if (gs.lastPlayerPos) {
        spawnX = gs.lastPlayerPos.x;
        spawnZ = gs.lastPlayerPos.z;
      } else {
        const spawn = gs.myTeam === 'blue' ? CFG.TEAM_SPAWN_BLUE : CFG.TEAM_SPAWN_RED;
        spawnX = spawn.x;
        spawnZ = spawn.z;
      }
    } else {
      spawnX = droneX + 2.0;
      spawnZ = droneZ;
    }
  } else {
    spawnX = droneX + 2.0;
    spawnZ = droneZ;
  }

  gs.localPlayer.spawn(gs.collisionWorld, spawnX, spawnZ, 0);
  if (gs.localPlayer.group) gs.localPlayer.group.visible = true;

  gs._fpvInit = false;
  gs._walkInit = false;
  gs._carInit = false;

  els.touchCam._targetPitch = 0;
  els.touchCam._currentPitch = 0;
  els.touchCam.pitch = 0;

  if (gs.socket && gs.socket.connected) {
    gs.socket.sendJSON({ type: 'exit_drone' });
  }

  setUIMode('walk', els);
}

export function enterCar(els) {
  const gs = GameState;
  if (gs.mode !== 'walk') return;
  if (!gs.localPlayer.alive) return;
  if (!gs.localCar) return;
  if (distToCar() > 4.0) return;

  gs.lastPlayerPos = {
    x: gs.localPlayer.position.x,
    y: gs.localPlayer.position.y,
    z: gs.localPlayer.position.z,
    yaw: gs.localPlayer.yaw,
  };

  if (gs.collisionWorld && gs.collisionWorld.isReady()) {
    const cx = gs.localCar.position.x;
    const cz = gs.localCar.position.z;
    const cy = gs.localCar.position.y;
    const gY = gs.collisionWorld.raycastDown(cx, cz, cy + 5, cy - 50);
    if (gY !== null) gs.localCar.physics.groundY = gY;
  }

  gs.localCar.physics.reset({
    x: gs.localCar.position.x,
    y: gs.localCar.position.y,
    z: gs.localCar.position.z,
  }, gs.localCar.yaw);

  if (gs.localPlayer.group) gs.localPlayer.group.visible = false;
  els.touchCam.resetPitchOnRelease = false;

  gs._fpvInit = false;
  gs._walkInit = false;
  gs._carInit = false;

  if (gs.socket && gs.socket.connected) {
    gs.socket.sendJSON({
      type: 'enter_car',
      px: gs.localPlayer.position.x,
      pz: gs.localPlayer.position.z,
      cx: gs.localCar.position.x,
      cz: gs.localCar.position.z,
      cy: gs.localCar.position.y,
      cyaw: gs.localCar.yaw,
    });
  }

  setUIMode('car', els);
}

export function exitCar(els) {
  const gs = GameState;
  if (gs.mode !== 'car') return;

  const carX = gs.localCar.position.x;
  const carZ = gs.localCar.position.z;
  const carY = gs.localCar.position.y;

  let spawnX = carX + 3;
  let spawnZ = carZ;

  if (gs.collisionWorld && gs.collisionWorld.isReady()) {
    const gY = gs.collisionWorld.raycastDown(spawnX, spawnZ, carY + 5, carY - 50);
    if (gY === null) {
      spawnX = carX - 3;
      spawnZ = carZ;
    }
  }

  gs.localPlayer.spawn(gs.collisionWorld, spawnX, spawnZ, gs.localCar.yaw);
  if (gs.localPlayer.group) gs.localPlayer.group.visible = true;

  gs._carInit = false;
  gs._walkInit = false;

  if (gs.socket && gs.socket.connected) {
    gs.socket.sendJSON({ type: 'exit_car' });
  }

  setUIMode('walk', els);
}

export function handleExplosionDamage(center, radius, damage, els) {
  const gs = GameState;
  if (!gs.localPlayer || !gs.localPlayer.alive) return;
  const dx = gs.localPlayer.position.x - center.x;
  const dy = (gs.localPlayer.position.y + 0.9) - center.y;
  const dz = gs.localPlayer.position.z - center.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > radius) return;
  const t = dist / radius;
  const finalDamage = damage * (1 - t * t);
  const died = gs.localPlayer.physics.takeDamage(finalDamage);
  if (died) {
    els.deathScreen.show('Сбит взрывом');
    gs.mode = 'walk';
    gs.localDrone.piloted = false;
    gs.localDrone.physics.armed = false;
    if (gs.localPlayer.group) gs.localPlayer.group.visible = true;
    setUIMode('walk', els);
    if (gs.socket && gs.socket.connected) gs.socket.sendJSON({ type: 'exit_drone' });
  }
}

export function processCrash(els) {
  const gs = GameState;
  if (gs.lastCrashProcessed) return;
  if (!gs.localDrone.physics.crashed) return;
  gs.lastCrashProcessed = true;

  const pos = new THREE.Vector3(
    gs.localDrone.physics.position.x,
    gs.localDrone.physics.position.y,
    gs.localDrone.physics.position.z
  );
  if (!isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) pos.set(0, 5, 0);

  const p = gs.localDrone.params || {};
  const explosionOpts = {
    radius: p.EXPLOSION_RADIUS || CFG.DRONE_EXPLOSION_RADIUS,
    damage: p.EXPLOSION_DAMAGE || CFG.DRONE_EXPLOSION_DAMAGE,
    height: p.EXPLOSION_HEIGHT || 28,
    waveSpeed: p.EXPLOSION_WAVE_SPEED || 24,
    duration: p.EXPLOSION_DURATION || 3.5,
    fireCount: p.EXPLOSION_FIRE_COUNT || 110,
    smokeCount: p.EXPLOSION_SMOKE_COUNT || 50,
    debrisCount: p.EXPLOSION_DEBRIS_COUNT || 40,
    coreColor: p.EXPLOSION_CORE_COLOR || '#ffdd66',
    fireColor: p.EXPLOSION_FIRE_COLOR || '#ff6600',
    smokeColor: p.EXPLOSION_SMOKE_COLOR || '#1a1a1a',
    debrisColor: p.EXPLOSION_DEBRIS_COLOR || '#3d2817',
  };

  gs.audio.playExplosion(pos);
  gs.explosionFX.trigger(pos, explosionOpts,
    (c, r, d) => handleExplosionDamage(c, r, d, els));

  if (gs.socket && gs.socket.connected && gs.playerId) {
    const buf = new ArrayBuffer(12);
    encodeEventCrash(buf, gs.playerId, pos.x, pos.z);
    gs.socket.sendBinary(wrapBinary(MSG.EVENT_CRASH, buf));
  }

  gs.audio.stopDrone();
  gs.mode = 'walk';
  gs.localDrone.piloted = false;
  gs.localDrone.physics.armed = false;
  gs.localDrone.physics.crashed = false;
  if (gs.localPlayer.group) gs.localPlayer.group.visible = true;
  setUIMode('walk', els);

  if (gs.socket && gs.socket.connected) gs.socket.sendJSON({ type: 'exit_drone' });

  const padX = gs.myTeam === 'blue' ? CFG.DRONE_PAD_POS_BLUE.x : CFG.DRONE_PAD_POS.x;
  const padZ = gs.myTeam === 'blue' ? CFG.DRONE_PAD_POS_BLUE.z : CFG.DRONE_PAD_POS.z;
  gs.localDrone.resetToPos(gs.collisionWorld, { x: padX, y: 0, z: padZ }, 0);

  if (gs.socket && gs.socket.connected) {
    gs.socket.sendJSON({
      type: 'drone_reset',
      x: gs.localDrone.position.x,
      y: gs.localDrone.position.y,
      z: gs.localDrone.position.z,
    });
  }

  const spawn = gs.myTeam === 'blue' ? CFG.TEAM_SPAWN_BLUE : CFG.TEAM_SPAWN_RED;
  if (gs.lastPlayerPos) {
    gs.localPlayer.spawn(gs.collisionWorld, gs.lastPlayerPos.x, gs.lastPlayerPos.z, 0);
  } else {
    gs.localPlayer.spawn(gs.collisionWorld, spawn.x, spawn.z, 0);
  }
}

export function posProbe(els) {
  const gs = GameState;
  if (!gs.localPlayer) return;
  const px = gs.localPlayer.position.x;
  const py = gs.localPlayer.position.y;
  const pz = gs.localPlayer.position.z;
  const lines = [`x=${px.toFixed(3)}`, `y=${py.toFixed(3)}`, `z=${pz.toFixed(3)}`];
  if (gs.collisionWorld.isReady()) {
    const gY = gs.collisionWorld.raycastDown(px, pz, py + 5, py - 50);
    lines.push(`groundY=${gY !== null ? gY.toFixed(3) : 'null'}`);
    if (gY !== null) lines.push(`offset=${(py - gY).toFixed(3)}`);
  }
  const full = lines.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(full).then(() => {
      els.btnPos.textContent = 'OK';
      setTimeout(() => { els.btnPos.textContent = 'POS'; }, 800);
    }).catch(() => fallbackCopy(full, els));
  } else fallbackCopy(full, els);
}

function fallbackCopy(text, els) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    els.btnPos.textContent = 'OK';
    setTimeout(() => { els.btnPos.textContent = 'POS'; }, 800);
  } catch {
    els.btnPos.textContent = 'ERR';
    setTimeout(() => { els.btnPos.textContent = 'POS'; }, 800);
  }
  document.body.removeChild(ta);
}
