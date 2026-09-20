const MAX_HIT_DIST_SQ = 40 * 40;
const MAX_HIT_DAMAGE = 300;

export function validateHit(shooter, victim, damage) {
  if (!shooter || !victim) return false;
  if (!shooter.alive || !victim.alive) return false;
  if (shooter.id === victim.id) return false;
  if (!isFinite(damage) || damage <= 0 || damage > MAX_HIT_DAMAGE) return false;

  const sx = shooter.drone ? shooter.drone.x : shooter.x;
  const sy = shooter.drone ? shooter.drone.y : shooter.y;
  const sz = shooter.drone ? shooter.drone.z : shooter.z;

  const dx = sx - victim.x;
  const dy = sy - victim.y;
  const dz = sz - victim.z;

  if (dx * dx + dy * dy + dz * dz > MAX_HIT_DIST_SQ) return false;
  return true;
}