export class DroneSelectMenu {
  constructor() {
    this.modal = document.getElementById('drone-select');
    this.grid = document.getElementById('drone-grid');
    this.drones = [];
    this.selectedId = localStorage.getItem('selectedDrone') || null;
    this.onSelect = null;
    this.onClose = null;

    this.modal.addEventListener('pointerdown', (e) => {
      if (e.target === this.modal) this.close();
    });
  }

  async load() {
    try {
      const res = await fetch('./data/drones.json');
      if (!res.ok) throw new Error('drones.json not found');
      const data = await res.json();
      this.drones = data.drones || [];
      this._renderGrid();
    } catch (e) {
      console.error('[drones] load failed:', e.message);
      this.drones = [];
    }
  }

  _renderGrid() {
    this.grid.innerHTML = '';
    for (const drone of this.drones) {
      const btn = document.createElement('button');
      btn.className = 'drone-tile';
      if (drone.id === this.selectedId) btn.classList.add('selected');

      const icon = document.createElement('div');
      icon.className = 'drone-tile-icon';
      icon.style.background = drone.color || '#4a5a68';
      btn.appendChild(icon);

      const name = document.createElement('div');
      name.textContent = drone.name || drone.id;
      btn.appendChild(name);

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._select(drone.id);
      });

      this.grid.appendChild(btn);
    }
  }

  _select(id) {
    this.selectedId = id;
    localStorage.setItem('selectedDrone', id);
    if (this.onSelect) this.onSelect(id);
    this.close();
  }

  getDroneData(id) {
    return this.drones.find(d => d.id === id) || null;
  }

  open() {
    this.modal.classList.remove('hidden');
    this._renderGrid();
  }

  close() {
    this.modal.classList.add('hidden');
    if (this.onClose) this.onClose();
  }

  toggle() {
    if (this.modal.classList.contains('hidden')) this.open();
    else this.close();
  }

  isOpen() {
    return !this.modal.classList.contains('hidden');
  }
}