export class CarWheelAnimator {
  constructor(root) {
    this.wheels = [];
    this.axis = 'x';
    root.traverse((o) => {
      if (/^gg[1-4]$/i.test(o.name)) {
        this.wheels.push({ obj: o, angle: 0 });
      }
    });
  }

  get count() { return this.wheels.length; }

  setAxis(axis) { this.axis = axis; }

  update(dt, speed) {
    const dAngle = speed * dt;
    const axis = this.axis;
    for (const w of this.wheels) {
      w.angle += dAngle;
      if (axis === 'x') w.obj.rotation.x = w.angle;
      else if (axis === 'y') w.obj.rotation.y = w.angle;
      else if (axis === 'z') w.obj.rotation.z = w.angle;
    }
  }
}