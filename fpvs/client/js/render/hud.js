export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.speedEl = document.getElementById('hud-speed');
    this.altEl = document.getElementById('hud-alt');
    this.vsiEl = document.getElementById('hud-vsi');
    this.batEl = document.getElementById('hud-bat');
    this.rpmEl = document.getElementById('hud-rpm');
    this.hintEl = document.getElementById('hud-hint');
    this.hpFill = document.getElementById('hud-hp-fill');
    this.hpText = document.getElementById('hud-hp');
    this.fpsEl = document.getElementById('hud-fps');

    this.droneHud = document.getElementById('drone-hud-parts');
    this.carHud = document.getElementById('car-hud-parts');

    this.speedoCanvas = document.getElementById('speedo');
    this.tachoCanvas = document.getElementById('tacho');
    this.carSpeedoCanvas = document.getElementById('car-speedo-canvas');
    this.carSpeedValue = document.getElementById('car-speed-value');

    this._acc = 0;
    this._lastSpeed = 0;
    this._lastRpm = 0;
    this._lastCarSpeed = 0;

    this._fpsFrames = 0;
    this._fpsAcc = 0;

    this.refreshCanvas();
  }

  refreshCanvas() {
    this._setupCanvas(this.speedoCanvas);
    this._setupCanvas(this.tachoCanvas);
    this._setupCanvas(this.carSpeedoCanvas);
  }

  _setupCanvas(canvas) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    canvas._cssW = rect.width;
    canvas._cssH = rect.height;
  }

  show() {
    this.el.classList.remove('hidden');
    this.refreshCanvas();
  }

  hide() { this.el.classList.add('hidden'); }

  setMode(mode) {
    if (mode === 'fpv') {
      this.droneHud.style.display = 'block';
      this.carHud.style.display = 'none';
    } else if (mode === 'car') {
      this.droneHud.style.display = 'none';
      this.carHud.style.display = 'block';
    } else {
      this.droneHud.style.display = 'none';
      this.carHud.style.display = 'none';
    }
    this.refreshCanvas();
  }

  setHint(text, visible) {
    this.hintEl.textContent = text || '';
    this.hintEl.classList.toggle('visible', visible === true);
  }

  update(dt, data) {
    this._fpsFrames++;
    this._fpsAcc += dt;
    if (this._fpsAcc >= 0.5) {
      const fps = Math.round(this._fpsFrames / this._fpsAcc);
      this._fpsFrames = 0;
      this._fpsAcc = 0;
      if (this.fpsEl) this.fpsEl.textContent = 'FPS ' + fps;
    }

    this._acc += dt;
    if (this._acc < 0.05) return;
    this._acc = 0;

    const hp = Math.max(0, isFinite(data.hp) ? data.hp : 0);
    const hpPct = (hp / 100) * 100;
    if (this.hpFill) this.hpFill.style.width = hpPct + '%';
    if (this.hpText) this.hpText.textContent = Math.round(hp);

    if (data.isCar) {
      const carSpeed = isFinite(data.carSpeed) ? data.carSpeed : 0;
      this._lastCarSpeed += (carSpeed - this._lastCarSpeed) * 0.3;
      if (!isFinite(this._lastCarSpeed)) this._lastCarSpeed = 0;
      if (this.carSpeedValue) this.carSpeedValue.textContent = this._lastCarSpeed.toFixed(0);
      this._drawGauge(this.carSpeedoCanvas, this._lastCarSpeed, 160, false, '#e8a854');
      return;
    }

    const speed = isFinite(data.speed) ? data.speed : 0;
    const rpm = isFinite(data.rpm) ? data.rpm : 0;
    const alt = isFinite(data.alt) ? data.alt : 0;
    const vsi = isFinite(data.vsi) ? data.vsi : 0;

    const speedKmh = speed * 3.6;
    const rpmNorm = Math.min(1, rpm / 26000);

    this._lastSpeed += (speedKmh - this._lastSpeed) * 0.3;
    this._lastRpm += (rpmNorm - this._lastRpm) * 0.3;

    if (!isFinite(this._lastSpeed)) this._lastSpeed = 0;
    if (!isFinite(this._lastRpm)) this._lastRpm = 0;

    if (data.isDrone) {
      if (this.speedEl) this.speedEl.textContent = this._lastSpeed.toFixed(0);
      if (this.altEl) this.altEl.textContent = alt.toFixed(1);
      if (this.vsiEl) this.vsiEl.textContent = vsi.toFixed(1);
      if (this.batEl) this.batEl.textContent = ((data.battery || 100) | 0);
      if (this.rpmEl) this.rpmEl.textContent = Math.round(rpm);

      this._drawGauge(this.speedoCanvas, this._lastSpeed, 200, false, '#7ec4a8');
      this._drawGauge(this.tachoCanvas, this._lastRpm, 1, true, '#7ec4a8');
    }
  }

  _drawGauge(canvas, value, maxVal, isRedline, baseColor) {
    if (!canvas) return;
    const w = canvas._cssW;
    const h = canvas._cssH;
    if (!w || !h || w < 20 || h < 20) return;

    const ctx = canvas.getContext('2d');
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) / 2 - 8;
    if (r <= 4) return;

    ctx.clearRect(0, 0, w, h);

    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const frac = Math.max(0, Math.min(1, value / maxVal));
    const angle = startAngle + (endAngle - startAngle) * frac;

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = 'rgba(126, 196, 168, 0.2)';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, angle);
    const col = (isRedline && frac > 0.85) ? '#e86c6c' : (baseColor || '#7ec4a8');
    ctx.strokeStyle = col;
    ctx.lineWidth = 6;
    ctx.stroke();

    for (let i = 0; i <= 10; i++) {
      const a = startAngle + (endAngle - startAngle) * (i / 10);
      const x1 = cx + Math.cos(a) * (r - 12);
      const y1 = cy + Math.sin(a) * (r - 12);
      const x2 = cx + Math.cos(a) * (r - 4);
      const y2 = cy + Math.sin(a) * (r - 4);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(126, 196, 168, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const nx = cx + Math.cos(angle) * (r - 20);
    const ny = cy + Math.sin(angle) * (r - 20);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#e8b563';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#e8b563';
    ctx.fill();
  }
}