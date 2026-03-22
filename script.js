// =====================================================================
// ASCII CANVAS EDITOR — Core Engine
// =====================================================================

(function() {
'use strict';

// ---------- CONSTANTS ----------
const COLS = 200;
const ROWS = 80;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.05;

// Border character sets
const BORDERS = {
  simple:  { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
  double:  { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
  rounded: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  heavy:   { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
  light:   { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
};

const LINE_CHARS = {
  ascii:  { h: '-', v: '|', corner: '+' },
  light:  { h: '─', v: '│', corner: '┼' },
  heavy:  { h: '━', v: '┃', corner: '╋' },
  dashed: { h: '-', v: '|', corner: '+', dash: true },
  dotted: { h: '·', v: ':', corner: '+' },
};

// ---------- STATE ----------
let grid = [];
let undoStack = [];
let redoStack = [];
let currentTool = 'select';
let borderStyle = 'simple';
let lineStyle = 'ascii';
let arrowHead = 'arrow';
let freehandChar = '*';
let eraserSize = 1;
let diamondStyle = 'simple';
let zoom = 1;
let panX = 0, panY = 0;
let isPanning = false;
let isSpaceDown = false;
let isDrawing = false;
let drawStartCol = 0, drawStartRow = 0;
let lastMouseX = 0, lastMouseY = 0;
let charWidth = 0, charHeight = 0;
let selectedShape = null; // { type, col, row, data }
let moveStartCol = 0, moveStartRow = 0;
let isMoving = false;
let moveShapeData = null;
let previewGrid = null;

// DOM refs
const canvasContainer = document.getElementById('canvas-container');
const asciiCanvas = document.getElementById('ascii-canvas');
const interactionLayer = document.getElementById('interaction-layer');
const overlayCanvas = document.getElementById('overlay-canvas');
const gridCanvas = document.getElementById('grid-canvas');
const overlayCtx = overlayCanvas.getContext('2d');
const gridCtx = gridCanvas.getContext('2d');
const textOverlay = document.getElementById('text-input-overlay');
const textArea = textOverlay.querySelector('textarea');
const toast = document.getElementById('toast');

// ---------- INIT ----------
function initGrid() {
  grid = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      grid[r][c] = ' ';
    }
  }
}

function measureChar() {
  const span = document.createElement('span');
  span.style.fontFamily = "'JetBrains Mono', 'Consolas', monospace";
  span.style.fontSize = '14px';
  span.style.lineHeight = '1.3';
  span.style.position = 'absolute';
  span.style.visibility = 'hidden';
  span.style.whiteSpace = 'pre';
  span.textContent = 'M';
  document.body.appendChild(span);
  const rect = span.getBoundingClientRect();
  charWidth = rect.width;
  charHeight = rect.height;
  document.body.removeChild(span);
}

function init() {
  measureChar();
  initGrid();
  resizeCanvases();
  render();
  drawGrid();
  updatePanels();
  window.addEventListener('resize', () => {
    resizeCanvases();
    drawGrid();
    render();
  });
}

// ---------- CANVAS SIZING ----------
function resizeCanvases() {
  const rect = canvasContainer.getBoundingClientRect();
  overlayCanvas.width = rect.width;
  overlayCanvas.height = rect.height;
  gridCanvas.width = rect.width;
  gridCanvas.height = rect.height;
}

// ---------- GRID DRAWING ----------
function drawGrid() {
  const rect = canvasContainer.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  gridCtx.clearRect(0, 0, w, h);

  if (zoom < 0.5) return; // hide grid when zoomed far out

  const cw = charWidth * zoom;
  const ch = charHeight * zoom;

  gridCtx.strokeStyle = 'rgba(255,255,255,0.04)';
  gridCtx.lineWidth = 0.5;

  const startCol = Math.floor(-panX / cw);
  const endCol = Math.ceil((w - panX) / cw);
  const startRow = Math.floor(-panY / ch);
  const endRow = Math.ceil((h - panY) / ch);

  gridCtx.beginPath();
  for (let c = startCol; c <= endCol; c++) {
    const x = panX + c * cw;
    if (x >= 0 && x <= w) {
      gridCtx.moveTo(Math.round(x) + 0.5, 0);
      gridCtx.lineTo(Math.round(x) + 0.5, h);
    }
  }
  for (let r = startRow; r <= endRow; r++) {
    const y = panY + r * ch;
    if (y >= 0 && y <= h) {
      gridCtx.moveTo(0, Math.round(y) + 0.5);
      gridCtx.lineTo(w, Math.round(y) + 0.5);
    }
  }
  gridCtx.stroke();
}

// ---------- RENDER ----------
function render() {
  const displayGrid = previewGrid || grid;
  let lines = [];
  for (let r = 0; r < ROWS; r++) {
    lines.push(displayGrid[r].join(''));
  }
  asciiCanvas.textContent = lines.join('\n');
  asciiCanvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

// ---------- OVERLAY DRAWING ----------
function clearOverlay() {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

function drawSelectionRect(col, row, w, h) {
  clearOverlay();
  const cw = charWidth * zoom;
  const ch = charHeight * zoom;
  overlayCtx.strokeStyle = 'rgba(79, 152, 163, 0.7)';
  overlayCtx.lineWidth = 1;
  overlayCtx.setLineDash([4, 4]);
  overlayCtx.strokeRect(
    panX + col * cw,
    panY + row * ch,
    w * cw,
    h * ch
  );
  overlayCtx.setLineDash([]);
}

function drawPreviewRect(col, row, w, h) {
  clearOverlay();
  const cw = charWidth * zoom;
  const ch = charHeight * zoom;
  overlayCtx.fillStyle = 'rgba(79, 152, 163, 0.08)';
  overlayCtx.fillRect(panX + col * cw, panY + row * ch, w * cw, h * ch);
  overlayCtx.strokeStyle = 'rgba(79, 152, 163, 0.4)';
  overlayCtx.lineWidth = 1;
  overlayCtx.strokeRect(panX + col * cw, panY + row * ch, w * cw, h * ch);
}

function drawCursorHighlight(col, row, size) {
  clearOverlay();
  const cw = charWidth * zoom;
  const ch = charHeight * zoom;
  const half = Math.floor(size / 2);
  overlayCtx.fillStyle = 'rgba(79, 152, 163, 0.15)';
  overlayCtx.fillRect(
    panX + (col - half) * cw,
    panY + (row - half) * ch,
    size * cw,
    size * ch
  );
}

// ---------- COORDINATE CONVERSION ----------
function screenToGrid(sx, sy) {
  const rect = canvasContainer.getBoundingClientRect();
  const x = sx - rect.left;
  const y = sy - rect.top;
  const col = Math.floor((x - panX) / (charWidth * zoom));
  const row = Math.floor((y - panY) / (charHeight * zoom));
  return { col: Math.max(0, Math.min(COLS - 1, col)), row: Math.max(0, Math.min(ROWS - 1, row)) };
}

// ---------- GRID OPERATIONS ----------
function setCell(r, c, ch) {
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
    grid[r][c] = ch;
  }
}

function getCell(r, c) {
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
    return grid[r][c];
  }
  return ' ';
}

function cloneGrid(g) {
  return g.map(row => [...row]);
}

function saveUndo() {
  undoStack.push(cloneGrid(grid));
  if (undoStack.length > 100) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(cloneGrid(grid));
  grid = undoStack.pop();
  render();
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(cloneGrid(grid));
  grid = redoStack.pop();
  render();
}

// ---------- DRAWING: RECTANGLE ----------
function drawRectangle(c1, r1, c2, r2, style, targetGrid) {
  const g = targetGrid || grid;
  const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
  const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
  const b = BORDERS[style];

  if (maxR - minR < 1 || maxC - minC < 1) return;

  // Corners
  if (minR >= 0 && minR < ROWS && minC >= 0 && minC < COLS) g[minR][minC] = b.tl;
  if (minR >= 0 && minR < ROWS && maxC >= 0 && maxC < COLS) g[minR][maxC] = b.tr;
  if (maxR >= 0 && maxR < ROWS && minC >= 0 && minC < COLS) g[maxR][minC] = b.bl;
  if (maxR >= 0 && maxR < ROWS && maxC >= 0 && maxC < COLS) g[maxR][maxC] = b.br;

  // Top/bottom
  for (let c = minC + 1; c < maxC; c++) {
    if (minR >= 0 && minR < ROWS && c >= 0 && c < COLS) g[minR][c] = b.h;
    if (maxR >= 0 && maxR < ROWS && c >= 0 && c < COLS) g[maxR][c] = b.h;
  }
  // Left/right
  for (let r = minR + 1; r < maxR; r++) {
    if (r >= 0 && r < ROWS && minC >= 0 && minC < COLS) g[r][minC] = b.v;
    if (r >= 0 && r < ROWS && maxC >= 0 && maxC < COLS) g[r][maxC] = b.v;
  }
}

// ---------- DRAWING: DIAMOND ----------
function drawDiamond(c1, r1, c2, r2, style, targetGrid) {
  const g = targetGrid || grid;
  const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
  const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
  const centerC = (minC + maxC) / 2;
  const centerR = (minR + maxR) / 2;
  const halfW = (maxC - minC) / 2;
  const halfH = (maxR - minR) / 2;

  if (halfW < 1 || halfH < 1) return;

  if (style === 'unicode') {
    for (let r = minR; r <= maxR; r++) {
      const dist = Math.abs(r - centerR) / halfH;
      const w = Math.round((1 - dist) * halfW);
      const lc = Math.round(centerC) - w;
      const rc = Math.round(centerC) + w;
      if (r >= 0 && r < ROWS) {
        if (r === minR || r === maxR) {
          const cc = Math.round(centerC);
          if (cc >= 0 && cc < COLS) g[r][cc] = '◆';
        } else {
          if (lc >= 0 && lc < COLS) g[r][lc] = r < centerR ? '╱' : '╲';
          if (rc >= 0 && rc < COLS && rc !== lc) g[r][rc] = r < centerR ? '╲' : '╱';
          if (r === Math.round(centerR) && lc !== rc) {
            if (lc >= 0 && lc < COLS) g[r][lc] = '◆';
            if (rc >= 0 && rc < COLS) g[r][rc] = '◆';
          }
        }
      }
    }
    return;
  }

  // Simple diamond with / \ and - characters
  for (let r = minR; r <= maxR; r++) {
    const dist = Math.abs(r - centerR) / halfH;
    const w = Math.round((1 - dist) * halfW);
    const lc = Math.round(centerC) - w;
    const rc = Math.round(centerC) + w;

    if (r >= 0 && r < ROWS) {
      if (r === minR || r === maxR) {
        // Top/bottom point
        const cc = Math.round(centerC);
        if (cc >= 0 && cc < COLS) g[r][cc] = '.';
      } else if (lc === rc) {
        if (lc >= 0 && lc < COLS) g[r][lc] = '<';
      } else {
        if (lc >= 0 && lc < COLS) g[r][lc] = r < centerR ? '/' : '\\';
        if (rc >= 0 && rc < COLS) g[r][rc] = r < centerR ? '\\' : '/';
        // Horizontal edges at widest row
        if (Math.abs(r - centerR) < 0.6) {
          if (lc >= 0 && lc < COLS) g[r][lc] = '<';
          if (rc >= 0 && rc < COLS) g[r][rc] = '>';
          for (let c = lc + 1; c < rc; c++) {
            if (c >= 0 && c < COLS) g[r][c] = '-';
          }
        }
      }
    }
  }
}

// ---------- DRAWING: LINE ----------
function drawLine(c1, r1, c2, r2, style, targetGrid) {
  const g = targetGrid || grid;
  const lc = LINE_CHARS[style];

  const dc = c2 - c1;
  const dr = r2 - r1;

  if (dc === 0 && dr === 0) {
    if (r1 >= 0 && r1 < ROWS && c1 >= 0 && c1 < COLS) g[r1][c1] = lc.corner;
    return;
  }

  // Purely horizontal
  if (dr === 0) {
    const start = Math.min(c1, c2);
    const end = Math.max(c1, c2);
    for (let c = start; c <= end; c++) {
      if (r1 >= 0 && r1 < ROWS && c >= 0 && c < COLS) {
        g[r1][c] = (lc.dash && (c - start) % 2 === 1) ? ' ' : lc.h;
      }
    }
    return;
  }

  // Purely vertical
  if (dc === 0) {
    const start = Math.min(r1, r2);
    const end = Math.max(r1, r2);
    for (let r = start; r <= end; r++) {
      if (r >= 0 && r < ROWS && c1 >= 0 && c1 < COLS) {
        g[r][c1] = lc.v;
      }
    }
    return;
  }

  // L-shaped: horizontal first, then vertical
  const midC = c2;

  // Horizontal segment
  const hStart = Math.min(c1, midC);
  const hEnd = Math.max(c1, midC);
  for (let c = hStart; c <= hEnd; c++) {
    if (r1 >= 0 && r1 < ROWS && c >= 0 && c < COLS) {
      g[r1][c] = (lc.dash && (c - hStart) % 2 === 1) ? ' ' : lc.h;
    }
  }

  // Vertical segment
  const vStart = Math.min(r1, r2);
  const vEnd = Math.max(r1, r2);
  for (let r = vStart; r <= vEnd; r++) {
    if (r >= 0 && r < ROWS && midC >= 0 && midC < COLS) {
      g[r][midC] = lc.v;
    }
  }

  // Corner where they meet
  if (r1 >= 0 && r1 < ROWS && midC >= 0 && midC < COLS) {
    g[r1][midC] = lc.corner;
  }
}

// ---------- DRAWING: ARROW ----------
function drawArrow(c1, r1, c2, r2, style, head, targetGrid) {
  const g = targetGrid || grid;
  const lc = LINE_CHARS[style];

  drawLine(c1, r1, c2, r2, style, g);

  // Arrow head at end
  if (r2 >= 0 && r2 < ROWS && c2 >= 0 && c2 < COLS) {
    const dc = c2 - c1;
    const dr = r2 - r1;

    let headChar;
    if (head === 'triangle') {
      if (Math.abs(dr) > Math.abs(dc)) {
        headChar = dr > 0 ? '▼' : '▲';
      } else {
        headChar = dc > 0 ? '▶' : '◀';
      }
    } else {
      if (Math.abs(dr) > Math.abs(dc)) {
        headChar = dr > 0 ? 'v' : '^';
      } else {
        headChar = dc > 0 ? '>' : '<';
      }
    }
    g[r2][c2] = headChar;
  }
}

// ---------- DRAWING: FREEHAND ----------
function drawFreehandCell(r, c, ch) {
  setCell(r, c, ch);
}

// ---------- DRAWING: ERASER ----------
function eraseArea(r, c, size) {
  const half = Math.floor(size / 2);
  for (let dr = -half; dr <= half; dr++) {
    for (let dc = -half; dc <= half; dc++) {
      setCell(r + dr, c + dc, ' ');
    }
  }
}

// ---------- COPY ASCII ----------
function copyASCII() {
  let lines = [];
  for (let r = 0; r < ROWS; r++) {
    lines.push(grid[r].join(''));
  }

  // Trim trailing whitespace from each line
  lines = lines.map(l => l.replace(/\s+$/, ''));

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  // Remove leading empty lines
  while (lines.length > 0 && lines[0] === '') {
    lines.shift();
  }

  if (lines.length === 0) {
    showToast('Canvas is empty', 'error');
    return;
  }

  // Find minimum leading whitespace
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.length === 0) continue;
    const match = line.match(/^\s*/);
    if (match) minIndent = Math.min(minIndent, match[0].length);
  }
  if (minIndent === Infinity) minIndent = 0;

  // Trim leading whitespace
  lines = lines.map(l => l.substring(minIndent));

  const text = lines.join('\n');

  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard', 'success');
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Copied to clipboard', 'success');
    } catch(e) {
      showToast('Copy failed — try Ctrl+C', 'error');
    }
    document.body.removeChild(ta);
  });
}

// ---------- TOAST ----------
function showToast(msg, type) {
  toast.textContent = msg;
  toast.className = 'show ' + (type || '');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = '';
  }, 2000);
}

// ---------- TOOL SWITCHING ----------
function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === tool);
  });

  // Update cursor
  if (tool === 'select') {
    canvasContainer.style.cursor = 'default';
  } else if (tool === 'text') {
    canvasContainer.style.cursor = 'text';
  } else if (tool === 'eraser') {
    canvasContainer.style.cursor = 'cell';
  } else {
    canvasContainer.style.cursor = 'crosshair';
  }

  // Update status
  const names = { select:'Select', rect:'Rectangle', diamond:'Diamond', line:'Line', arrow:'Arrow', text:'Text', freehand:'Freehand', eraser:'Eraser' };
  document.getElementById('status-tool').textContent = names[tool] || tool;

  updatePanels();
  clearOverlay();
}

function updatePanels() {
  document.getElementById('panel-border-styles').classList.toggle('hidden', currentTool !== 'rect');
  document.getElementById('panel-arrow-styles').classList.toggle('hidden', currentTool !== 'arrow');
  document.getElementById('panel-line-styles').classList.toggle('hidden', !(currentTool === 'line' || currentTool === 'arrow'));
  document.getElementById('panel-freehand').classList.toggle('hidden', currentTool !== 'freehand');
  document.getElementById('panel-eraser').classList.toggle('hidden', currentTool !== 'eraser');
  document.getElementById('panel-diamond-styles').classList.toggle('hidden', currentTool !== 'diamond');
}

// ---------- TEXT INPUT ----------
function startTextInput(col, row) {
  const cw = charWidth * zoom;
  const ch = charHeight * zoom;
  const rect = canvasContainer.getBoundingClientRect();
  const x = panX + col * cw;
  const y = panY + row * ch;

  textOverlay.style.display = 'block';
  textOverlay.style.left = x + 'px';
  textOverlay.style.top = y + 'px';

  textArea.style.fontSize = (14 * zoom) + 'px';
  textArea.style.lineHeight = 1.3;
  textArea.style.width = Math.max(80, (COLS - col) * cw) + 'px';
  textArea.style.height = ch + 'px';
  textArea.value = '';
  textArea.focus();

  textArea._col = col;
  textArea._row = row;

  textArea.oninput = () => {
    textArea.style.height = 'auto';
    textArea.style.height = textArea.scrollHeight + 'px';
  };

  textArea.onblur = () => {
    commitText();
  };

  textArea.onkeydown = (e) => {
    if (e.key === 'Escape') {
      commitText();
      e.preventDefault();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      commitText();
      e.preventDefault();
    }
  };
}

function commitText() {
  const text = textArea.value;
  if (text.length > 0) {
    saveUndo();
    const lines = text.split('\n');
    const startCol = textArea._col;
    const startRow = textArea._row;
    for (let i = 0; i < lines.length; i++) {
      for (let j = 0; j < lines[i].length; j++) {
        setCell(startRow + i, startCol + j, lines[i][j]);
      }
    }
    render();
  }
  textOverlay.style.display = 'none';
  textArea.value = '';
}

// ---------- SELECT / MOVE LOGIC ----------
function findShapeAt(col, row) {
  // Check if there's a non-space character at this position
  if (getCell(row, col) !== ' ') {
    return { col, row };
  }
  return null;
}

// ---------- MOUSE HANDLERS ----------
interactionLayer.addEventListener('mousedown', (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (isSpaceDown || e.button === 1) {
    isPanning = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    canvasContainer.style.cursor = 'grabbing';
    return;
  }

  if (e.button !== 0) return;

  const { col, row } = screenToGrid(e.clientX, e.clientY);

  if (currentTool === 'text') {
    startTextInput(col, row);
    return;
  }

  if (currentTool === 'select') {
    // Check for shape to move
    if (getCell(row, col) !== ' ') {
      isMoving = true;
      moveStartCol = col;
      moveStartRow = row;
      // Flood-find connected characters for moving
      moveShapeData = floodSelect(row, col);
      if (moveShapeData.length > 0) {
        saveUndo();
        // Erase original
        for (const cell of moveShapeData) {
          grid[cell.r][cell.c] = ' ';
        }
        render();
      }
      return;
    }
    // Start selection rectangle
    isDrawing = true;
    drawStartCol = col;
    drawStartRow = row;
    return;
  }

  isDrawing = true;
  drawStartCol = col;
  drawStartRow = row;

  if (currentTool === 'freehand') {
    saveUndo();
    drawFreehandCell(row, col, freehandChar);
    render();
  }

  if (currentTool === 'eraser') {
    saveUndo();
    eraseArea(row, col, eraserSize);
    render();
  }
});

interactionLayer.addEventListener('mousemove', (e) => {
  e.preventDefault();

  const { col, row } = screenToGrid(e.clientX, e.clientY);
  document.getElementById('status-cursor').textContent = `${col}, ${row}`;

  if (isPanning) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    panX += dx;
    panY += dy;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    render();
    drawGrid();
    return;
  }

  if (isMoving && moveShapeData) {
    const dc = col - moveStartCol;
    const dr = row - moveStartRow;

    // Show preview
    previewGrid = cloneGrid(grid);
    for (const cell of moveShapeData) {
      const nr = cell.r + dr;
      const nc = cell.c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        previewGrid[nr][nc] = cell.ch;
      }
    }
    render();
    previewGrid = null;
    return;
  }

  if (!isDrawing) {
    // Cursor highlights
    if (currentTool === 'eraser') {
      drawCursorHighlight(col, row, eraserSize);
    } else if (currentTool === 'freehand') {
      drawCursorHighlight(col, row, 1);
    } else if (currentTool === 'select') {
      clearOverlay();
      if (getCell(row, col) !== ' ') {
        canvasContainer.style.cursor = 'move';
      } else {
        canvasContainer.style.cursor = 'default';
      }
    } else {
      clearOverlay();
    }
    return;
  }

  // Drawing preview
  if (currentTool === 'rect' || currentTool === 'diamond') {
    const minC = Math.min(drawStartCol, col);
    const minR = Math.min(drawStartRow, row);
    const w = Math.abs(col - drawStartCol) + 1;
    const h = Math.abs(row - drawStartRow) + 1;
    drawPreviewRect(minC, minR, w, h);

    previewGrid = cloneGrid(grid);
    if (currentTool === 'rect') {
      drawRectangle(drawStartCol, drawStartRow, col, row, borderStyle, previewGrid);
    } else {
      drawDiamond(drawStartCol, drawStartRow, col, row, diamondStyle, previewGrid);
    }
    render();
    previewGrid = null;
  }

  if (currentTool === 'line') {
    previewGrid = cloneGrid(grid);
    drawLine(drawStartCol, drawStartRow, col, row, lineStyle, previewGrid);
    render();
    previewGrid = null;

    const minC = Math.min(drawStartCol, col);
    const minR = Math.min(drawStartRow, row);
    const w = Math.abs(col - drawStartCol) + 1;
    const h = Math.abs(row - drawStartRow) + 1;
    drawPreviewRect(minC, minR, w, h);
  }

  if (currentTool === 'arrow') {
    previewGrid = cloneGrid(grid);
    drawArrow(drawStartCol, drawStartRow, col, row, lineStyle, arrowHead, previewGrid);
    render();
    previewGrid = null;

    const minC = Math.min(drawStartCol, col);
    const minR = Math.min(drawStartRow, row);
    const w = Math.abs(col - drawStartCol) + 1;
    const h = Math.abs(row - drawStartRow) + 1;
    drawPreviewRect(minC, minR, w, h);
  }

  if (currentTool === 'freehand') {
    drawFreehandCell(row, col, freehandChar);
    render();
  }

  if (currentTool === 'eraser') {
    eraseArea(row, col, eraserSize);
    render();
    drawCursorHighlight(col, row, eraserSize);
  }

  if (currentTool === 'select') {
    const minC = Math.min(drawStartCol, col);
    const minR = Math.min(drawStartRow, row);
    const w = Math.abs(col - drawStartCol) + 1;
    const h = Math.abs(row - drawStartRow) + 1;
    drawSelectionRect(minC, minR, w, h);
  }
});

interactionLayer.addEventListener('mouseup', (e) => {
  e.preventDefault();

  if (isPanning) {
    isPanning = false;
    canvasContainer.style.cursor = currentTool === 'select' ? 'default' : 'crosshair';
    return;
  }

  if (isMoving && moveShapeData) {
    const { col, row } = screenToGrid(e.clientX, e.clientY);
    const dc = col - moveStartCol;
    const dr = row - moveStartRow;

    for (const cell of moveShapeData) {
      const nr = cell.r + dr;
      const nc = cell.c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        grid[nr][nc] = cell.ch;
      }
    }
    isMoving = false;
    moveShapeData = null;
    render();
    clearOverlay();
    return;
  }

  if (!isDrawing) return;
  isDrawing = false;

  const { col, row } = screenToGrid(e.clientX, e.clientY);

  if (currentTool === 'rect') {
    if (Math.abs(col - drawStartCol) >= 1 && Math.abs(row - drawStartRow) >= 1) {
      saveUndo();
      drawRectangle(drawStartCol, drawStartRow, col, row, borderStyle);
      render();
    }
  }

  if (currentTool === 'diamond') {
    if (Math.abs(col - drawStartCol) >= 2 && Math.abs(row - drawStartRow) >= 2) {
      saveUndo();
      drawDiamond(drawStartCol, drawStartRow, col, row, diamondStyle);
      render();
    }
  }

  if (currentTool === 'line') {
    saveUndo();
    drawLine(drawStartCol, drawStartRow, col, row, lineStyle);
    render();
  }

  if (currentTool === 'arrow') {
    saveUndo();
    drawArrow(drawStartCol, drawStartRow, col, row, lineStyle, arrowHead);
    render();
  }

  if (currentTool === 'select') {
    // Selection complete
    const minC = Math.min(drawStartCol, col);
    const maxC = Math.max(drawStartCol, col);
    const minR = Math.min(drawStartRow, row);
    const maxR = Math.max(drawStartRow, row);
    selectedShape = { minC, maxC, minR, maxR };
  }

  clearOverlay();
});

interactionLayer.addEventListener('mouseleave', () => {
  if (isPanning) {
    isPanning = false;
  }
  clearOverlay();
});

// ---------- FLOOD SELECT ----------
function floodSelect(startR, startC) {
  const visited = new Set();
  const stack = [[startR, startC]];
  const result = [];

  while (stack.length > 0) {
    const [r, c] = stack.pop();
    const key = r * COLS + c;
    if (visited.has(key)) continue;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
    if (grid[r][c] === ' ') continue;

    visited.add(key);
    result.push({ r, c, ch: grid[r][c] });

    // 8-directional flood
    stack.push([r-1, c], [r+1, c], [r, c-1], [r, c+1]);
    stack.push([r-1, c-1], [r-1, c+1], [r+1, c-1], [r+1, c+1]);
  }

  return result;
}

// ---------- ZOOM ----------
canvasContainer.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvasContainer.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const oldZoom = zoom;
  if (e.deltaY < 0) {
    zoom = Math.min(MAX_ZOOM, zoom + ZOOM_STEP);
  } else {
    zoom = Math.max(MIN_ZOOM, zoom - ZOOM_STEP);
  }

  // Zoom toward mouse
  const ratio = zoom / oldZoom;
  panX = mx - ratio * (mx - panX);
  panY = my - ratio * (my - panY);

  document.getElementById('status-zoom').textContent = Math.round(zoom * 100) + '%';
  render();
  drawGrid();
}, { passive: false });

// ---------- KEYBOARD ----------
document.addEventListener('keydown', (e) => {
  // Don't intercept if text input is active
  if (textOverlay.style.display === 'block') return;

  // Space for panning
  if (e.code === 'Space' && !isSpaceDown) {
    e.preventDefault();
    isSpaceDown = true;
    canvasContainer.style.cursor = 'grab';
    return;
  }

  // Shortcuts
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      if (e.shiftKey) { redo(); } else { undo(); }
      return;
    }
    if (e.key === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      copyASCII();
      return;
    }
  }

  // Delete selected
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShape) {
    e.preventDefault();
    saveUndo();
    for (let r = selectedShape.minR; r <= selectedShape.maxR; r++) {
      for (let c = selectedShape.minC; c <= selectedShape.maxC; c++) {
        setCell(r, c, ' ');
      }
    }
    selectedShape = null;
    render();
    clearOverlay();
    return;
  }

  // Tool shortcuts (only when no modifier)
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const toolMap = { v:'select', r:'rect', d:'diamond', l:'line', a:'arrow', t:'text', f:'freehand', e:'eraser' };
    const tool = toolMap[e.key.toLowerCase()];
    if (tool) {
      e.preventDefault();
      setTool(tool);
      return;
    }

    // Escape to deselect or switch to select
    if (e.key === 'Escape') {
      selectedShape = null;
      clearOverlay();
      setTool('select');
    }
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    isSpaceDown = false;
    if (!isPanning) {
      const names = { select:'default', text:'text', eraser:'cell' };
      canvasContainer.style.cursor = names[currentTool] || 'crosshair';
    }
  }
});

// ---------- PANEL BUTTON HANDLERS ----------
// Border styles
document.querySelectorAll('.border-style-btn[data-border]').forEach(btn => {
  btn.addEventListener('click', () => {
    borderStyle = btn.dataset.border;
    document.querySelectorAll('.border-style-btn[data-border]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Line styles
document.querySelectorAll('.border-style-btn[data-linestyle]').forEach(btn => {
  btn.addEventListener('click', () => {
    lineStyle = btn.dataset.linestyle;
    document.querySelectorAll('.border-style-btn[data-linestyle]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Arrow head styles
document.querySelectorAll('.arrow-style-btn[data-arrowhead]').forEach(btn => {
  btn.addEventListener('click', () => {
    arrowHead = btn.dataset.arrowhead;
    document.querySelectorAll('.arrow-style-btn[data-arrowhead]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Freehand char
document.querySelectorAll('.char-btn[data-char]').forEach(btn => {
  btn.addEventListener('click', () => {
    freehandChar = btn.dataset.char;
    document.querySelectorAll('.char-btn[data-char]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Eraser size
document.querySelectorAll('.arrow-style-btn[data-erasersize]').forEach(btn => {
  btn.addEventListener('click', () => {
    eraserSize = parseInt(btn.dataset.erasersize);
    document.querySelectorAll('.arrow-style-btn[data-erasersize]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Diamond style
document.querySelectorAll('.border-style-btn[data-diamondstyle]').forEach(btn => {
  btn.addEventListener('click', () => {
    diamondStyle = btn.dataset.diamondstyle;
    document.querySelectorAll('.border-style-btn[data-diamondstyle]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Toolbar buttons
document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

// Action buttons
document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('redo-btn').addEventListener('click', redo);
document.getElementById('copy-btn').addEventListener('click', copyASCII);
document.getElementById('clear-btn').addEventListener('click', () => {
  saveUndo();
  initGrid();
  render();
  showToast('Canvas cleared', '');
});

// ---------- PREVENT CONTEXT MENU ----------
interactionLayer.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- GLOBAL PREVENT SELECTION ----------
interactionLayer.addEventListener('selectstart', (e) => e.preventDefault());
interactionLayer.addEventListener('dragstart', (e) => e.preventDefault());

// ---------- RUN ----------
init();

})();