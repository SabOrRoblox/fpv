const MAX_MESSAGES = 50;
const MAX_TEXT_LEN = 200;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cutText(text) {
  const arr = Array.from(text);
  if (arr.length <= MAX_TEXT_LEN) return text;
  return arr.slice(0, MAX_TEXT_LEN).join('');
}

export class Chat {
  constructor(socket) {
    this.socket = socket;
    this.overlay = document.getElementById('chat-overlay');
    this.panel = document.getElementById('chat-panel');
    this.list = document.getElementById('chat-list');
    this.input = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('chat-send');
    this.closeBtn = document.getElementById('chat-close');
    this.openBtn = document.getElementById('btn-chat');
    this.badge = document.getElementById('chat-badge');
    this.messages = [];
    this.isOpen = false;
    this.myId = 0;
    this._unread = 0;
    this._keyboardOpen = false;

    this._bind();
    this._bindViewport();
  }

  setMyId(id) {
    this.myId = id;
  }

  _bind() {
    if (this.openBtn) {
      this.openBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
      });
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      });
    }

    if (this.sendBtn) {
      this.sendBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.send();
      });
    }

    if (this.input) {
      this.input.addEventListener('pointerdown', () => {
        if (this.input.readOnly) {
          this.input.readOnly = false;
          this.input.focus();
        }
      });

      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.send();
        } else if (e.key === 'Escape') {
          this.close();
        }
      });

      this.input.addEventListener('focus', () => {
        this._keyboardOpen = true;
        this._adjustForKeyboard();
      });

      this.input.addEventListener('blur', () => {
        this._keyboardOpen = false;
        this._adjustForKeyboard();
      });

      this.input.addEventListener('input', () => {
        this._autosize();
      });
    }

    if (this.overlay) {
      this.overlay.addEventListener('pointerdown', (e) => {
        if (e.target === this.overlay) this.close();
      });
    }

    if (this.socket && this.socket.on) {
      this.socket.on('chat_message', (msg) => this.append(msg));
    }
  }

  _bindViewport() {
    if (!window.visualViewport) return;
    const onResize = () => this._adjustForKeyboard();
    window.visualViewport.addEventListener('resize', onResize);
    window.visualViewport.addEventListener('scroll', onResize);
  }

  _adjustForKeyboard() {
    if (!this.panel || !window.visualViewport) return;
    const vv = window.visualViewport;
    const vh = vv.height;
    const offsetTop = vv.offsetTop;

    if (this._keyboardOpen) {
      this.panel.style.maxHeight = (vh * 0.75) + 'px';
      this.overlay.style.height = vh + 'px';
      this.overlay.style.top = offsetTop + 'px';
    } else {
      this.panel.style.maxHeight = '';
      this.overlay.style.height = '';
      this.overlay.style.top = '';
    }
  }

  _autosize() {
    if (!this.input) return;
    this.input.style.height = 'auto';
    const h = Math.min(this.input.scrollHeight, 100);
    this.input.style.height = h + 'px';
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this._unread = 0;
    if (this.badge) this.badge.style.display = 'none';
    if (this.overlay) this.overlay.classList.remove('hidden');
    if (this.input) this.input.readOnly = true;
    const sideButtons = document.getElementById('side-buttons');
    if (sideButtons) sideButtons.style.display = 'none';
    this._renderAll();
    this._scrollToBottom();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.overlay) this.overlay.classList.add('hidden');
    if (this.input) {
      this.input.blur();
      this.input.value = '';
      this.input.readOnly = true;
      this._autosize();
    }
    const sideButtons = document.getElementById('side-buttons');
    if (sideButtons) sideButtons.style.display = 'flex';
    this._keyboardOpen = false;
    this._adjustForKeyboard();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  send() {
    if (!this.input || !this.socket) return;
    const raw = this.input.value;
    if (!raw) return;
    const text = cutText(raw.trim());
    if (!text) return;
    this.input.value = '';
    this._autosize();
    if (this.socket.sendJSON) {
      this.socket.sendJSON({ type: 'chat_send', text });
    }
  }

  append(msg) {
    if (!msg || typeof msg.text !== 'string') return;

    this.messages.push({
      id: msg.id || 0,
      name: String(msg.name || 'anon').slice(0, 16),
      team: msg.team === 'red' ? 'red' : msg.team === 'blue' ? 'blue' : null,
      text: cutText(msg.text),
      ts: msg.ts || Date.now(),
    });

    if (this.messages.length > MAX_MESSAGES) {
      this.messages.shift();
    }

    if (this.isOpen) {
      this._renderOne(this.messages[this.messages.length - 1]);
      this._scrollToBottom();
    } else {
      this._unread++;
      if (this.badge) this.badge.style.display = 'block';
    }
  }

  _renderOne(m) {
    if (!this.list) return;
    if (this.list.querySelector('.chat-empty')) {
      this.list.innerHTML = '';
    }
    const div = document.createElement('div');
    div.className = 'chat-msg';
    if (m.team === 'red') div.classList.add('red');
    else if (m.team === 'blue') div.classList.add('blue');
    else div.classList.add('none');
    if (m.id === this.myId) div.classList.add('self');

    const name = document.createElement('div');
    name.className = 'chat-msg-name';
    name.textContent = m.name;

    const text = document.createElement('div');
    text.className = 'chat-msg-text';
    text.innerHTML = esc(m.text);

    div.appendChild(name);
    div.appendChild(text);
    this.list.appendChild(div);
  }

  _renderAll() {
    if (!this.list) return;
    this.list.innerHTML = '';
    if (this.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      empty.textContent = 'нет сообщений';
      this.list.appendChild(empty);
      return;
    }
    for (const m of this.messages) {
      this._renderOne(m);
    }
  }

  _scrollToBottom() {
    if (!this.list) return;
    requestAnimationFrame(() => {
      this.list.scrollTop = this.list.scrollHeight;
    });
  }
}