/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/ui.js
// js/ui.js
// DOM renderer for Double-12 Express (Mexican Train-like)

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * Pip colors (0..12). You can tweak these later or replace with B/W mode.
 * These are INLINE fallbacks so pips remain visible even if CSS selectors glitch.
 */
const PIP_COLORS = [
  "#000000", // 0 (unused)
  "#7C3AED", // 1 purple
  "#2563EB", // 2 blue
  "#EF4444", // 3 red
  "#F59E0B", // 4 amber
  "#EC4899", // 5 pink
  "#16A34A", // 6 green
  "#0EA5E9", // 7 sky
  "#7C2D12", // 8 brown
  "#1E3A8A", // 9 navy
  "#0D9488", // 10 teal
  "#334155", // 11 slate
  "#111827"  // 12 near-black
];

function getPipColor(n) {
  if (n == null) return "#111827";
  const i = Math.max(0, Math.min(12, Number(n)));
  return PIP_COLORS[i] || "#111827";
}

/**
 * Create the pip "face" for a number (0..12).
 * Uses a 3x3 layout for 0..9 and 3x4 layout for 10..12.
 * Includes inline grid styles as fallback (keeps pips visible/positioned).
 */
function createFace(n) {
  const isHigh = n > 9;
  const square = document.createElement("div");
  square.className = `pip-container-square ${isHigh ? "grid-3x4" : "grid-3x3"}`;

  // Inline layout fallback (in case CSS selector typo breaks grid)
  square.style.display = "grid";
  square.style.gap = "2px";
  square.style.width = "100%";
  square.style.height = "100%";
  square.style.aspectRatio = "1 / 1";
  square.style.alignItems = "center";
  square.style.justifyItems = "center";
  square.style.gridTemplateColumns = isHigh ? "repeat(3, 1fr)" : "repeat(3, 1fr)";
  square.style.gridTemplateRows = isHigh ? "repeat(4, 1fr)" : "repeat(3, 1fr)";

  const indicesMap3x3 = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
    7: [0, 1, 2, 4, 6, 7, 8],
    8: [0, 1, 2, 3, 5, 6, 7, 8],
    9: [0, 1, 2, 3, 4, 5, 6, 7, 8]
  };

  // 12 cells indexed 0..11 in row-major order for 3x4
  const indicesMap3x4 = {
    10: [0, 2, 3, 5, 6, 8, 9, 11, 1, 10],
    11: [0, 1, 2, 3, 5, 6, 8, 9, 10, 11, 4],
    12: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  };

  const totalCells = isHigh ? 12 : 9;
  const filled = isHigh ? (indicesMap3x4[n] || indicesMap3x4[12]) : (indicesMap3x3[n] || []);

  const color = getPipColor(n);

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("div");
    cell.className = "pip-cell";
    cell.style.display = "flex";
    cell.style.alignItems = "center";
    cell.style.justifyContent = "center";
    cell.style.width = "100%";
    cell.style.height = "100%";

    if (filled.includes(i)) {
      const pip = document.createElement("div");
      pip.className = "pip";
      pip.style.width = "80%";
      pip.style.height = "80%";
      pip.style.borderRadius = "50%";
      pip.style.backgroundColor = color;
      cell.appendChild(pip);
    }
    square.appendChild(cell);
  }

  return square;
}

/**
 * Render a tile as a clickable element (button).
 * NOTE: This renders tile.a|tile.b exactly as provided — orientation logic happens elsewhere.
 */
function renderTileEl(tile, { selected = false, disabled = false } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `tile tile--pretty${selected ? " is-selected" : ""}`;
  btn.disabled = !!disabled;
  btn.dataset.tileId = tile.id;

  const domino = document.createElement("div");
  domino.className = "domino";

  const left = document.createElement("div");
  left.className = "domino-half";

  const divider = document.createElement("div");
  divider.className = "domino-divider";

  const right = document.createElement("div");
  right.className = "domino-half";

  left.appendChild(createFace(tile.a));
  right.appendChild(createFace(tile.b));

  domino.appendChild(left);
  domino.appendChild(divider);
  domino.appendChild(right);

  btn.appendChild(domino);
  return btn;
}

/**
 * Drop zone that main.js uses for click-to-play and drag/drop.
 * MUST exist: main.js expects dataset.target JSON.
 */
function makeDropZone(title, target, openEnd, isOpen, isActive) {
  const zone = el("div", "dropzone");
  zone.dataset.target = JSON.stringify(target);

  const head = el("div", "dropzone__head");
  head.appendChild(el("div", "dropzone__title", title));
  head.appendChild(el("div", "dropzone__meta", `Open: ${openEnd}`));

  const badge = el(
    "div",
    `dropzone__badge ${isOpen ? "is-open" : "is-closed"}`,
    isOpen ? "OPEN" : "CLOSED"
  );
  head.appendChild(badge);

  if (isActive) zone.classList.add("is-active");

  zone.appendChild(head);
  return zone;
}

/**
 * Exported render() used by main.js
 */
export function render(
  state,
  {
    boardArea,
    handArea,
    statusBox,
    selectedTileId,
    logFilterMode = "all",
    logSearch = "",
    renderMode = "pretty",
    dominoSkin = "classic",
    maxPip = 12
  }
) {
  const isHumanTurn = state.currentPlayer === 0 && !state.matchOver && !state.roundOver;

  // BEGIN: requiredPip (train orientation seed)
  const requiredPip = state.rules?.startDoubleDescending
    ? (maxPip - (state.round - 1))
    : maxPip;
  // END: requiredPip (train orientation seed)

  const canContinuePlaysThisTurn =
    !!state.rules?.allowMultipleAfterSatisfy &&
    !!state.doubleSatisfiedThisTurn &&
    !!state.turnHasPlayed &&
    !state.pendingDouble &&
    isHumanTurn;

  /* ---------- STATUS ---------- */
  statusBox.innerHTML = "";
  const hdr = el("div", "status__hdr");
  hdr.appendChild(el("div", "status__title", state.matchOver ? "Match Over" : state.roundOver ? "Round Over" : "In Progress"));
  hdr.appendChild(el("div", "status__turn", state.matchOver ? `Winner: P${state.winnerId}` : state.roundOver ? `Round ${state.round} complete` : `Turn: P${state.currentPlayer}`));
  statusBox.appendChild(hdr);

  if (state.pendingDouble) {
    const pd = el("div", "status__alert", `Pending double must be satisfied on train: ${state.pendingDouble.trainKey}`);
    statusBox.appendChild(pd);
  } else if (canContinuePlaysThisTurn) {
    statusBox.appendChild(el("div", "status__hint", "Double satisfied — you may play again."));
  }

  /* ---------- HAND ---------- */
  handArea.innerHTML = "";
  const handHdr = el("div", "hand__hdr");
  handHdr.appendChild(el("div", "hand__title", "Your Hand"));
  const hint = el("div", "hand__hint");

  if (!isHumanTurn) hint.textContent = "Waiting on AI…";
  else if (state.pendingDouble) hint.textContent = "You must satisfy the pending double.";
  else if (canContinuePlaysThisTurn) hint.textContent = "You can keep playing this turn.";
  else hint.textContent = "Select a tile, then click a train to play it.";

  handHdr.appendChild(hint);
  handArea.appendChild(handHdr);

  const handWrap = el("div", "hand__tiles");
  for (const t of state.players[0].hand) {
    const tileEl = renderTileEl(t, {
      selected: t.id === selectedTileId,
      disabled: !isHumanTurn
    });
    handWrap.appendChild(tileEl);
  }
  handArea.appendChild(handWrap);

  /* ---------- BOARD ---------- */
  boardArea.innerHTML = "";

  function renderTrainTiles(tilesArr, { disabled = true, startEnd = null } = {}) {
    if (renderMode === "text") {
      const line = document.createElement("div");
      line.className = "line";
      line.textContent = tilesArr.map(t => `${t.a}|${t.b}`).join("  ");
      return line;
    }

    // Flip tiles for DISPLAY so the chain always matches left-to-right.
    function orientTilesForChain(arr, initialEnd) {
      if (initialEnd == null) return arr;

      let currentEnd = initialEnd;
      const out = [];

      for (const t of arr) {
        if (t.a !== currentEnd && t.b !== currentEnd) {
          out.push(t);
          continue;
        }
        const oriented = (t.a === currentEnd) ? t : { ...t, a: t.b, b: t.a };
        out.push(oriented);
        currentEnd = oriented.b;
      }
      return out;
    }

    const orientedTiles = orientTilesForChain(tilesArr, startEnd);

    const wrap = document.createElement("div");
    wrap.className = "train-tiles";
    for (const t of orientedTiles) {
      const tileEl = renderTileEl(t, { selected: false, disabled });
      tileEl.classList.add("tile--onboard");
      wrap.appendChild(tileEl);
    }
    return wrap;
  }

  // Mexican Train (tiles then zone)
  boardArea.appendChild(renderTrainTiles(state.mexicanTrain.tiles, { disabled: true, startEnd: requiredPip }));
  boardArea.appendChild(makeDropZone("Mexican Train", { kind: "MEX" }, state.mexicanTrain.openEnd, true, true));

  // Player trains
  for (const p of state.players) {
    const label = p.id === 0 ? "Your Train" : `P${p.id} Train`;
    const isActive = state.currentPlayer === p.id;

    boardArea.appendChild(renderTrainTiles(p.train.tiles, { disabled: true, startEnd: requiredPip }));
    boardArea.appendChild(makeDropZone(label, { kind: "PLAYER", ownerId: p.id }, p.train.openEnd, p.train.isOpen, isActive));
  }
}
// END: js/ui.js
