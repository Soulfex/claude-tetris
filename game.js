'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const startScreen = document.getElementById('start-screen');
const startScoresEl = document.getElementById('start-scores');
const startRecordsEl = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const gameoverExtra = document.getElementById('gameover-extra');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const newRecordMsg = document.getElementById('new-record-msg');
const overlayScoresEl = document.getElementById('overlay-scores');

const SCORES_KEY = 'tetris.highscores';
const RECORDS_KEY = 'tetris.records';
const MAX_SCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo = 0, bestCombo = 0, pendingScore = false;

// ---- Records (localStorage, siempre con try/catch) ----
function loadScores() {
  try {
    const data = JSON.parse(localStorage.getItem(SCORES_KEY));
    if (!Array.isArray(data)) return [];
    return data
      .filter(e => e && Number.isFinite(e.score))
      .map(e => ({
        name: String(e.name ?? '').slice(0, 12),
        score: e.score,
        lines: Number(e.lines) || 0,
        level: Number(e.level) || 1,
        date: String(e.date ?? ''),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  } catch (e) {
    return [];
  }
}

function saveScores(list) {
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(list)); } catch (e) { /* sin almacenamiento */ }
}

function loadRecords() {
  try {
    const r = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return {
      bestCombo: Number(r && r.bestCombo) || 0,
      maxLines: Number(r && r.maxLines) || 0,
    };
  } catch (e) {
    return { bestCombo: 0, maxLines: 0 };
  }
}

function saveRecords(r) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(r)); } catch (e) { /* sin almacenamiento */ }
}

function qualifies(s) {
  if (s <= 0) return false;
  const list = loadScores();
  return list.length < MAX_SCORES || s > list[list.length - 1].score;
}

function renderScores(container, highlight) {
  container.textContent = '';
  const list = loadScores();
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin puntuaciones todavía';
    container.appendChild(li);
    return;
  }
  let marked = false;
  list.forEach((e, i) => {
    const li = document.createElement('li');
    if (highlight && !marked && e.date === highlight.date && e.score === highlight.score && e.name === highlight.name) {
      li.className = 'highlight';
      marked = true;
    }
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = i + 1;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = e.name || 'Anónimo';
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = e.score.toLocaleString();
    li.append(rank, name, pts);
    li.title = `${e.lines} líneas · nivel ${e.level}`;
    container.appendChild(li);
  });
}

function updateRecords() {
  const r = loadRecords();
  r.bestCombo = Math.max(r.bestCombo, bestCombo);
  r.maxLines = Math.max(r.maxLines, lines);
  saveRecords(r);
}

function showStartScreen() {
  gameOver = true; // bloquea las teclas del juego hasta pulsar Jugar
  renderScores(startScoresEl);
  const r = loadRecords();
  startRecordsEl.textContent = `Mejor combo: ${r.bestCombo} · Máx. líneas: ${r.maxLines}`;
  startScreen.classList.remove('hidden');
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    combo++;
    bestCombo = Math.max(bestCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  updateRecords();
  pendingScore = qualifies(score);
  gameoverExtra.classList.remove('hidden');
  nameForm.classList.toggle('hidden', !pendingScore);
  newRecordMsg.classList.toggle('hidden', !pendingScore);
  renderScores(overlayScoresEl);
  overlay.classList.remove('hidden');
  if (pendingScore) {
    nameInput.value = '';
    nameInput.focus();
  }
}

function submitScore() {
  if (!pendingScore) return;
  pendingScore = false;
  const entry = {
    name: nameInput.value.trim().slice(0, 12) || 'Anónimo',
    score,
    lines,
    level,
    date: new Date().toISOString(),
  };
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  saveScores(list.slice(0, MAX_SCORES));
  nameForm.classList.add('hidden');
  newRecordMsg.classList.add('hidden');
  renderScores(overlayScoresEl, entry);
  restartBtn.focus();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return; // endGame ya paró el bucle; no reprogramarlo
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  if (pendingScore) submitScore(); // no perder un récord si se reinicia sin pulsar Guardar
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  bestCombo = 0;
  pendingScore = false;
  gameoverExtra.classList.add('hidden');
  startScreen.classList.add('hidden');
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
playBtn.addEventListener('click', init);
nameForm.addEventListener('submit', e => {
  e.preventDefault();
  submitScore();
});
resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todas las puntuaciones y records?')) return;
  try {
    localStorage.removeItem(SCORES_KEY);
    localStorage.removeItem(RECORDS_KEY);
  } catch (e) { /* sin almacenamiento */ }
  showStartScreen();
});

showStartScreen();
