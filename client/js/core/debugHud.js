export class DebugHud {
  constructor(collisionWorld, stateManager, socket, sensitivity) {
    this.cw = collisionWorld;
    this.sm = stateManager;
    this.sock = socket;
    this.sens = sensitivity;
    this.visible = true;

    this.el = document.createElement('div');
    this.el.id = '__dbg';
    this.el.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.88) 100%);
      color: #0f0;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: 11px;
      line-height: 1.45;
      padding: 8px 10px;
      z-index: 2147483646;
      pointer-events: none;
      white-space: pre;
      max-height: 62vh;
      overflow: hidden;
      border-bottom: 1px solid #0f04;
      box-shadow: 0 2px 20px rgba(0,255,0,0.15);
      transition: opacity 0.2s;
      letter-spacing: 0.2px;
    `;
    document.body.appendChild(this.el);

    this.btn = document.createElement('button');
    this.btn.textContent = '⌁';
    this.btn.style.cssText = `
      position: fixed;
      bottom: 14px; right: 14px;
      width: 52px; height: 52px;
      border-radius: 50%;
      background: rgba(0,255,0,0.9);
      color: #000;
      font: bold 20px/1 ui-monospace, monospace;
      border: 2px solid #000;
      box-shadow: 0 4px 16px rgba(0,255,0,0.5);
      z-index: 2147483647;
      cursor: pointer;
      display: none;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    `;
    this.btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.visible = true;
      this.el.style.opacity = '1';
      this.el.style.display = 'block';
      this.btn.style.display = 'none';
    });
    document.body.appendChild(this.btn);

    this.fpsBuf = [];
    this.fpsEl = 0;
    this.pingBuf = [];
    this.pingEl = 0;
    this.lastT = performance.now();
    this.frameCount = 0;
    this.acc = 0;

    this._loop();
  }

  _loop = () => {
    const now = performance.now();
    const dt = (now - this.lastT) / 1000;
    this.lastT = now;
    this.frameCount++;

    if (dt > 0) {
      this.fpsBuf.push(1 / dt);
      if (this.fpsBuf.length > 60) this.fpsBuf.shift();
      this.fpsEl = this.fpsBuf.reduce((a, b) => a + b, 0) / this.fpsBuf.length;
    }
    if (this.sock && this.sock.ping > 0) {
      this.pingBuf.push(this.sock.ping);
      if (this.pingBuf.length > 30) this.pingBuf.shift();
      this.pingEl = this.pingBuf.reduce((a, b) => a + b, 0) / this.pingBuf.length;
    }

    this.acc += dt;
    if (this.visible && this.acc > 0.15) {
      this.acc = 0;
      this._render();
    }
    requestAnimationFrame(this._loop);
  };

  _render() {
    const gs = window.GameState;
    const cw = this.cw;
    const sm = this.sm;
    const sock = this.sock;
    const sens = this.sens;
    const p = gs && gs.localPlayer ? gs.localPlayer.physics : null;
    const d = gs && gs.localDrone ? gs.localDrone.physics : null;

    const L = [];
    const pad = (s, n) => String(s).padStart(n, ' ');

    L.push('████ DRONE FPV ████  ' + new Date().toISOString().slice(11, 19));
    L.push('');

    L.push('┌─ PERFORMANCE ──────────────────────');
    L.push('│ FPS      ' + this.fpsEl.toFixed(1).padStart(6));
    L.push('│ PING     ' + this.pingEl.toFixed(0).padStart(6) + ' ms');
    L.push('│ VIEWPORT ' + pad(window.innerWidth + 'x' + window.innerHeight, 6));
    L.push('│ DPR      ' + pad(window.devicePixelRatio, 6));
    L.push('└────────────────────────────────────');

    L.push('');
    L.push('┌─ COLLISION ────────────────────────');
    L.push('│ meshes   ' + pad(cw ? cw.meshes.length : '?', 6));
    L.push('│ ready    ' + pad(cw ? cw.isReady() : '?', 6));
    L.push('│ cache    ' + pad(cw ? cw._groundCache.size : '?', 6));
    if (gs && gs.collisionRootRef) {
      let n = 0, bvh = 0;
      gs.collisionRootRef.traverse(o => {
        if (o.isMesh) { n++; if (o.geometry && o.geometry.boundsTree) bvh++; }
      });
      L.push('│ root     ' + pad(n, 6));
      L.push('│ withBVH  ' + pad(bvh, 6));
    }
    if (cw && cw.meshes.length > 0 && p) {
      const gY = cw.raycastDown(p.position.x, p.position.z, 10000, -10000);
      L.push('│ gY@me    ' + pad(gY === null ? 'NULL' : gY.toFixed(2), 6));
    }
    L.push('└────────────────────────────────────');

    L.push('');
    L.push('┌─ PLAYER ───────────────────────────');
    if (p) {
      L.push('│ pos ' + pad(p.position.x.toFixed(1), 7) + ' ' + pad(p.position.y.toFixed(1), 7) + ' ' + pad(p.position.z.toFixed(1), 7));
      L.push('│ vel ' + pad(p.velocity.x.toFixed(1), 7) + ' ' + pad(p.velocity.y.toFixed(1), 7) + ' ' + pad(p.velocity.z.toFixed(1), 7));
      L.push('│ hp  ' + pad(p.hp, 4) + '   alive ' + (p.alive ? 'yes' : 'no'));
    } else L.push('│ (null)');
    L.push('└────────────────────────────────────');

    L.push('');
    L.push('┌─ DRONE ────────────────────────────');
    if (d) {
      L.push('│ pos ' + pad(d.position.x.toFixed(1), 7) + ' ' + pad(d.position.y.toFixed(1), 7) + ' ' + pad(d.position.z.toFixed(1), 7));
      L.push('│ vel ' + pad(d.velocity.x.toFixed(1), 7) + ' ' + pad(d.velocity.y.toFixed(1), 7) + ' ' + pad(d.velocity.z.toFixed(1), 7));
      L.push('│ rpm ' + pad(d.rpm.toFixed(0), 6) + '  batt ' + pad(d.getBattery ? d.getBattery().toFixed(1) : '?', 5));
      L.push('│ armed=' + (d.armed ? 1 : 0) + ' piloted=' + (d.piloted ? 1 : 0) + ' crashed=' + (d.crashed ? 1 : 0));
      L.push('│ groundY ' + pad((d.groundY || 0).toFixed(2), 6));
      L.push('│ yaw ' + pad(d.yaw.toFixed(2), 6) + '  pitch ' + pad(d._pitchAngle.toFixed(2), 6));
    } else L.push('│ (null)');
    L.push('└────────────────────────────────────');

    L.push('');
    L.push('┌─ STATE ────────────────────────────');
    L.push('│ mode     ' + pad(gs ? gs.mode : '?', 6));
    L.push('│ inGame   ' + pad(gs && gs.inGame ? 1 : 0, 6));
    L.push('│ ready    ' + pad(gs && gs.ready ? 1 : 0, 6));
    L.push('│ playerId ' + pad(gs ? gs.playerId : '?', 6));
    L.push('│ roomId   ' + pad(gs ? (gs.roomId || '?') : '?', 6));
    L.push('│ team     ' + pad(gs ? (gs.myTeam || '-') : '?', 6));
    L.push('└────────────────────────────────────');

    L.push('');
    L.push('┌─ SOCKET ───────────────────────────');
    L.push('│ conn   ' + pad(sock && sock.connected ? 1 : 0, 6));
    L.push('│ remoteP ' + pad(sm ? sm.remotePlayers.size : '?', 5));
    L.push('│ remoteD ' + pad(sm ? sm.remoteDrones.size : '?', 5));
    L.push('└────────────────────────────────────');

    L.push('');
    L.push('┌─ CONTROLS ─────────────────────────');
    if (sens) {
      L.push('│ cyl  ' + pad(sens.cylValue.toFixed(2), 6));
      L.push('│ cylH ' + pad(sens.cylHeight.toFixed(0), 6));
      L.push('│ cam y ' + pad(sens.camera.yaw.toFixed(2), 6) + '  p ' + pad(sens.camera.pitch.toFixed(2), 6));
      L.push('│ joy  ' + pad(sens.move.value.x.toFixed(2), 6) + ' ' + pad(sens.move.value.y.toFixed(2), 6));
    }
    L.push('└────────────────────────────────────');

    this.el.textContent = L.join('\n');
  }
}