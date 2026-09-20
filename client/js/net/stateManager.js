
import {
  MSG, parseSnapshot, decodeEventCrash,
} from '../../../shared/net/protocol.js';
import { RemotePlayer } from '../entities/RemotePlayer.js';
import { RemoteDrone } from '../entities/RemoteDrone.js';

export class StateManager {
  constructor(scene) {
    this.scene = scene;
    this.remotePlayers = new Map();
    this.remoteDrones = new Map();
    this.onCrash = null;
    this.myId = 0;
    this.globals = null;
  }

  setMyId(id) { this.myId = id; }

  handleBinary(type, payload, allGltfs) {
    if (allGltfs) this.globals = allGltfs;

    if (type === MSG.SNAPSHOT) {
      const snap = parseSnapshot(payload);
      const seenPlayers = new Set();
      const seenDrones = new Set();

      for (const p of snap.players) {
        if (p.id === this.myId) continue;
        seenPlayers.add(p.id);
        let rp = this.remotePlayers.get(p.id);
        if (!rp) {
          const gltf = (this.globals && this.globals['bro.glb']) || null;
          rp = new RemotePlayer(p.id, this.scene, gltf);
          this.remotePlayers.set(p.id, rp);
        }
        rp.pushState(p);
      }

      for (const d of snap.drones) {
        if (d.id === this.myId) continue;
        seenDrones.add(d.id);
        let rd = this.remoteDrones.get(d.id);
        if (!rd) {
          const gltf = (this.globals && this.globals['dron1.glb']) || null;
          rd = new RemoteDrone(d.id, this.scene, gltf);
          this.remoteDrones.set(d.id, rd);
        }
        rd.pushState(d);
      }

      for (const id of [...this.remotePlayers.keys()]) {
        if (!seenPlayers.has(id)) {
          const rp = this.remotePlayers.get(id);
          if (rp.dispose) rp.dispose(this.scene);
          this.remotePlayers.delete(id);
        }
      }
      for (const id of [...this.remoteDrones.keys()]) {
        if (!seenDrones.has(id)) {
          const rd = this.remoteDrones.get(id);
          if (rd.dispose) rd.dispose(this.scene);
          this.remoteDrones.delete(id);
        }
      }
      return;
    }

    if (type === MSG.EVENT_CRASH) {
      const ev = decodeEventCrash(payload);
      if (this.onCrash) this.onCrash(ev);
    }
  }

  update(dt, nowSec) {
    for (const rp of this.remotePlayers.values()) rp.update(dt, nowSec);
    for (const rd of this.remoteDrones.values()) rd.update(dt, nowSec);
  }

  syncWithPlayerList(list) {
    if (!Array.isArray(list)) return;
  }

  setPlayerTeam(id, team) {
    const rp = this.remotePlayers.get(id);
    if (rp) rp.team = team;
  }

  removePlayer(id) {
    const rp = this.remotePlayers.get(id);
    if (rp) { if (rp.dispose) rp.dispose(this.scene); this.remotePlayers.delete(id); }
    const rd = this.remoteDrones.get(id);
    if (rd) { if (rd.dispose) rd.dispose(this.scene); this.remoteDrones.delete(id); }
  }
}