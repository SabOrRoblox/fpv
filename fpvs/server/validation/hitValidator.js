const MAX_HIT_DIST_SQ = 40 * 40;
const MAX_HIT_DAMAGE = 300;

export function validateHit(shooter, victim, damage) {
  if (!shooter || !victim) return false;
  if (!shooter.alive || !victim.alive) return false;
  if (shooter.id === victim.id) return false;
  if (!isFinite(damage) || damage <= 0 || damage > MAX_HIT_DAMAGE) return false;

  let sx, sy, sz;
  if (shooter.mode === 'car' && shooter.car) {
    sx = shooter.car.x;
    sy = shooter.car.y;
    sz = shooter.car.z;
  } else if (shooter.mode === 'fpv' && shooter.drone) {
    sx = shooter.drone.x;
    sy = shooter.drone.y;
    sz = shooter.drone.z;
  } else {
    sx = shooter.x;
    sy = shooter.y;
    sz = shooter.z;
  }

  let vx, vy, vz;
  if (victim.mode === 'car' && victim.car) {
    vx = victim.car.x;
    vy = victim.car.y;
    vz = victim.car.z;
  } else if (victim.mode === 'fpv' && victim.drone) {
    vx = victim.drone.x;
    vy = victim.drone.y;
    vz = victim.drone.z;
  } else {
    vx = victim.x;
    vy = victim.y;
    vz = victim.z;
  }

  const dx = sx - vx;
  const dy = sy - vy;
  const dz = sz - vz;

  if (dx * dx + dy * dy + dz * dz > MAX_HIT_DIST_SQ) return false;
  return true;
}
