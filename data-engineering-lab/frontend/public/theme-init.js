// Applies the saved theme before first paint to avoid a flash. External file so a strict CSP (no inline scripts) works.
try {
  var t = localStorage.getItem('delab.theme') || 'dark';
  if (t === 'light') document.documentElement.classList.remove('dark');
} catch { /* storage unavailable: keep the default dark theme */ }
