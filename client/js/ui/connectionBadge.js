export class ConnectionBadge {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = '__net_badge';
    this.el.style.cssText = `
      position: fixed;
      top: 12px;
      right: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 16px;
      background: rgba(0,0,0,0.55);
      border: 1px solid rgba(90,156,156,0.4);
      font-family: ui-monospace, monospace;
      font-size: 11px;
      letter-spacing: 1.5px;
      color: #c8d4e0;
      z-index: 95;
      pointer-events: none;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      transition: opacity 0.2s;
    `;
    document.body.appendChild(this.el);

    this.dot = document.createElement('div');
    this.dot.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #7ec46a;
      box-shadow: 0 0 6px #7ec46a;
      transition: background 0.2s, box-shadow 0.2s;
    `;
    this.el.appendChild(this.dot);

    this.text = document.createElement('span');
    this.text.textContent = '---';
    this.el.appendChild(this.text);

    this._t = 0;
    this._lastPing = -1;
  }

  setState(state, ping) {
    if (state === 'offline') {
      this.dot.style.background = '#e86c6c';
      this.dot.style.boxShadow = '0 0 6px #e86c6c';
      this.text.textContent = 'OFFLINE';
    } else if (state === 'reconnecting') {
      this.dot.style.background = '#e8a854';
      this.dot.style.boxShadow = '0 0 6px #e8a854';
      this.text.textContent = 'RECONNECT';
    } else if (state === 'kicked') {
      this.dot.style.background = '#e86c6c';
      this.dot.style.boxShadow = '0 0 6px #e86c6c';
      this.text.textContent = 'KICKED';
    } else if (state === 'banned') {
      this.dot.style.background = '#e86c6c';
      this.dot.style.boxShadow = '0 0 6px #e86c6c';
      this.text.textContent = 'BANNED';
    } else if (state === 'connected') {
      const p = Math.round(ping || 0);
      let color = '#7ec46a';
      if (p > 80) color = '#e8a854';
      if (p > 160) color = '#e86c6c';
      this.dot.style.background = color;
      this.dot.style.boxShadow = '0 0 6px ' + color;
      this.text.textContent = p + ' ms';
    } else {
      this.dot.style.background = '#5a9c9c';
      this.dot.style.boxShadow = 'none';
      this.text.textContent = '---';
    }
  }
}