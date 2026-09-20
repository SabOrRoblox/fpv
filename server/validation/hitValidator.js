const MAX_HIT_DIST = 40;
const MAX_HIT_DAMAGE = 300;

export function validateHit(shooter, victim, damage) {
  if (!shooter || !victim) return false;
  if (!shooter.alive || !victim.alive) return false;
  if (shooter.id === victim.id) return false;
  if (!isFinite(damage) || damage <= 0 || damage > MAX_HIT_DAMAGE) return false;

  const sx = shooter.drone ? shooter.drone.x : shooter.x;
  const sy = shooter.drone ? shooter.drone.y : shooter.y;
  const sz = shooter.drone ? shooter.drone.z : shooter.z;
  const vx = victim.x;
  const vy = victim.y;
  const vz = victim.z;

  const dx = sx - vx;
  const dy = sy - vy;
  const dz = sz - vz;
  if (dx * dx + dy * dy + dz * dz > MAX_HIT_DIST * MAX_HIT_DIST) return false;

  return true;
}