import { handleChooseTeam } from './teamManager.js';
import { handleEnterDrone, handleExitDrone, handleDroneReset } from './droneManager.js';

function sendJSON(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

export function handleJSON(ws, player, room, msg, stats) {
  switch (msg.type) {
    case 'ping':
      sendJSON(ws, { type: 'pong', ts: msg.ts });
      return;
    case 'choose_team':
      handleChooseTeam(ws, player, room, msg);
      return;
    case 'enter_drone':
      handleEnterDrone(ws, player, room, msg);
      return;
    case 'exit_drone':
      handleExitDrone(ws, player, room);
      return;
    case 'drone_reset':
      handleDroneReset(ws, player, msg);
      return;
    default:
      return;
  }
}