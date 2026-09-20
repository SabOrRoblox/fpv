export class TouchJoystick {
  constructor(element, opts = {}) {
    this.el = element;
    this.knob = element.querySelector('.joystick-knob');
    this.value = { x: 0, y: 0 };
    this.radius = 0;
    this.activeId = null;
    this.centerX = 0;
    this.centerY = 0;
    this.invertY = opts.invertY !== false;
    this.throttleMode = opts.throttleMode === true;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);

    this.el.addEventListener('pointerdown', this._onDown, { passive: false });
    window.addEventListener('pointermove', this._onMove, { passive: false });
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
  }

  refreshSizes() {
    if (!this.el) return false;
    const style = window.getComputedStyle(this.el);
    if (style.display === 'none') return false;
    const rect = this.el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    this.radius = rect.width / 2;
    this.centerX = rect.left + this.radius;
    this.centerY = rect.top + this.radius;
    return true;
  }

  _onDown(e) {
    if (this.activeId !== null) return;
    if (!this.refreshSizes()) return;

    this.activeId = e.pointerId;
    this.el.classList.add('active');
    this._setKnob(e.clientX, e.clientY);
    e.preventDefault();
  }

  _onMove(e) {
    if (e.pointerId !== this.activeId) return;
    if (this.radius <= 0) {
      if (!this.refreshSizes()) return;
    }
    this._setKnob(e.clientX, e.clientY);
    e.preventDefault();
  }

  _onUp(e) {
    if (e.pointerId !== this.activeId) return;
    this.activeId = null;
    this.el.classList.remove('active');
    this.value.x = 0;
    this.value.y = 0;
    if (this.knob) {
      this.knob.style.left = '50%';
      this.knob.style.top = '50%';
      this.knob.style.transform = 'translate(-50%, -50%)';
    }
  }

  _setKnob(cx, cy) {
    if (this.radius <= 0) return;

    let dx = cx - this.centerX;
    let dy = cy - this.centerY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const maxLen = this.radius * 0.7;
    if (maxLen <= 0) return;

    if (len > maxLen) {
      const k = maxLen / len;
      dx *= k;
      dy *= k;
    }
    let vx = dx / maxLen;
    let vy = dy / maxLen;
    if (this.invertY) vy = -vy;

    if (this.throttleMode) {
      this.value.x = vx;
      this.value.y = Math.max(0, vy);
    } else {
      this.value.x = vx;
      this.value.y = vy;
    }

    if (this.knob) {
      this.knob.style.left = `calc(50% + ${dx}px)`;
      this.knob.style.top = `calc(50% + ${dy}px)`;
      this.knob.style.transform = 'translate(-50%, -50%)';
    }
  }
}