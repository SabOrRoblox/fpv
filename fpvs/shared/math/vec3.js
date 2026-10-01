export function v3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}

export function v3set(o, x, y, z) {
  o.x = x; o.y = y; o.z = z;
  return o;
}

export function v3copy(o, a) {
  o.x = a.x; o.y = a.y; o.z = a.z;
  return o;
}

export function v3len(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function v3normalize(o, a) {
  const l = v3len(a);
  if (l < 1e-9) { o.x = 0; o.y = 0; o.z = 0; return o; }
  const inv = 1 / l;
  o.x = a.x * inv; o.y = a.y * inv; o.z = a.z * inv;
  return o;
}