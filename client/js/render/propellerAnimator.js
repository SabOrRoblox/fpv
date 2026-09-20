export class PropellerAnimator {
  constructor(droneRoot) {
    this.props = [];
    droneRoot.traverse((obj) => {
      if (/^wirt[1-4]$/i.test(obj.name)) {
        this.props.push({ obj, angle: 0 });
      }
    });
  }

  get count() {
    return this.props.length;
  }

  update(dt, rpm) {
    const speed = (rpm / 26000) * 120;
    const dAngle = speed * dt;
    for (const p of this.props) {
      p.angle += dAngle;
      p.obj.rotation.y = p.angle;
    }
  }
}