import { Room } from './room.js';

export class RoomManager {
  constructor(maxPerRoom = 10) {
    this.maxPerRoom = maxPerRoom;
    this.rooms = new Map();
    this.nextRoomId = 0;
  }

  findOrCreateRoom() {
    for (const room of this.rooms.values()) {
      if (!room.isFull()) return room;
    }
    const room = new Room(`room_${this.nextRoomId++}`, this.maxPerRoom);
    this.rooms.set(room.id, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  removePlayer(player) {
    if (!player.roomId) return;
    const room = this.rooms.get(player.roomId);
    if (!room) return;
    room.remove(player.id);
    if (room.isEmpty()) {
      this.rooms.delete(room.id);
    }
  }

  totalPlayers() {
    let n = 0;
    for (const r of this.rooms.values()) n += r.count();
    return n;
  }

  roomsState() {
    return [...this.rooms.values()].map(r => ({
      id: r.id,
      count: r.count(),
      max: r.maxPlayers,
    }));
  }

  checkTimeouts() {
    for (const [id, room] of this.rooms.entries()) {
      const toKick = room.checkTimeout();
      for (const playerId of toKick) {
        const p = room.players.get(playerId);
        if (p) {
          try { p.ws.close(); } catch (e) {}
        }
      }
    }
  }
}