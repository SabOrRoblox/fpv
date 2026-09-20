export class PropellerAnimator {
  constructor(droneRoot) {
    this.props = [];
    droneRoot.traverse((obj) => {
      if (/^wirt[1-4]$/i.test(obj.name)) {
        this.props.push({ obj, angle: 0, axis: 'y' });
      }
    });
  }

  get count() { return this.props.length; }

  setAxis(axis) {
    for (const p of this.props) p.axis = axis;
  }

  update(dt, rpm) {
    const norm = Math.max(0, Math.min(1, rpm / 26000));
    const speed = norm * 200;
    const dAngle = speed * dt;
    for (const p of this.props) {
      p.angle += dAngle;
      if (p.axis === 'x') p.obj.rotation.x = p.angle;
      else if (p.axis === 'z') p.obj.rotation.z = p.angle;
      else p.obj.rotation.y = p.angle;
    }
  }
}