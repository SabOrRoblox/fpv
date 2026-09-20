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
    lines.push(`[error] ${e.message} @ ${e.filename}:${e.lineno}`);
    if (lines.length > 20) lines.shift();
    render();
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    lines.push(`[promise] ${reason}`);
    if (lines.length > 20) lines.shift();
    render();
  });

  const origError = console.error;
  console.error = function (...args) {
    lines.push(`[console] ${args.map(a => a && a.message ? a.message : String(a)).join(' ')}`);
    if (lines.length > 20) lines.shift();
    render();
    origError.apply(console, args);
  };
}