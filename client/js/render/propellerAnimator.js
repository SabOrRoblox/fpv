export class PropellerAnimator {
  constructor(droneRoot) {
    this.props = [];
    this.axis = 'x';

    droneRoot.traverse((obj) => {
      if (/^wirt[1-4]$/i.test(obj.name)) {
        this.props.push({ obj, angle: 0 });
      }
    });
  }

  get count() { return this.props.length; }

  setAxis(axis) {
    this.axis = axis;
  }

  update(dt, rpm) {
    const norm = Math.max(0, Math.min(1, rpm / 26000));
    const speed = norm * 200;
    const dAngle = speed * dt;

    const axis = this.axis;
    for (const p of this.props) {
      p.angle += dAngle;
      if (axis === 'x') p.obj.rotation.x = p.angle;
      else if (axis === 'y') p.obj.rotation.y = p.angle;
      else if (axis === 'z') p.obj.rotation.z = p.angle;
    }
  }
}