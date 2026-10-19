import { Calculator } from './calculator.js';
import { formatNumber } from './engine.js';

const $ = selector => document.querySelector(selector);
const calculator = new Calculator();
const expressionInput = $('#expression');
const resultOutput = $('#result');
const display = $('#display');
let toastTimeout;
let history = [];
let storageAvailable = true;
const storageKey = 'forma-history-v1';

function readPreference(key) {
  try { return localStorage.getItem(key); } catch { storageAvailable = false; return null; }
}
function savePreference(key, value) {
  try { localStorage.setItem(key, value); } catch { storageAvailable = false; }
}

try {
  const saved = JSON.parse(readPreference(storageKey) || '[]');
  if (Array.isArray(saved)) history = saved.filter(item => item && typeof item.expression === 'string' && item.expression.length <= 512 && Number.isFinite(item.result) && Number.isFinite(item.timestamp) && ['deg', 'rad'].includes(item.angleMode)).slice(0, 50);
} catch { /* A corrupt or unavailable store should never prevent calculating. */ }

function prettyExpression(value) {
  return value.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/pi/g, 'π').replace(/sqrt/g, '√').replace(/\^/g, '^');
}

function render({ animate = false } = {}) {
  if (expressionInput.value !== calculator.expression) expressionInput.value = calculator.expression;
  const value = calculator.evaluated ? calculator.lastResult : calculator.preview;
  const text = calculator.error ? 'Let’s try again' : value === null ? '—' : formatNumber(value);
  const changed = resultOutput.textContent !== text;
  resultOutput.textContent = text;
  resultOutput.classList.toggle('medium', text.length > 10 && text.length <= 15);
  resultOutput.classList.toggle('small', text.length > 15);
  resultOutput.classList.toggle('error', !!calculator.error);
  display.classList.toggle('has-error', !!calculator.error);
  $('#display-label').textContent = calculator.evaluated ? 'A LITTLE CLARITY. THERE IT IS.' : 'LET’S WORK IT OUT';
  const hint = calculator.error || (calculator.evaluated ? 'Looking good. Keep the ideas coming.' : calculator.expression ? 'A little thinking, in real time' : 'Ready when you are');
  const hintElement = $('#display-hint');
  hintElement.replaceChildren();
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  hintElement.append(dot, document.createTextNode(` ${hint}`));
  if (changed && animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    resultOutput.animate([{ opacity: .3, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'ease-out' });
  }
  expressionInput.scrollLeft = expressionInput.scrollWidth;
}

function toast(message) {
  $('#toast span').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('#toast').classList.remove('visible'), 2400);
}

function renderHistory() {
  const list = $('#history-list');
  list.replaceChildren();
  $('#history-empty').hidden = history.length > 0;
  $('#history-count').textContent = history.length;
  $('#clear-history').disabled = history.length === 0;
  history.forEach(item => {
    const button = document.createElement('button');
    button.className = 'history-item';
    button.title = 'Reuse this calculation';
    const expression = document.createElement('span');
    expression.className = 'history-expression';
    expression.textContent = prettyExpression(item.expression) + ' =';
    const result = document.createElement('span');
    result.className = 'history-result';
    result.textContent = formatNumber(item.result);
    const time = document.createElement('span');
    time.className = 'history-time';
    time.textContent = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    button.append(expression, result, time);
    button.addEventListener('click', () => {
      calculator.setExpression(item.expression);
      calculator.angleMode = item.angleMode;
      $('#angle-toggle').textContent = item.angleMode.toUpperCase();
      render({ animate: true });
      toast('Back in your flow');
    });
    list.append(button);
  });
  if (!storageAvailable) $('.history-footer').textContent = 'History is available for this session only.';
}

function calculate() {
  const entry = calculator.calculate();
  if (entry) {
    history.unshift(entry);
    history = history.slice(0, 50);
    savePreference(storageKey, JSON.stringify(history));
    renderHistory();
    $('#history-content').scrollTop = 0;
  }
  render({ animate: true });
}

function activateKey(button, event) {
  const rect = button.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const x = event?.clientX ? event.clientX - rect.left : rect.width / 2;
  const y = event?.clientY ? event.clientY - rect.top : rect.height / 2;
  ripple.style.left = `${x - 65}px`;
  ripple.style.top = `${y - 65}px`;
  button.append(ripple);
  setTimeout(() => ripple.remove(), 550);
  button.classList.add('pressed');
  setTimeout(() => button.classList.remove('pressed'), 140);
}

function runAction(action) {
  if (action === 'clear') calculator.clear();
  if (action === 'backspace') calculator.backspace();
  if (action === 'sign') calculator.toggleSign();
  if (action === 'equals') return calculate();
  render({ animate: true });
}

document.querySelectorAll('.key').forEach(button => {
  button.addEventListener('click', event => {
    activateKey(button, event);
    if (button.dataset.action) runAction(button.dataset.action);
    else { calculator.input(button.dataset.value); render({ animate: true }); }
  });
});

expressionInput.addEventListener('input', () => { calculator.setExpression(expressionInput.value); render(); });

document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (document.querySelector('dialog[open]')) return;
  if (event.key === '?') { event.preventDefault(); $('#shortcuts-dialog').showModal(); return; }
  if (event.key === 'Escape') { event.preventDefault(); runAction('clear'); return; }
  if (event.key === 'Enter' || event.key === '=') {
    // Do not hijack Enter on controls such as tabs, history, and dialog buttons.
    if (event.key === 'Enter' && event.target.closest('button:not(.key)')) return;
    event.preventDefault();
    activateKey($('[data-action="equals"]'));
    calculate();
    return;
  }
  if (event.target === expressionInput) {
    if (calculator.evaluated && /^[\d.]$/.test(event.key)) calculator.clear();
    else if (calculator.evaluated && /^[+\-*/^%]$/.test(event.key)) {
      calculator.setExpression(String(calculator.lastResult));
    }
    if (calculator.evaluated) calculator.evaluated = false;
    // Render the starting value before the browser inserts the new character.
    if (expressionInput.value !== calculator.expression) {
      expressionInput.value = calculator.expression;
      expressionInput.setSelectionRange(expressionInput.value.length, expressionInput.value.length);
    }
    return;
  }
  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault(); activateKey($('[data-action="backspace"]')); runAction('backspace'); return;
  }
  if (/^[\d.+\-*/%()^]$/.test(event.key)) {
    event.preventDefault();
    calculator.input(event.key);
    const button = [...document.querySelectorAll('[data-value]')].find(key => key.dataset.value === event.key && !key.closest('[hidden]'));
    if (button) activateKey(button);
    render({ animate: true });
  }
});

function setMode(scientific) {
  $('#calculator').classList.toggle('scientific', scientific);
  $('#scientific-keys').hidden = !scientific;
  $('#angle-toggle').hidden = !scientific;
  $('.calculator-label').hidden = scientific;
  $('#standard-mode').classList.toggle('active', !scientific);
  $('#scientific-mode').classList.toggle('active', scientific);
  $('#standard-mode').setAttribute('aria-selected', String(!scientific));
  $('#scientific-mode').setAttribute('aria-selected', String(scientific));
}
$('#standard-mode').addEventListener('click', () => setMode(false));
$('#scientific-mode').addEventListener('click', () => setMode(true));
$('.mode-tabs').addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const scientific = event.key === 'ArrowRight';
  setMode(scientific);
  $(scientific ? '#scientific-mode' : '#standard-mode').focus();
});
$('#angle-toggle').addEventListener('click', () => {
  calculator.angleMode = calculator.angleMode === 'deg' ? 'rad' : 'deg';
  calculator.evaluated = false;
  calculator.error = null;
  $('#angle-toggle').textContent = calculator.angleMode.toUpperCase();
  render({ animate: true });
  toast(calculator.angleMode === 'deg' ? 'Angles in degrees' : 'Angles in radians');
});

$('#clear-history').addEventListener('click', () => {
  history = [];
  savePreference(storageKey, '[]');
  renderHistory();
  toast('A clean slate. All yours.');
});

$('#copy-result').addEventListener('click', async () => {
  const value = calculator.evaluated ? calculator.lastResult : calculator.preview;
  if (value === null || calculator.error) return toast('Finish your calculation first');
  const text = formatNumber(value).replace(/,/g, '');
  try {
    await navigator.clipboard.writeText(text);
    toast('Result copied. Take it with you.');
  } catch {
    // Clipboard permissions vary. Selecting the visible result is a safe fallback.
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(resultOutput);
    selection.removeAllRanges();
    selection.addRange(range);
    toast('Result selected. Press Ctrl+C to copy.');
  }
});

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-toggle use').setAttribute('href', dark ? '#i-moon' : '#i-sun');
  $('#theme-toggle').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  $('meta[name="theme-color"]').content = dark ? '#17251e' : '#f6f7f2';
}
applyTheme(readPreference('forma-theme') === 'dark');
$('#theme-toggle').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme !== 'dark';
  applyTheme(dark);
  savePreference('forma-theme', dark ? 'dark' : 'light');
});

$('#shortcuts-button').addEventListener('click', () => $('#shortcuts-dialog').showModal());
$('#tip-shortcuts').addEventListener('click', () => $('#shortcuts-dialog').showModal());
$('#about-button').addEventListener('click', () => $('#about-dialog').showModal());
document.querySelectorAll('[data-close-dialog]').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
});

render();
renderHistory();
