import { log } from './log.js';

function sendJSON(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

export function handleChooseTeam(ws, player, room, msg) {
  const requested = msg.team === 'red' ? 'red' : msg.team === 'blue' ? 'blue' : null;

  if (!requested) {
    sendJSON(ws, { type: 'team_reject', reason: 'bad_team' });
    return;
  }

  if (player.team === requested) {
    sendJSON(ws, { type: 'team_reject', reason: 'already_in_team' });
    return;
  }

  const counts = room.teamCounts();
  const other = requested === 'red' ? 'blue' : 'red';

  if (counts[requested] > counts[other]) {
    sendJSON(ws, { type: 'team_reject', reason: 'unbalanced' });
    log('TEAM-REJECT', `P${player.id} → ${requested}, ${counts.red}/${counts.blue}`);
    return;
  }

  player.team = requested;
  const spawn = requested === 'red' ? room.spawnRed : room.spawnBlue;

  sendJSON(ws, { type: 'team_assigned', team: requested, spawn });
  room.broadcastJSON({ type: 'team_update', id: player.id, team: requested });
  room.broadcastJSON(room.playerListPayload());

  const c = room.teamCounts();
  log('TEAM', `P${player.id} → ${requested} (${c.red}/${c.blue})`);
}