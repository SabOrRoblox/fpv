import * as THREE from 'three';
import { CFG } from '../../shared/config/config.js';
import {
  MSG, PLAYER_STATE_SIZE, DRONE_STATE_SIZE,
  encodePlayerState, encodeDroneState, wrapBinary,
  encodeEventCrash,
} from '../../shared/net/protocol.js';
import { SceneManager } from './core/scene.js';
import { FixedLoop } from './core/loop.js';
import { CameraManager } from './core/cameraManager.js';
import { AssetsLoader } from './core/assetsLoader.js';
import { AudioManager } from './core/audioManager.js';
import { initErrorOverlay } from './core/errorOverlay.js';
import { LocalPlayer } from './entities/LocalPlayer.js';
import { LocalDrone } from './entities/LocalDrone.js';
import { Hud } from './render/hud.js';
import { Menu } from './ui/menu.js';
import { DeathScreen } from './ui/deathScreen.js';
import { DroneSelectMenu } from './ui/droneSelectMenu.js';
import { TeamSelectMenu } from './ui/teamSelectMenu.js';
import { placeMap } from './world/mapLoader.js';
import { buildCollision } from './world/collisionLoader.js';
import { CollisionWorld } from './world/collisionWorld.js';
import { ExplosionFX } from './fx/explosion.js';
import { Sensitivity } from './core/sensitivity.js';
import { GameState } from './core/gameState.js';
import { GameSocket } from './net/socket.js';
import { StateManager } from './net/stateManager.js';
import { DebugHud } from './core/debugHud.js';
import {
  distToPad, setUIMode, respawnAll,
  enterDrone, exitDrone, processCrash, posProbe, handleExplosionDamage
} from './core/systems.js';

const DEBUG = true;

initErrorOverlay();

const canvas = document.getElementById('game-canvas');
const sceneMgr = new SceneManager(canvas);
const camMgr = new CameraManager(sceneMgr.camera);
const assets = new AssetsLoader('./assets/models/');
const audio = new AudioManager();
const hud = new Hud();
const menu = new Menu();
const deathScreen = new DeathScreen();
const sensitivity = new Sensitivity();
const collisionWorld = new CollisionWorld();
const droneSelect = new DroneSelectMenu();
const teamSelect = new TeamSelectMenu();
const socket = new GameSocket('wss://server-3b0j.onrender.com');
const stateManager = new StateManager(sceneMgr.scene);

audio.attachListener(sceneMgr.camera);

GameState.sceneMgr = sceneMgr;
GameState.camMgr = camMgr;
GameState.hud = hud;
GameState.audio = audio;
GameState.collisionWorld = collisionWorld;
GameState.socket = socket;
GameState.stateManager = stateManager;

const els = {
  joyMove: document.getElementById('joy-move'),
  cylDrone: document.getElementById('drone-cylinder'),
  btnEnter: document.getElementById('btn-drone-enter'),
  btnExit: document.getElementById('btn-drone-exit'),
  sideButtons: document.getElementById('side-buttons'),
  btnDrones: document.getElementById('btn-drones'),
  btnCars: document.getElementById('btn-cars'),
  btnPos: document.getElementById('btn-pos'),
  playerControls: sensitivity,
  droneControls: sensitivity,
  touchCam: sensitivity.camera,
  droneSelect,
  deathScreen,
};

if (DEBUG) {
  window.GameState = GameState;
  window.__sens = sensitivity;
  window.__collisionWorld = collisionWorld;
  window.__stateManager = stateManager;
  window.__socket = socket;
  new DebugHud(collisionWorld, stateManager, socket, sensitivity);
}

const loadingEl = document.getElementById('loading');
const loadingPct = document.getElementById('loading-pct');
const loadingFill = document.getElementById('loading-fill');
const loadingStatus = document.getElementById('loading-status');

const camOffsetVec = new THREE.Vector3();

function setLoading(pct, status) {
  loadingPct.textContent = Math.round(pct * 100);
  loadingFill.style.width = (pct * 100) + '%';
  if (status) loadingStatus.textContent = status;
}

async function bootstrap() {
  setLoading(0.05, 'загрузка моделей');
  const gltfs = await assets.loadAll(
    ['map.glb', 'collision.glb', 'dron1.glb', 'dron2.glb', 'bro.glb'],
    (p, name) => setLoading(0.05 + p * 0.75, 'загрузка ' + name)
  );
  GameState.allGltfs = gltfs;

  setLoading(0.85, 'размещение карты');
  GameState.mapRootRef = placeMap(sceneMgr.scene, gltfs['map.glb']);

  setLoading(0.9, 'построение коллизий');
  GameState.collisionRootRef = buildCollision(gltfs['collision.glb']);
  collisionWorld.attachRoot(GameState.collisionRootRef);

  setLoading(0.95, 'создание сущностей');
  GameState.localPlayer = new LocalPlayer(sceneMgr.scene, gltfs['bro.glb']);
  GameState.localDrone = new LocalDrone(sceneMgr.scene, gltfs['dron1.glb'], audio);
  GameState.explosionFX = new ExplosionFX(sceneMgr.scene);

  await droneSelect.load();
  const savedId = localStorage.getItem('selectedDrone') || 'dron1';
  applyDronePreset(savedId);
  droneSelect.onSelect = (id) => {
    applyDronePreset(id);
    const gs = GameState;
    if (gs.mode === 'fpv') return;
    if (gs.localPlayer && gs.localDrone && gs.collisionWorld) {
      gs.localDrone.spawnAheadOf(gs.collisionWorld, gs.localPlayer.position, gs.localPlayer.yaw);
      if (gs.socket && gs.socket.connected) {
        gs.socket.sendJSON({
          type: 'drone_reset',
          x: gs.localDrone.position.x,
          y: gs.localDrone.position.y,
          z: gs.localDrone.position.z,
        });
      }
    }
  };

  setLoading(1.0, 'готово');
  await new Promise(r => setTimeout(r, 200));
  loadingEl.classList.add('hidden');
  GameState.ready = true;
  menu.show();
  setUIMode('walk', els);
}

function applyDronePreset(id) {
  const data = droneSelect.getDroneData(id);
  if (!data) return;
  const drone = GameState.localDrone;
  if (!drone) return;
  const gltf = GameState.allGltfs[data.model] || null;
  if (gltf) drone.setModel(gltf);
  if (data.targetSize) drone.setTargetSize(data.targetSize);
  if (data.params) drone.setParams(data.params);
  if (data.id) drone.droneId = data.id;
}

bootstrap().catch((e) => console.error('BOOT FAIL', e));

socket.on('open', () => {});
socket.on('welcome', (msg) => {
  GameState.playerId = Number(msg.id) | 0;
  GameState.roomId = msg.roomId;
  stateManager.setMyId(GameState.playerId);
  if (GameState.localDrone) GameState.localDrone.droneId = localStorage.getItem('selectedDrone') || 'dron1';
});
socket.on('players', (msg) => stateManager.syncWithPlayerList(msg.list));
socket.on('leave', (msg) => stateManager.removePlayer(msg.id));
socket.on('binary', (type, payload) => stateManager.handleBinary(type, payload, GameState.allGltfs));
socket.on('validation_fail', (msg) => console.warn('[main] server rejected:', msg.reason));

socket.on('team_choice', (msg) => {
  const t = msg.teams || { red: 0, blue: 0 };
  teamSelect.show(t);
});

teamSelect.onChoose = (team) => {
  socket.sendJSON({ type: 'choose_team', team });
};

socket.on('team_assigned', (msg) => {
  GameState.myTeam = msg.team;
  GameState.mySpawn = msg.spawn;
  teamSelect.hide();
  respawnAll(els, msg.spawn);
});

socket.on('team_update', (msg) => {
  GameState.remoteTeams[msg.id] = msg.team;
  if (stateManager.setPlayerTeam) stateManager.setPlayerTeam(msg.id, msg.team);

  const counts = { red: 0, blue: 0 };
  for (const t of Object.values(GameState.remoteTeams)) {
    if (t === 'red') counts.red++;
    else if (t === 'blue') counts.blue++;
  }
  if (teamSelect.modal && !teamSelect.modal.classList.contains('hidden')) {
    teamSelect.setCounts(counts.red, counts.blue);
  }
});

socket.on('team_reject', (msg) => {
  teamSelect.setStatus('Нельзя: ' + (msg.reason || 'unknown'));
  teamSelect.selected = null;
  teamSelect.btnRed.classList.remove('selected');
  teamSelect.btnBlue.classList.remove('selected');
});

socket.on('error', (msg) => {
  console.error('[main] server error:', msg.reason);
  if (msg.reason === 'too_far_from_pad') {
    const gs = GameState;
    if (gs.mode === 'fpv') {
      gs.localDrone.piloted = false;
      gs.localDrone.physics.armed = false;
      gs.localDrone.physics.crashed = false;
      gs.mode = 'walk';
      setUIMode('walk', els);
      gs.audio.stopDrone();
      els.touchCam.resetPitchOnRelease = false;
    }
    return;
  }
  menu.setStatus('Ошибка: ' + (msg.reason || 'unknown'));
  menu.show();
});

socket.on('room_state', (msg) => {
  menu.setCount(msg.total, (msg.rooms || []).length * 10);
});

socket.on('drone_selected', (msg) => {
  if (GameState.localDrone) GameState.localDrone.droneId = msg.droneId;
});

stateManager.onCrash = (ev) => {
  if (ev.id === GameState.playerId) return;
  const pos = new THREE.Vector3(ev.x, 0, ev.z);
  if (GameState.collisionWorld && GameState.collisionWorld.isReady()) {
    const gY = GameState.collisionWorld.raycastDown(ev.x, ev.z, 10000, -10000);
    if (gY !== null) pos.y = gY;
  }
  if (GameState.explosionFX) {
    GameState.explosionFX.trigger(pos, {
      radius: CFG.DRONE_EXPLOSION_RADIUS,
      damage: CFG.DRONE_EXPLOSION_DAMAGE,
      height: 28,
      waveSpeed: 24,
      duration: 3.5,
    }, (c, r, d) => handleExplosionDamage(c, r, d, els));
  }
  if (GameState.audio) GameState.audio.playExplosion(pos);
};

menu.onPlay = () => {
  if (!GameState.ready) return;
  audio.init();
  audio.resume();
  menu.hide();
  hud.show();
  hud.refreshCanvas();
  GameState.inGame = true;
  socket.connect('p_' + Math.floor(Math.random() * 10000));
};

deathScreen.onRespawn = () => {
  const spawn = GameState.mySpawn || CFG.PLAYER_SPAWN;
  respawnAll(els, spawn);
};

els.btnDrones.addEventListener('pointerdown', (e) => { e.preventDefault(); droneSelect.toggle(); });
els.btnCars.addEventListener('pointerdown', (e) => e.preventDefault());
els.btnEnter.addEventListener('pointerdown', (e) => { e.preventDefault(); enterDrone(els); });
els.btnExit.addEventListener('pointerdown', (e) => { e.preventDefault(); exitDrone(els); });
els.btnPos.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); posProbe(els); });

let netAcc = 0;
const netBuf = new ArrayBuffer(DRONE_STATE_SIZE);

const loop = new FixedLoop({
  renderer: sceneMgr.renderer,
  physDt: CFG.PHYS_DT,
  onFixedUpdate: (dt) => {
    const gs = GameState;
    if (!gs.inGame || !gs.localPlayer || !gs.localDrone) return;

    if (gs.mode === 'walk') {
      gs.camYaw = sensitivity.camera.yaw;
      gs.localPlayer.update(dt, sensitivity.getPlayerInput(), gs.camYaw, gs.collisionWorld);
      const canEnter = distToPad() < CFG.PAD_RADIUS + 2.0 && gs.localPlayer.alive;
      els.btnEnter.style.display = canEnter ? 'block' : 'none';
    } else {
      const stick = sensitivity.getDroneInput();
      const ph = gs.localDrone.physics;
      let dYaw = stick.yaw - ph.yaw;
      while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
      while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
      if (!isFinite(dYaw)) dYaw = 0;
      const safePitch = isFinite(stick.pitch) ? stick.pitch : 0;
      const safeThr = isFinite(stick.throttle) ? stick.throttle : 0;
      gs.localDrone.update(dt, { throttle: safeThr, yaw: dYaw, pitch: safePitch }, gs.collisionWorld);
      processCrash(els);
    }

    if (gs.audio && gs.localDrone) {
      const d = gs.localDrone.physics;
      const isDrone = gs.mode === 'fpv';
      if (isDrone) {
        if (!gs.audio.drone) gs.audio.playDrone();
        gs.audio.updateDrone(d.rpm, gs.localDrone.params.MAX_RPM, d.getSpeed(), 0);
      } else {
        if (gs.audio.drone) gs.audio.stopDrone();
      }
    }

    netAcc += dt;
    if (netAcc >= 1 / CFG.NET_RATE) {
      netAcc = 0;
      if (socket.connected && gs.playerId) {
        if (gs.mode === 'walk') {
          encodePlayerState(netBuf, 0, gs.playerId,
            gs.localPlayer.position.x, gs.localPlayer.position.y, gs.localPlayer.position.z,
            gs.localPlayer.yaw, gs.localPlayer.physics.hp, gs.localPlayer.alive);
          socket.sendBinary(wrapBinary(MSG.STATE_PLAYER, netBuf.slice(0, PLAYER_STATE_SIZE)));
        } else {
          const d = gs.localDrone.physics;
          encodeDroneState(netBuf, 0, gs.playerId,
            d.position.x, d.position.y, d.position.z,
            d.quaternion.x, d.quaternion.y, d.quaternion.z, d.quaternion.w,
            d.crashed, d.rpm | 0);
          socket.sendBinary(wrapBinary(MSG.STATE_DRONE, netBuf));
        }
      }
    }
  },
  onRender: (dt, alpha) => {
    const gs = GameState;
    sensitivity.camera.update(dt);

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
      } else {
        const p = gs.localDrone.group.position;
        const q = gs.localDrone.group.quaternion;
        camOffsetVec.set(0, CFG.FPV_NOSE_UP, CFG.FPV_NOSE_FORWARD).applyQuaternion(q);
        camMgr.camera.position.set(
          p.x + camOffsetVec.x,
          p.y + camOffsetVec.y,
          p.z + camOffsetVec.z
        );
        camMgr.camera.quaternion.copy(q);
        camMgr.camera.rotateX(camMgr.camTilt);
      }

      const isDrone = gs.mode === 'fpv';
      const speed = isDrone
        ? gs.localDrone.physics.getSpeed()
        : Math.hypot(gs.localPlayer.physics.velocity.x, gs.localPlayer.physics.velocity.z);
      const alt = isDrone ? gs.localDrone.physics.position.y : gs.localPlayer.physics.position.y;
      const vsi = isDrone ? gs.localDrone.physics.velocity.y : gs.localPlayer.physics.velocity.y;
      const rpm = isDrone ? gs.localDrone.physics.rpm : 0;
      const battery = isDrone ? gs.localDrone.getBattery() : 100;

      hud.update(dt, {
        speed, alt, vsi, battery,
        ping: socket.ping, rpm, isDrone,
        hp: gs.localPlayer.physics.hp,
      });
    }

    if (gs.explosionFX) gs.explosionFX.update(dt);
    stateManager.update(dt, performance.now() / 1000);
    sceneMgr.render();
  },
});

loop.start();

window.addEventListener('beforeunload', () => {
  socket.disconnect();
  if (audio) {
    audio.stopDrone();
    for (const id of [...audio.remoteDrones.keys()]) audio.removeRemoteDrone(id);
  }
});
