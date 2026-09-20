const MAX_CRASH_DIST_SQ = 200 * 200;

export function validateCrash(player, x, y, z) {
  if (!isFinite(x) || !isFinite(z)) return false;
  if (!player.drone) return false;

  const dx = x - player.drone.x;
  const dz = z - player.drone.z;
  if (dx * dx + dz * dz > MAX_CRASH_DIST_SQ) return false;
  return true;
}