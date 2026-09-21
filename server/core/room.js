export class Room {
  constructor(id, maxPlayers = 10) {
    this.id = id;
    this.maxPlayers = maxPlayers;
    this.players = new Map();
    this.spawnRed = { x: -371.5, z: 380.8 };
    this.spawnBlue = { x: 365.9, z: -361.6 };

    this._cachedListPayload = null;
    this._cachedTeamsState = null;
    this._cacheDirty = true;
  }

  isFull() { return this.players.size >= this.maxPlayers; }
  isEmpty() { return this.players.size === 0; }
  count() { return this.players.size; }
  get(id) { return this.players.get(id); }

  add(player) {
    if (this.isFull()) return false;
    player.roomId = this.id;
    this.players.set(player.id, player);
    this._cacheDirty = true;
    return true;
  }

  remove(id) {
    const r = this.players.delete(id);
    if (r) this._cacheDirty = true;
    return r;
  }

  markDirty() { this._cacheDirty = true; }

  teamCounts() {
    let red = 0, blue = 0;
    for (const p of this.players.values()) {
      if (p.team === 'red') red++;
      else if (p.team === 'blue') blue++;
    }
    return { red, blue };
  }

  teamsState() {
    if (this._cachedTeamsState && !this._cacheDirty) return this._cachedTeamsState;
    this._cachedTeamsState = this.teamCounts();
    return this._cachedTeamsState;
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

  broadcastPrepared(data, exceptId = null) {
    for (const p of this.players.values()) {
      if (p.id === exceptId) continue;
      if (p.ws.readyState === 1) p.ws.send(data);
    }
  }

  playerListPayload() {
    if (this._cachedListPayload && !this._cacheDirty) return this._cachedListPayload;
    this._cachedListPayload = {
      type: 'players',
      count: this.players.size,
      max: this.maxPlayers,
      roomId: this.id,
      list: [...this.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        mode: p.mode,
        hp: p.hp,
        alive: p.alive,
        team: p.team,
      })),
    };
    this._cacheDirty = false;
    return this._cachedListPayload;
  }

  checkTimeout() {
    const toKick = [];
    for (const [id, p] of this.players.entries()) {
      if (p.isTimedOut()) toKick.push(id);
    }
    return toKick;
  }
}