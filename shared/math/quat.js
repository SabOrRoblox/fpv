export function q4(x = 0, y = 0, z = 0, w = 1) {
  return { x, y, z, w };
}

export function q4identity(o) {
  o.x = 0; o.y = 0; o.z = 0; o.w = 1;
  return o;
}

export function q4normalize(o, a) {
  const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z + a.w * a.w);
  if (l < 1e-9) return q4identity(o);
  const inv = 1 / l;
  o.x = a.x * inv; o.y = a.y * inv; o.z = a.z * inv; o.w = a.w * inv;
  return o;
}

export function q4fromAxisAngle(o, axis, angle) {
  const h = angle / 2;
  const s = Math.sin(h);
  o.x = axis.x * s;
  o.y = axis.y * s;
  o.z = axis.z * s;
  o.w = Math.cos(h);
  return o;
}