import { Room } from './room.js';
import { SERVER_CONFIG } from '../config.js';

export class RoomManager {
  constructor(maxPerRoom = SERVER_CONFIG.MAX_PLAYERS_PER_ROOM) {
    this.maxPerRoom = maxPerRoom;
    this.rooms = new Map();
    this.nextRoomId = 0;
    this._cachedRoomsState = null;
    this._cachedTotal = null;
    this._roomsDirty = true;
  }

  findOrCreateRoom() {
    for (const room of this.rooms.values()) {
      if (!room.isFull()) return room;
    }
    const room = new Room(`room_${this.nextRoomId++}`, this.maxPerRoom);
    this.rooms.set(room.id, room);
    this._roomsDirty = true;
    return room;
  }

  getRoom(roomId) { return this.rooms.get(roomId) || null; }

  removePlayer(player) {
    if (!player.roomId) return;
    const room = this.rooms.get(player.roomId);
    if (!room) return;
    room.remove(player.id);
    this._roomsDirty = true;
    if (room.isEmpty()) this.rooms.delete(room.id);
  }

  totalPlayers() {
    if (this._cachedTotal !== null && !this._roomsDirty) return this._cachedTotal;
    let n = 0;
    for (const r of this.rooms.values()) n += r.count();
    this._cachedTotal = n;
    return n;
  }

  roomsState() {
    if (this._cachedRoomsState && !this._roomsDirty) return this._cachedRoomsState;
    this._cachedRoomsState = [...this.rooms.values()].map(r => ({
      id: r.id, count: r.count(), max: r.maxPlayers,
    }));
    return this._cachedRoomsState;
  }

  markDirty() { this._roomsDirty = true; }

  checkTimeouts() {
    for (const room of this.rooms.values()) {
      const toKick = room.checkTimeout();
      for (const playerId of toKick) {
        const p = room.players.get(playerId);
        if (p) { try { p.ws.close(); } catch (e) {} }
      }
    }
  }
}