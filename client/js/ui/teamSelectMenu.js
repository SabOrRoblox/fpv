export class TeamSelectMenu {
  constructor() {
    this.modal = document.getElementById('team-select');
    this.btnRed = document.getElementById('team-red');
    this.btnBlue = document.getElementById('team-blue');
    this.redCount = document.getElementById('team-red-count');
    this.blueCount = document.getElementById('team-blue-count');
    this.status = document.getElementById('team-status');
    this.onChoose = null;
    this.selected = null;

    this.btnRed.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._pick('red');
    });
    this.btnBlue.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._pick('blue');
    });
  }

  _pick(team) {
    if (this.selected) return;
    this.selected = team;
    this.btnRed.classList.toggle('selected', team === 'red');
    this.btnBlue.classList.toggle('selected', team === 'blue');
    this.setStatus('Подключение...');
    if (this.onChoose) this.onChoose(team);
  }

  show(teams) {
    this.selected = null;
    this.setCounts(teams.red, teams.blue);
    this.setStatus('');
    this.btnRed.classList.remove('selected');
    this.btnBlue.classList.remove('selected');
    this.modal.classList.remove('hidden');
  }

  hide() {
    this.modal.classList.add('hidden');
  }

  setCounts(red, blue) {
    this.redCount.textContent = red;
    this.blueCount.textContent = blue;
  }

  setStatus(text) {
    this.status.textContent = text;
  }
}