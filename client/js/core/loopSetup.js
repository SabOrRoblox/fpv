import * as THREE from 'three';
import { CFG } from '../../../shared/config/config.js';
import {
  MSG, PLAYER_STATE_SIZE, DRONE_STATE_SIZE, CAR_STATE_SIZE,
  encodePlayerState, encodeDroneState, encodeCarState, wrapBinary,
  droneIdToIndex,
} from '../../../shared/net/protocol.js';
import { FixedLoop } from './loop.js';
import { GameState } from './gameState.js';
import {
  distToPad, distToCar, enterCar, exitCar,
  processCrash, handleExplosionDamage
} from './systems.js';

export function setupGameLoop(sceneMgr, camMgr, socket, stateManager, els, sensitivity, collisionWorld) {
  const camTargetPos = new THREE.Vector3();
  const camTiltQuat = new THREE.Quaternion();
  const camTiltAxis = new THREE.Vector3(1, 0, 0);
  const camForward = new THREE.Vector3();
  const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  let netAcc = 0;
  const netBuf = new ArrayBuffer(Math.max(DRONE_STATE_SIZE, CAR_STATE_SIZE));
  let camInitialized = false;

  let prevStickYaw = 0;
  let stickYawRate = 0;

  const loop = new FixedLoop({
    renderer: sceneMgr.renderer,
    physDt: CFG.PHYS_DT,
    onFixedUpdate: (dt) => {
      const gs = GameState;
      if (!gs.inGame || !gs.localPlayer || !gs.localDrone) return;

      if (gs.mode === 'walk') {
        if (gs.audio && gs.audio.carEngine) gs.audio.stopCarEngine();
        if (!gs._walkInit) {
          gs._walkInit = true;
          gs._fpvInit = false;
          gs._carInit = false;
        }
        gs.camYaw = sensitivity.camera.yaw;
        gs.localPlayer.update(dt, sensitivity.getPlayerInput(), gs.camYaw, gs.collisionWorld);
        const canEnter = distToPad() < CFG.PAD_RADIUS + 2.0 && gs.localPlayer.alive;
        els.btnEnter.style.display = canEnter ? 'block' : 'none';
        const canCar = gs.localCar && distToCar() < 4.0 && gs.localPlayer.alive;
        els.btnCarEnter.style.display = canCar ? 'block' : 'none';
        camInitialized = false;
      } else if (gs.mode === 'car') {
        if (!gs._carInit) {
          gs._carInit = true;
          gs._fpvInit = false;
          gs._walkInit = false;
        }
        const input = sensitivity.getCarInput();
        gs.localCar.update(dt, input, gs.collisionWorld);
        els.btnCarEnter.style.display = 'none';

        if (gs.audio) {
          if (!gs.audio.carEngine) gs.audio.playCarEngine();
          const ph = gs.localCar.physics;
          const rpmNorm = Math.min(1, Math.abs(ph.speed) / 25);
          gs.audio.updateCarEngine(rpmNorm * 6500, 6500, Math.abs(ph.speed), dt);
        }
      } else {
        if (gs.audio && gs.audio.carEngine) gs.audio.stopCarEngine();
        if (!gs._fpvInit) {
          gs._fpvInit = true;
          gs._walkInit = false;
          gs._carInit = false;
          prevStickYaw = sensitivity.camera.yaw;
          stickYawRate = 0;
        }

        const stick = sensitivity.getDroneInput();
        const ph = gs.localDrone.physics;

        let delta = stick.yaw - prevStickYaw;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;

        prevStickYaw = stick.yaw;

        const rateK = 1 - Math.exp(-CFG.FPV_STICK_SMOOTH * dt);
        stickYawRate += (delta / Math.max(dt, 1e-4) - stickYawRate) * rateK;

        const yawInput = Math.max(-1, Math.min(1, stickYawRate / CFG.FPV_STICK_RATE_SCALE));

        const safePitch = isFinite(stick.pitch) ? stick.pitch : 0;
        const safeThr = isFinite(stick.throttle) ? stick.throttle : 0;

        gs.localDrone.update(dt, {
          throttle: safeThr,
          yaw: yawInput,
          pitch: safePitch,
        }, gs.collisionWorld);

        processCrash(els);
      }

      if (gs.audio && gs.localDrone && gs.mode !== 'car') {
        const d = gs.localDrone.physics;
        const isDrone = gs.mode === 'fpv';
        if (isDrone) {
          if (!gs.audio.drone) gs.audio.playDrone();
          gs.audio.playWind();
          gs.audio.updateDrone(d.rpm, gs.localDrone.params.MAX_RPM, d.getSpeed(), 0);
          gs.audio.updateWind(d.getSpeed());
        } else {
          if (gs.audio.drone) gs.audio.stopDrone();
          gs.audio.stopWind();
        }
      } else if (gs.mode === 'car' && gs.audio) {
        if (gs.audio.drone) gs.audio.stopDrone();
        gs.audio.stopWind();
      }
    },
    onRender: (dt, alpha) => {
      const gs = GameState;
      sensitivity.camera.update(dt);

      netAcc += dt;
      if (netAcc >= 1 / CFG.NET_RATE) {
        netAcc = 0;
        if (socket.connected && gs.playerId && gs.inGame) {
          if (gs.mode === 'walk') {
            encodePlayerState(netBuf, 0, gs.playerId,
              gs.localPlayer.position.x, gs.localPlayer.position.y, gs.localPlayer.position.z,
              gs.localPlayer.yaw, gs.localPlayer.physics.hp, gs.localPlayer.alive);
            socket.sendBinary(wrapBinary(MSG.STATE_PLAYER, netBuf.slice(0, PLAYER_STATE_SIZE)));
          } else if (gs.mode === 'car') {
            const c = gs.localCar.physics;
            encodeCarState(netBuf, 0, gs.playerId,
              c.position.x, c.position.y, c.position.z, c.yaw,
              c.hp | 0, 0);
            socket.sendBinary(wrapBinary(MSG.STATE_CAR, netBuf.slice(0, CAR_STATE_SIZE)));
          } else {
            const d = gs.localDrone.physics;
            encodeDroneState(netBuf, 0, gs.playerId,
              d.position.x, d.position.y, d.position.z,
              d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w,
              d.crashed, d.rpm | 0, droneIdToIndex(gs.localDrone.droneId));
            socket.sendBinary(wrapBinary(MSG.STATE_DRONE, netBuf));
          }
        }
      }

      if (gs.audio) {
        gs.audio.updateListener();

        if (stateManager && stateManager.remoteDrones) {
          for (const [id, rd] of stateManager.remoteDrones) {
            gs.audio.updateRemoteDrone(id, rd.rpm || 0, 26000, rd.group.position);
          }
        }
      }

      if (gs.inGame && gs.localPlayer && gs.localDrone) {
        gs.localPlayer.render(alpha);
        gs.localDrone.render(alpha);
        if (gs.localCar) gs.localCar.render(alpha);

        if (gs.mode === 'walk') {
          const p = gs.localPlayer.group.position;
          const cam = sensitivity.camera;
          const dist = cam.distance;
          const h = 6.0 + Math.sin(cam.pitch) * dist;
          const horiz = Math.cos(cam.pitch) * dist;
          const tx = p.x - Math.sin(cam.yaw) * horiz;
          const tz = p.z - Math.cos(cam.yaw) * horiz;
          const ty = p.y + h;
          const k = 1 - Math.exp(-CFG.CAMERA_FOLLOW_SMOOTH * dt);
          camMgr.camera.position.x += (tx - camMgr.camera.position.x) * k;
          camMgr.camera.position.y += (ty - camMgr.camera.position.y) * k;
          camMgr.camera.position.z += (tz - camMgr.camera.position.z) * k;
          camMgr.camera.lookAt(p.x, p.y + 1.5, p.z);
        } else if (gs.mode === 'car') {
          const p = gs.localCar.group.position;
          const cam = sensitivity.camera;
          const dist = 8.0;
          const h = 3.5 + Math.sin(cam.pitch) * dist;
          const horiz = Math.cos(cam.pitch) * dist;
          const tx = p.x - Math.sin(cam.yaw) * horiz;
          const tz = p.z - Math.cos(cam.yaw) * horiz;
          const ty = p.y + h;
          const k = 1 - Math.exp(-CFG.CAMERA_FOLLOW_SMOOTH * dt);
          camMgr.camera.position.x += (tx - camMgr.camera.position.x) * k;
          camMgr.camera.position.y += (ty - camMgr.camera.position.y) * k;
          camMgr.camera.position.z += (tz - camMgr.camera.position.z) * k;
          camMgr.camera.lookAt(p.x, p.y + 1.0, p.z);
        } else {
          const p = gs.localDrone.group.position;
          const q = gs.localDrone.group.quaternion;
          const ph = gs.localDrone.physics;

          const droneSize = gs.localDrone.targetSize || 10.0;
          const halfSize = droneSize * 0.5;

          camForward.set(
            0,
            halfSize * CFG.FPV_NOSE_UP,
            halfSize * CFG.FPV_NOSE_FORWARD * CFG.FPV_FORWARD_SIGN + CFG.FPV_FORWARD_EXTRA * CFG.FPV_FORWARD_SIGN
          ).applyQuaternion(q);

          camTargetPos.set(
            p.x + camForward.x,
            p.y + camForward.y,
            p.z + camForward.z
          );

          camEuler.set(ph.pitchAngle, ph.yaw, 0, 'YXZ');
          camMgr.camera.quaternion.setFromEuler(camEuler);

          camTiltQuat.setFromAxisAngle(camTiltAxis, camMgr.camTilt);
          camMgr.camera.quaternion.multiply(camTiltQuat);

          if (!camInitialized) {
            camMgr.camera.position.copy(camTargetPos);
            camMgr.camera.fov = CFG.FPV_FOV_BASE;
            camMgr.camera.updateProjectionMatrix();
            camInitialized = true;
          } else {
            const posK = 1 - Math.exp(-CFG.FPV_POS_SMOOTH * dt);
            camMgr.camera.position.lerp(camTargetPos, posK);

            const speed = ph.getSpeed();
            const targetFov = CFG.FPV_FOV_BASE + Math.min(speed * CFG.FPV_FOV_SPEED_GAIN, CFG.FPV_FOV_SPEED_MAX);
            camMgr.camera.fov += (targetFov - camMgr.camera.fov) * Math.min(1, dt * 5);
            camMgr.camera.updateProjectionMatrix();

            const rpmNorm = ph.rpm / 26000;
            const shakeAmp = CFG.FPV_SHAKE_AMP * rpmNorm;
            if (shakeAmp > CFG.FPV_SHAKE_MIN) {
              const t = (ph._simTime || 0) + ph._noiseSeed;
              camMgr.camera.rotateX(Math.sin(t * 47) * shakeAmp);
              camMgr.camera.rotateY(Math.sin(t * 53) * shakeAmp);
            }
          }
        }

        const isDrone = gs.mode === 'fpv';
        const isCar = gs.mode === 'car';
        const speed = isDrone
          ? gs.localDrone.physics.getSpeed()
          : Math.hypot(gs.localPlayer.physics.velocity.x, gs.localPlayer.physics.velocity.z);
        const alt = isDrone ? gs.localDrone.physics.position.y : gs.localPlayer.physics.position.y;
        const vsi = isDrone ? gs.localDrone.physics.velocity.y : gs.localPlayer.physics.velocity.y;
        const rpm = isDrone ? gs.localDrone.physics.rpm : 0;
        const battery = isDrone ? gs.localDrone.getBattery() : 100;
        const carSpeed = isCar ? gs.localCar.physics.getSpeedKmh() : 0;

        gs.hud.update(dt, {
          speed, alt, vsi, battery,
          rpm, isDrone, isCar, carSpeed,
          hp: gs.localPlayer.physics.hp,
        });
      }

      if (gs.explosionFX) gs.explosionFX.update(dt);
      stateManager.update(dt, performance.now() / 1000);
      sceneMgr.render();
    },
  });

  loop.start();
  return loop;
}