export function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function degToRad(d) {
  return d * Math.PI / 180;
}

export function radToDeg(r) {
  return r * 180 / Math.PI;
}