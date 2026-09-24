import { log } from './log.js';

const MAX_TEXT_LEN = 200;
const RATE_WINDOW_MS = 500;

function cutText(text) {
  const arr = Array.from(text);
  if (arr.length <= MAX_TEXT_LEN) return text;
  return arr.slice(0, MAX_TEXT_LEN).join('');
}

export function handleChatSend(ws, player, room, msg) {
  if (!msg || typeof msg.text !== 'string') return;

  const now = Date.now();
  if (!player.lastChatAt) player.lastChatAt = 0;
  if (now - player.lastChatAt < RATE_WINDOW_MS) return;
  player.lastChatAt = now;

  const raw = msg.text.trim();
  if (!raw) return;

  const text = cutText(raw);
  if (!text) return;

  room.broadcastJSON({
    type: 'chat_message',
    id: player.id,
    name: player.name,
    team: player.team || null,
    text,
    ts: now,
  });

  log('CHAT', `P${player.id} "${player.name}": ${text.slice(0, 60)}`);
}