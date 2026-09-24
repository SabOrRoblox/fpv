import * as THREE from 'three';
import { CFG, SERVER } from '../../shared/config/config.js';
import { MSG, droneIdToIndex } from '../../shared/net/protocol.js';
import { SceneManager } from './core/scene.js';
import { CameraManager } from './core/cameraManager.js';
import { AssetsLoader } from './core/assetsLoader.js';
import { AudioManager } from './core/audioManager.js';
import { initErrorOverlay } from './core/errorOverlay.js';
import { LocalPlayer } from './entities/LocalPlayer.js';
import { LocalDrone } from './entities/LocalDrone.js';
import { LocalCar } from './entities/LocalCar.js';
import { Hud } from './render/hud.js';
import { Menu } from './ui/menu.js';
import { DeathScreen } from './ui/deathScreen.js';
import { DroneSelectMenu } from './ui/droneSelectMenu.js';
import { TeamSelectMenu } from './ui/teamSelectMenu.js';
import { setupNetworkHandlers } from './ui/disconnectHandler.js';
import { Chat } from './ui/chat.js';
import { placeMap, mergeByMaterial } from './world/mapLoader.js';
import { buildCollision } from './world/collisionLoader.js';
import { CollisionWorld } from './world/collisionWorld.js';
import { ExplosionFX } from './fx/explosion.js';
import { Sensitivity } from './core/sensitivity.js';
import { GameState } from './core/gameState.js';
import { GameSocket } from './net/socket.js';
import { StateManager } from './net/stateManager.js';
import { DebugHud } from './core/debugHud.js';
import {
  distToPad, distToCar, setUIMode, respawnAll,
  enterDrone, exitDrone, enterCar, exitCar,
  processCrash, posProbe, handleExplosionDamage
} from './core/systems.js';
import { setupGameLoop } from './core/loopSetup.js';

const DEBUG = false;

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
const socket = new GameSocket(SERVER.getUrl());
const stateManager = new StateManager(sceneMgr.scene);
const chat = new Chat(socket);

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
  carCyl: document.getElementById('car-cylinder'),
  carSteer: document.getElementById('car-steer'),
  btnSteerLeft: document.getElementById('btn-steer-left'),
  btnSteerRight: document.getElementById('btn-steer-right'),
  btnEnter: document.getElementById('btn-drone-enter'),
  btnExit: document.getElementById('btn-drone-exit'),
  btnCarEnter: document.getElementById('btn-car-enter'),
  btnCarExit: document.getElementById('btn-car-exit'),
  sideButtons: document.getElementById('side-buttons'),
  btnDrones: document.getElementById('btn-drones'),
  btnCar: document.getElementById('btn-car'),
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

function setLoading(pct, status) {
  loadingPct.textContent = Math.round(pct * 100);
  loadingFill.style.width = (pct * 100) + '%';
  if (status) loadingStatus.textContent = status;
}

async function bootstrap() {
  setLoading(0.05, 'загрузка моделей');
  const gltfs = await assets.loadAll(
    ['map.glb', 'collision.glb', 'dron1.glb', 'dron2.glb', 'dron3.glb', 'dron4.glb', 'bro.glb', 'car.glb'],
    (p, name) => setLoading(0.05 + p * 0.75, 'загрузка ' + name)
  );
  GameState.allGltfs = gltfs;

  setLoading(0.85, 'размещение карты');
  GameState.mapRootRef = placeMap(sceneMgr.scene, gltfs['map.glb']);
  mergeByMaterial(GameState.mapRootRef);

  setLoading(0.9, 'построение коллизий');
  GameState.collisionRootRef = buildCollision(gltfs['collision.glb']);
  collisionWorld.attachRoot(GameState.collisionRootRef);

  setLoading(0.95, 'создание сущностей');
  GameState.localPlayer = new LocalPlayer(sceneMgr.scene, gltfs['bro.glb']);
  GameState.localDrone = new LocalDrone(sceneMgr.scene, gltfs['dron1.glb'], audio);
  GameState.localCar = new LocalCar(sceneMgr.scene, gltfs['car.glb']);
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

  setupGameLoop(sceneMgr, camMgr, socket, stateManager, els, sensitivity, collisionWorld);
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

function spawnLocalCar() {
  const gs = GameState;
  if (!gs.localPlayer || !gs.localCar) return;
  const p = gs.localPlayer.position;
  const yaw = gs.localPlayer.yaw;
  const dist = 6.0;
  const x = p.x + Math.sin(yaw) * dist;
  const z = p.z + Math.cos(yaw) * dist;
  gs.localCar.spawn(gs.collisionWorld, x, z, yaw);
  if (gs.socket && gs.socket.connected) {
    gs.socket.sendJSON({
      type: 'car_reset',
      x, y: 0, z, yaw,
    });
  }
}

bootstrap().catch((e) => console.error('BOOT FAIL', e));

setupNetworkHandlers(socket, {
  onKickReset: () => {
    GameState.inGame = false;
    GameState.mode = 'walk';
    GameState.myTeam = null;
    GameState.mySpawn = null;
    if (GameState.localDrone) {
      GameState.localDrone.piloted = false;
      GameState.localDrone.physics.armed = false;
      GameState.localDrone.physics.crashed = false;
    }
    if (GameState.localPlayer && GameState.localPlayer.group) {
      GameState.localPlayer.group.visible = true;
    }
    if (GameState.audio) {
      GameState.audio.stopDrone();
      GameState.audio.stopCarEngine();
    }
    hud.hide();
    setUIMode('walk', els);
    menu.show();
  },
  onBan: () => {
    GameState.inGame = false;
    hud.hide();
  },
});

socket.on('welcome', (msg) => {
  GameState.playerId = Number(msg.id) | 0;
  GameState.roomId = msg.roomId;
  stateManager.setMyId(GameState.playerId);
  chat.setMyId(GameState.playerId);
  if (GameState.localDrone) {
    GameState.localDrone.droneId = localStorage.getItem('selectedDrone') || 'dron1';
  }
});

socket.on('players', (msg) => stateManager.syncWithPlayerList(msg.list));
socket.on('leave', (msg) => {
  stateManager.removePlayer(msg.id);
  delete GameState.remoteTeams[msg.id];
});
socket.on('binary', (type, payload) => stateManager.handleBinary(type, payload, GameState.allGltfs));
socket.on('validation_fail', (msg) => console.warn('[main] server rejected:', msg.reason));

socket.on('team_choice', (msg) => {
  if (GameState.myTeam) return;
  const t = msg.teams || { red: 0, blue: 0 };
  teamSelect.show(t);
});

socket.on('team_counts', (msg) => {
  if (!teamSelect.isOpen) return;
  teamSelect.setCounts(msg.red || 0, msg.blue || 0);
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

  if (!teamSelect.isOpen) return;
  let red = 0, blue = 0;
  for (const t of Object.values(GameState.remoteTeams)) {
    if (t === 'red') red++;
    else if (t === 'blue') blue++;
  }
  if (GameState.myTeam === 'red') red++;
  else if (GameState.myTeam === 'blue') blue++;
  teamSelect.setCounts(red, blue);
});

socket.on('team_reject', (msg) => {
  teamSelect.setStatus('Нельзя: ' + (msg.reason || 'unknown'));
  teamSelect.resetSelection();
});

socket.on('drone_selected', (msg) => {
  if (GameState.localDrone) GameState.localDrone.droneId = msg.droneId;
});

socket.on('car_entered', () => {});

socket.on('mode', (msg) => {
  if (stateManager.setPlayerDroneId) stateManager.setPlayerDroneId(msg.id, msg.droneId);
});

socket.on('error', (msg) => {
  if (msg.reason === 'too_far_from_pad') {
    const gs = GameState;
    if (gs.mode === 'fpv') {
      gs.localDrone.piloted = false;
      gs.localDrone.physics.armed = false;
      gs.localDrone.physics.crashed = false;
      gs.mode = 'walk';
      if (gs.localPlayer.group) gs.localPlayer.group.visible = true;
      setUIMode('walk', els);
      gs.audio.stopDrone();
      els.touchCam.resetPitchOnRelease = false;
    }
  } else if (msg.reason === 'too_far_from_car') {
    const gs = GameState;
    if (gs.mode === 'car') {
      gs.mode = 'walk';
      if (gs.localPlayer.group) gs.localPlayer.group.visible = true;
      setUIMode('walk', els);
    }
  }
});

socket.on('room_state', (msg) => {
  menu.setCount(msg.total, (msg.rooms || []).length * 10);
});

stateManager.onCrash = (ev) => {
  if (ev.id === GameState.playerId) return;
  if (!isFinite(ev.x) || !isFinite(ev.z)) return;
  const pos = new THREE.Vector3(ev.x, 0, ev.z);
  if (GameState.collisionWorld && GameState.collisionWorld.isReady()) {
    const gY = GameState.collisionWorld.raycastDown(ev.x, ev.z, 500, -50);
    if (gY === null) return;
    pos.y = gY;
  } else {
    return;
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

const _origMenuShow = menu.show.bind(menu);
menu.show = () => {
  _origMenuShow();
  if (socket.connected) {
    socket.sendJSON({ type: 'request_room_state' });
  }
};

deathScreen.onRespawn = () => {
  const spawn = GameState.mySpawn || CFG.TEAM_SPAWN_RED;
  respawnAll(els, spawn);
};

els.btnDrones.addEventListener('pointerdown', (e) => { e.preventDefault(); droneSelect.toggle(); });
els.btnCar.addEventListener('pointerdown', (e) => { e.preventDefault(); spawnLocalCar(); });
els.btnEnter.addEventListener('pointerdown', (e) => { e.preventDefault(); enterDrone(els); });
els.btnExit.addEventListener('pointerdown', (e) => { e.preventDefault(); exitDrone(els); });
els.btnCarEnter.addEventListener('pointerdown', (e) => { e.preventDefault(); enterCar(els); });
els.btnCarExit.addEventListener('pointerdown', (e) => { e.preventDefault(); exitCar(els); });
els.btnPos.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); posProbe(els); });

window.addEventListener('beforeunload', () => {
  socket.disconnect();
  if (audio) {
    audio.stopDrone();
    audio.stopWind();
    audio.stopCarEngine();
    for (const id of [...audio.remoteDrones.keys()]) audio.removeRemoteDrone(id);
  }
});