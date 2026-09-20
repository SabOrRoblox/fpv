export class DeathScreen {
  constructor() {
    this.el = document.getElementById('death-screen');
    this.infoEl = this.el.querySelector('.death-info');
    this.btn = document.getElementById('btn-respawn');
    this.onRespawn = null;

    this.btn.addEventListener('click', () => {
      this.hide();
      if (this.onRespawn) this.onRespawn();
    });
  }

  show(reason = 'Сбит взрывом дрона') {
    if (this.infoEl) this.infoEl.textContent = reason;
    this.el.classList.remove('hidden');
  }

  hide() { this.el.classList.add('hidden'); }
}