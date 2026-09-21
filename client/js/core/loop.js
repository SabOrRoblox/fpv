export class FixedLoop {
  constructor({ renderer, physDt, onFixedUpdate, onRender }) {
    this.renderer = renderer;
    this.physDt = physDt;
    this.onFixedUpdate = onFixedUpdate;
    this.onRender = onRender;
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this.alpha = 0;
    this.maxFrameDt = 0.1;
    this.maxSteps = 3;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop(this._tick);
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  _tick = (time) => {
    if (!this.running) return;
    const now = time || performance.now();
    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frameDt > this.maxFrameDt) frameDt = this.maxFrameDt;
    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.physDt && steps < this.maxSteps) {
      this.onFixedUpdate(this.physDt);
      this.accumulator -= this.physDt;
      steps++;
    }
    if (steps >= this.maxSteps) this.accumulator = 0;
    this.alpha = this.accumulator / this.physDt;
    this.onRender(frameDt, this.alpha);
  };
}