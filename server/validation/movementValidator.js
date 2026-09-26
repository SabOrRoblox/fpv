const MAX_PLAYER_DIST_SQ = 500 * 500;
const MAX_PLAYER_VERT = 500;
const MAX_DRONE_DIST_SQ = 1000 * 1000;
const MAX_DRONE_VERT = 1000;

export function validatePlayerState(player, x, y, z) {
  if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return false;
  if (y < -100 || y > 5000) return false;

  if (!player.hasPlayerState) {
    player.lastPX = x; player.lastPY = y; player.lastPZ = z;
    player.hasPlayerState = true;
    return true;
  }

  const dx = x - player.lastPX;
  const dy = y - player.lastPY;
  const dz = z - player.lastPZ;

  if (dx * dx + dy * dy + dz * dz > MAX_PLAYER_DIST_SQ) return false;
  if (Math.abs(dy) > MAX_PLAYER_VERT) return false;
  return true;
}

export function validateDroneState(player, x, y, z) {
  if (!isFinite(x) || !isFinite(y) || !isFinite(z)) return false;
  if (y < -100 || y > 5000) return false;

  if (!player.hasDroneState) {
    player.lastDX = x; player.lastDY = y; player.lastDZ = z;
    player.hasDroneState = true;
    return true;
  }

  const dx = x - player.lastDX;
  const dy = y - player.lastDY;
  const dz = z - player.lastDZ;

  if (dx * dx + dy * dy + dz * dz > MAX_DRONE_DIST_SQ) return false;
  if (Math.abs(dy) > MAX_DRONE_VERT) return false;
  return true;
}