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

export function setUIMode(mode, els) {
  const gs = GameState;
  if (mode === 'fpv') {
    els.joyMove.style.display = 'none';
    els.cylDrone.style.display = 'flex';
    els.btnEnter.style.display = 'none';
    els.btnExit.style.display = 'block';
    els.sideButtons.style.display = 'none';
    gs.hud.setMode('fpv');
  } else {
    els.joyMove.style.display = 'block';
    els.cylDrone.style.display = 'none';
    els.btnEnter.style.display = 'none';
    els.btnExit.style.display = 'none';
    els.sideButtons.style.display = 'flex';
    gs.hud.setMode('walk');
  }
  requestAnimationFrame(() => {
    if (els.playerControls && els.playerControls.refresh) els.playerControls.refresh();
    if (els.droneControls && els.droneControls.refresh) els.droneControls.refresh();
  });
  gs.mode = mode;
}

export function respawnAll(els) {
  const gs = GameState;
  gs.localPlayer.spawn(gs.collisionWorld, CFG.PLAYER_SPAWN.x, CFG.PLAYER_SPAWN.z, 0);
  gs.localDrone.resetToPos(gs.collisionWorld, { x: CFG.DRONE_PAD_POS.x, y: 0, z: CFG.DRONE_PAD_POS.z }, 0);
  gs.lastCrashProcessed = false;
  gs.camYaw = 0;
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

  if (gs.collisionWorld && gs.collisionWorld.isReady()) {
    const gY = gs.collisionWorld.raycastDown(
      gs.localDrone.position.x,
      gs.localDrone.position.z,
      10000, -10000
    );
    if (gY !== null) gs.localDrone.physics.groundY = gY;
  }

  gs.localDrone.piloted = true;
  gs.localDrone.physics.armed = true;
  gs.localDrone.physics.crashed = false;
  gs.lastCrashProcessed = false;
  els.droneControls.reset();
  els.droneSelect.close();

  els.touchCam.resetPitchOnRelease = true;
  els.touchCam._targetYaw = gs.localDrone.physics.yaw;
  els.touchCam._currentYaw = gs.localDrone.physics.yaw;
  els.touchCam._targetPitch = 0;
  els.touchCam._currentPitch = 0;

  if (gs.socket && gs.socket.connected) {
    gs.socket.sendJSON({
      type: 'enter_drone',
      droneId: gs.localDrone.droneId || 'dron1',
      dx: gs.localDrone.position.x,
      dz: gs.localDrone.position.z,
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

  let spawnX = droneX + 2.0;
  let spawnZ = droneZ;

  if (!isFinite(spawnX) || !isFinite(spawnZ) || !isFinite(droneY)) {
    spawnX = CFG.PLAYER_SPAWN.x;
    spawnZ = CFG.PLAYER_SPAWN.z;
  } else if (gs.collisionWorld && gs.collisionWorld.isReady()) {
    const gY = gs.collisionWorld.raycastDown(spawnX, spawnZ, 10000, -10000);
    if (gY === null || droneY > gY + 50) {
      spawnX = CFG.PLAYER_SPAWN.x;
      spawnZ = CFG.PLAYER_SPAWN.z;
    }
  }

  gs.localPlayer.spawn(gs.collisionWorld, spawnX, spawnZ, 0);

  if (gs.socket && gs.socket.connected) {
    gs.socket.sendJSON({ type: 'exit_drone' });
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

  gs.audio.playExplosion();
  gs.explosionFX.trigger(pos, CFG.DRONE_EXPLOSION_RADIUS, CFG.DRONE_EXPLOSION_DAMAGE,
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
  setUIMode('walk', els);

  if (gs.socket && gs.socket.connected) gs.socket.sendJSON({ type: 'exit_drone' });

  gs.localDrone.resetToPos(gs.collisionWorld, { x: CFG.DRONE_PAD_POS.x, y: 0, z: CFG.DRONE_PAD_POS.z }, 0);

  if (gs.socket && gs.socket.connected) {
    gs.socket.sendJSON({
      type: 'drone_reset',
      x: gs.localDrone.position.x,
      y: gs.localDrone.position.y,
      z: gs.localDrone.position.z,
    });
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
    const gY = gs.collisionWorld.raycastDown(px, pz, 10000, -10000);
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