const IGNORED_PATTERNS = [
  "Couldn't load texture",
  'GLTFLoader',
  'THREE.GLTFLoader',
  'blob:https',
];

function isIgnored(text) {
  if (!text) return false;
  const s = String(text);
  for (let i = 0; i < IGNORED_PATTERNS.length; i++) {
    if (s.includes(IGNORED_PATTERNS[i])) return true;
  }
  return false;
}

export function initErrorOverlay() {
  const el = document.getElementById('error-overlay');
  const txt = document.getElementById('error-text');
  if (!el || !txt) return;

  const lines = [];

  function render() {
    txt.innerHTML = lines.join('<br>');
    el.style.display = 'block';
  }

  window.addEventListener('error', (e) => {
    const msg = (e.message || '') + ' ' + (e.filename || '');
    if (isIgnored(msg)) return;
    lines.push(`[error] ${e.message} @ ${e.filename}:${e.lineno}`);
    if (lines.length > 20) lines.shift();
    render();
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    if (isIgnored(reason)) return;
    lines.push(`[promise] ${reason}`);
    if (lines.length > 20) lines.shift();
    render();
  });

  const origError = console.error;
  console.error = function (...args) {
    const text = args.map(a => a && a.message ? a.message : String(a)).join(' ');
    if (isIgnored(text)) {
      origError.apply(console, args);
      return;
    }
    lines.push(`[console] ${text}`);
    if (lines.length > 20) lines.shift();
    render();
    origError.apply(console, args);
  };
}