export class Menu {
  constructor() {
    this.el = document.getElementById('menu');
    this.btn = document.getElementById('btn-play');
    this.nickInput = document.getElementById('nickname');
    this.countEl = document.getElementById('player-count');
    this.maxEl = document.getElementById('player-max');
    this.statusEl = document.getElementById('menu-status');
    this.onPlay = null;

    const saved = localStorage.getItem('drone_nick');
    if (saved) this.nickInput.value = saved;

    this.btn.addEventListener('click', () => this._play());
    this.nickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._play();
    });
  }

  _play() {
    const name = (this.nickInput.value.trim() || 'anon').slice(0, 16);
    localStorage.setItem('drone_nick', name);
    this.btn.disabled = true;
    this.setStatus('Подключение...');
    if (this.onPlay) this.onPlay(name);
  }

  setStatus(text) { this.statusEl.textContent = text; }
  setCount(count, max) {
    this.countEl.textContent = count;
    this.maxEl.textContent = max;
  }
  hide() { this.el.classList.add('hidden'); }
  show() {
    this.el.classList.remove('hidden');
    this.btn.disabled = false;
    this.setStatus('');
  }
}