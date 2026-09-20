export class Room {
  constructor(id, maxPlayers = 10) {
    this.id = id;
    this.maxPlayers = maxPlayers;
    this.players = new Map();
    this.spawnRed = { x: -371.5, z: 380.8 };
    this.spawnBlue = { x: 365.9, z: -361.6 };
  }

  isFull() { return this.players.size >= this.maxPlayers; }
  isEmpty() { return this.players.size === 0; }

  add(player) {
    if (this.isFull()) return false;
    player.roomId = this.id;
    this.players.set(player.id, player);
    return true;
  }

  remove(id) { this.players.delete(id); }
  count() { return this.players.size; }

  teamCounts() {
    let red = 0, blue = 0;
    for (const p of this.players.values()) {
      if (p.team === 'red') red++;
      else if (p.team === 'blue') blue++;
    }
    return { red, blue };
  }

  teamsState() {
    return this.teamCounts();
  }

  broadcastJSON(obj, exceptId = null) {
    const data = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (p.id === exceptId) continue;
      if (p.ws.readyState === 1) p.ws.send(data);
    }
  }

  broadcastBinary(buffer, exceptId = null) {
    for (const p of this.players.values()) {
      if (p.id === exceptId) continue;
      if (p.ws.readyState === 1) p.ws.send(buffer);
    }
  }

  playerListPayload() {
    return {
      type: 'players',
      count: this.players.size,
      max: this.maxPlayers,
      roomId: this.id,
      list: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, mode: p.mode, hp: p.hp, alive: p.alive, team: p.team,
      })),
    };
  }

  checkTimeout() {
    const toKick = [];
    for (const [id, p] of this.players.entries()) {
      if (p.isTimedOut()) toKick.push(id);
    }
    return toKick;
  }
}