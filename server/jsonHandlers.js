import { handleChooseTeam } from './teamManager.js';
import { handleEnterDrone, handleExitDrone, handleDroneReset } from './droneManager.js';
import { handleEnterCar, handleExitCar, handleCarReset } from './carManager.js';
import { handleChatSend } from './chatManager.js';

function sendJSON(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

export function handleJSON(ws, player, room, msg, stats, roomManager) {
  switch (msg.type) {
    case 'ping':
      sendJSON(ws, { type: 'pong', ts: msg.ts });
      return;
    case 'request_room_state':
      if (roomManager) {
        sendJSON(ws, {
          type: 'room_state',
          rooms: roomManager.roomsState(),
          total: roomManager.totalPlayers(),
        });
      }
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
    case 'enter_car':
      handleEnterCar(ws, player, room, msg);
      return;
    case 'exit_car':
      handleExitCar(ws, player, room);
      return;
    case 'car_reset':
      handleCarReset(ws, player, msg);
      return;
    case 'chat_send':
      handleChatSend(ws, player, room, msg);
      return;
    default:
      return;
  }
}