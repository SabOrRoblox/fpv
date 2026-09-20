

export class DebugHud {
  constructor(collisionWorld, stateManager, socket, sensitivity) {
    this.collisionWorld = collisionWorld;
    this.stateManager = stateManager;
    this.socket = socket;
    this.sensitivity = sensitivity;
    this.visible = true;

    this.el = document.createElement('div');
    this.el.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: rgba(0,0,0,0.9);
      color: #0f0;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.4;
      padding: 6px 8px;
      z-index: 999999;
      pointer-events: none;
      white-space: pre;
      max-height: 70vh;
      overflow: hidden;
      border-bottom: 2px solid #0f0;
    `;
    document.body.appendChild(this.el);

    const btn = document.createElement('button');
    btn.textContent = 'DBG';
    btn.style.cssText = `
      position: fixed;
      bottom: 12px;
      right: 12px;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #0f0;
      color: #000;
      font-family: monospace;
      font-size: 13px;
      font-weight: bold;
      border: 2px solid #000;
      z-index: 1000000;
      pointer-events: auto;
      cursor: pointer;
    `;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.visible = !this.visible;
      this.el.style.display = this.visible ? 'block' : 'none';
    });
    document.body.appendChild(btn);

    this._loop();
  }

  _loop() {
    const tick = () => {
      if (this.visible) this._render();
      requestAnimationFrame(tick);
    };
    tick();
  }

  _render() {
    const gs = window.GameState;
    const cw = this.collisionWorld;
    const sm = this.stateManager;
    const sock = this.socket;
    const sens = this.sensitivity;
    const p = gs && gs.localPlayer ? gs.localPlayer.physics : null;
    const d = gs && gs.localDrone ? gs.localDrone.physics : null;

    const L = [];

    L.push('=== COLLISION ===');
    L.push(`meshes: ${cw ? cw.meshes.length : '?'}  ready: ${cw ? cw.isReady() : '?'}  cache: ${cw ? cw._groundCache.size : '?'}`);
    if (gs && gs.collisionRootRef) {
      let n = 0, bvh = 0;
      gs.collisionRootRef.traverse(o => {
        if (o.isMesh) {
          n++;
          if (o.geometry && o.geometry.boundsTree) bvh++;
        }
      });
      L.push(`root meshes: ${n}  withBVH: ${bvh}`);
    } else {
      L.push('root: NULL');
    }
    if (cw && cw.meshes.length > 0 && p) {
      const gY = cw.raycastDown(p.position.x, p.position.z, 10000, -10000);
      const gY2 = cw.raycastDown(p.position.x + 5, p.position.z, 10000, -10000);
      L.push(`gY@player: ${gY === null ? 'NULL' : gY.toFixed(2)}   gY@+5x: ${gY2 === null ? 'NULL' : gY2.toFixed(2)}`);
    }

    L.push('');
    L.push('=== PLAYER ===');
    if (p) {
      L.push(`pos: ${p.position.x.toFixed(1)}, ${p.position.y.toFixed(1)}, ${p.position.z.toFixed(1)}`);
      L.push(`vel: ${p.velocity.x.toFixed(1)}, ${p.velocity.y.toFixed(1)}, ${p.velocity.z.toFixed(1)}`);
      L.push(`alive: ${p.alive}  hp: ${p.hp}`);
    } else L.push('NULL');

    L.push('');
    L.push('=== DRONE ===');
    if (d) {
      L.push(`pos: ${d.position.x.toFixed(1)}, ${d.position.y.toFixed(1)}, ${d.position.z.toFixed(1)}`);
      L.push(`vel: ${d.velocity.x.toFixed(1)}, ${d.velocity.y.toFixed(1)}, ${d.velocity.z.toFixed(1)}`);
      L.push(`rpm: ${d.rpm.toFixed(0)}  armed: ${d.armed}  piloted: ${d.piloted}  crashed: ${d.crashed}`);
      L.push(`groundY: ${d.groundY !== undefined ? d.groundY.toFixed(2) : 'undef'}`);
      L.push(`yaw: ${d.yaw.toFixed(2)}  pitchAng: ${d._pitchAngle.toFixed(2)}`);
      L.push(`quat: ${d.quaternion.x.toFixed(2)}, ${d.quaternion.y.toFixed(2)}, ${d.quaternion.z.toFixed(2)}, ${d.quaternion.w.toFixed(2)}`);
    } else L.push('NULL');

    L.push('');
    L.push('=== STATE ===');
    L.push(`mode: ${gs ? gs.mode : '?'}  inGame: ${gs ? gs.inGame : '?'}  ready: ${gs ? gs.ready : '?'}`);
    L.push(`playerId: ${gs ? gs.playerId : '?'}  roomId: ${gs ? gs.roomId : '?'}  camYaw: ${gs ? gs.camYaw.toFixed(2) : '?'}`);

    L.push('');
    L.push('=== SOCKET ===');
    L.push(`connected: ${sock ? sock.connected : '?'}  ping: ${sock ? sock.ping.toFixed(0) : '?'}`);
    L.push(`remoteP: ${sm ? sm.remotePlayers.size : '?'}  remoteD: ${sm ? sm.remoteDrones.size : '?'}`);

    L.push('');
    L.push('=== CONTROLS ===');
    if (sens) {
      L.push(`cyl: ${sens.cylValue.toFixed(2)}  cylH: ${sens.cylHeight.toFixed(0)}  camPitch: ${sens.camera.pitch.toFixed(2)}  camYaw: ${sens.camera.yaw.toFixed(2)}`);
      L.push(`joy: ${sens.move.value.x.toFixed(2)}, ${sens.move.value.y.toFixed(2)}`);
    }

    L.push('');
    L.push('=== ENV ===');
    L.push(`viewport: ${window.innerWidth}x${window.innerHeight}`);

    this.el.textContent = L.join('\n');
  }
}