export class NetworkOverlay {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = '__net_overlay';
    this.el.style.cssText = `
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      background: rgba(0,0,0,0.82);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 9000;
      pointer-events: auto;
      padding: 24px;
      text-align: center;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    `;
    document.body.appendChild(this.el);

    this._state = null;
    this._retryCount = 0;
    this._autoHideTimer = null;
  }

  _render(icon, title, subtitle, color = '#e8a854', showSpinner = false) {
    this.el.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:14px;max-width:340px;';

    const ico = document.createElement('div');
    ico.style.cssText = `
      width: 72px; height: 72px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      border: 2px solid ${color};
      color: ${color};
      box-shadow: 0 0 24px ${color}44, inset 0 0 24px ${color}22;
      ${showSpinner ? 'animation: __net_spin 1.2s linear infinite;' : ''}
    `;
    ico.textContent = icon;
    wrap.appendChild(ico);

    const t = document.createElement('div');
    t.style.cssText = `font-size:18px;letter-spacing:4px;color:${color};text-shadow:0 0 12px ${color}66;font-weight:700;`;
    t.textContent = title;
    wrap.appendChild(t);

    const s = document.createElement('div');
    s.style.cssText = `font-size:12px;letter-spacing:2px;color:#5a9c9c;line-height:1.6;`;
    s.textContent = subtitle;
    wrap.appendChild(s);

    this.el.appendChild(wrap);

    if (!document.getElementById('__net_spin_style')) {
      const style = document.createElement('style');
      style.id = '__net_spin_style';
      style.textContent = '@keyframes __net_spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }
  }

  showOffline() {
    this._state = 'offline';
    this._render('⊘', 'НЕТ ИНТЕРНЕТА', 'Проверь соединение. Как только сеть вернётся, переподключусь автоматически.', '#e86c6c');
    this._show();
  }

  showReconnecting(attempt, delay) {
    this._state = 'reconnecting';
    this._retryCount = attempt;
    const sec = (delay / 1000).toFixed(1);
    this._render('↻', 'ПЕРЕПОДКЛЮЧЕНИЕ', `Попытка №${attempt}. Следующая через ${sec} с.`, '#e8a854', true);
    this._show();
  }

  showConnecting() {
    this._state = 'connecting';
    this._render('↻', 'ПОДКЛЮЧЕНИЕ', 'Устанавливаю соединение с сервером...', '#e8a854', true);
    this._show();
  }

  showKicked(reason) {
    this._state = 'kicked';
    this._render('⚠', 'ТЕБЯ КИКНУЛИ', 'Причина: ' + (reason || 'unknown') + '\n\nНажми в любом месте, чтобы переподключиться.', '#e86c6c');
    this._show();
    this._enableRetryOnTap(() => {
      this.hide();
      window.dispatchEvent(new CustomEvent('net:retry'));
    });
  }

  showBanned(reason) {
    this._state = 'banned';
    this._render('⛔', 'ТЫ ЗАБАНЕН', 'Причина: ' + (reason || 'unknown') + '\n\nПереподключение невозможно.', '#e86c6c');
    this._show();
  }

  showStale() {
    this._state = 'stale';
    this._render('⏱', 'СОЕДИНЕНИЕ ПРОПАЛО', 'Сервер не отвечает. Переподключаюсь...', '#e8a854', true);
    this._show();
  }

  hide() {
    this._state = null;
    this.el.style.display = 'none';
    if (this._autoHideTimer) {
      clearTimeout(this._autoHideTimer);
      this._autoHideTimer = null;
    }
  }

  _show() {
    this.el.style.display = 'flex';
  }

  _enableRetryOnTap(cb) {
    const handler = (e) => {
      e.preventDefault();
      this.el.removeEventListener('pointerdown', handler);
      cb();
    };
    this.el.addEventListener('pointerdown', handler);
  }

  isVisible() {
    return this.el.style.display === 'flex';
  }
}