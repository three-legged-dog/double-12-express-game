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
 * Includes inline grid styles as fallback (keeps pips visible/positioned
 * even if CSS doesn't load).
 */
function createFace(n) {
  const num = Number(n);
  const face = document.createElement("div");

  // Choose grid for 10..12
  const isHigh = num >= 10;
  face.className = `pip-container-square ${isHigh ? "grid-3x4" : "grid-3x3"}`;

  // Inline fallback styling in case CSS isn't loaded
  face.style.display = "grid";
  face.style.gap = "2px";
  face.style.height = "100%";
  face.style.width = "auto";
  face.style.aspectRatio = "1 / 1";

  if (!isHigh) {
    face.style.gridTemplateColumns = "repeat(3, 1fr)";
    face.style.gridTemplateRows = "repeat(3, 1fr)";
  } else {
    face.style.gridTemplateColumns = "repeat(3, 1fr)";
    face.style.gridTemplateRows = "repeat(4, 1fr)";
  }

  // Build cell map
  const cells = [];
  const total = isHigh ? 12 : 9;
  for (let i = 0; i < total; i++) cells.push(false);

  // Pip placement patterns
  // 3x3 indices:
  // 0 1 2
  // 3 4 5
  // 6 7 8
  const on = (idx) => { if (idx >= 0 && idx < cells.length) cells[idx] = true; };

  // For 3x4 indices:
  //  0  1  2
  //  3  4  5
  //  6  7  8
  //  9 10 11
  // We'll place pips in a "domino-ish" pattern.
  function placePips3x3(v) {
    if (v === 0) return;
    if (v === 1) on(4);
    if (v === 2) { on(0); on(8); }
    if (v === 3) { on(0); on(4); on(8); }
    if (v === 4) { on(0); on(2); on(6); on(8); }
    if (v === 5) { on(0); on(2); on(4); on(6); on(8); }
    if (v === 6) { on(0); on(2); on(3); on(5); on(6); on(8); }
    if (v === 7) { on(0); on(2); on(3); on(4); on(5); on(6); on(8); }
    if (v === 8) { on(0); on(1); on(2); on(3); on(5); on(6); on(7); on(8); }
    if (v === 9) { on(0); on(1); on(2); on(3); on(4); on(5); on(6); on(7); on(8); }
  }

  function placePips3x4(v) {
    // v = 10..12
    // We fill from the classic "12" pip layout; these are decent defaults.
    // 10: 5 + 5
    // 11: 6 + 5
    // 12: 6 + 6
    // Left column indices: 0,3,6,9  | Right: 2,5,8,11 | Center-ish: 1,4,7,10
    const left = [0, 3, 6, 9];
    const right = [2, 5, 8, 11];
    const mid = [1, 4, 7, 10];

    if (v === 10) {
      // five-ish on each side
      on(left[0]); on(left[2]); on(left[3]);
      on(right[0]); on(right[2]); on(right[3]);
      on(mid[1]); on(mid[2]); // add two centers to make 10
      on(mid[0]); // total 9, add one more:
      on(right[1]);
      return;
    }

    if (v === 11) {
      // basically 12 minus one
      for (const i of left) on(i);
      for (const i of right) on(i);
      on(mid[0]); on(mid[1]); on(mid[2]); // 11 (3 mids)
      return;
    }

    if (v === 12) {
      for (const i of left) on(i);
      for (const i of right) on(i);
      for (const i of mid) on(i); // 12 total
      return;
    }
  }

  if (!isHigh) placePips3x3(num);
  else placePips3x4(num);

  // Render cells
  for (let i = 0; i < cells.length; i++) {
    const cell = document.createElement("div");
    cell.className = "pip-cell";
    cell.style.display = "flex";
    cell.style.alignItems = "center";
    cell.style.justifyContent = "center";

    if (cells[i]) {
      const pip = document.createElement("div");
      pip.className = "pip";
      pip.style.width = "80%";
      pip.style.height = "80%";
      pip.style.borderRadius = "50%";
      pip.style.background = getPipColor(num);
      pip.style.boxShadow = "inset 1px 1px 1px rgba(255,255,255,0.40)";
      cell.appendChild(pip);
    }

    face.appendChild(cell);
  }

  return face;
}

function renderTileEl(tile, { selected = false, disabled = false, dominoSkin = "default" } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `tile tile--pretty${selected ? " is-selected" : ""}`;
  btn.disabled = !!disabled;
  btn.dataset.tileId = tile.id;

  // "default" renders our pip-based DOM faces.
  // Any other skin attempts to render an SVG asset from /packs/<skin>/tiles/
  const skin = (dominoSkin || "default").toLowerCase();

  if (skin !== "default" && skin !== "classic") {
    const svgWrap = document.createElement("div");
    svgWrap.className = "domino domino--svg";

    const img = document.createElement("img");
    img.className = "domino-svg";
    img.alt = `Domino ${tile.a}|${tile.b} (${skin})`;

    const AA = String(tile.a).padStart(2, "0");
    const BB = String(tile.b).padStart(2, "0");
    img.src = `packs/${skin}/tiles/D12_${AA}_${BB}_${skin}.svg`;

    // If the asset is missing, fall back to pip rendering so the game never breaks.
    img.addEventListener("error", () => {
      const fallback = createPipDomino(tile);
      btn.innerHTML = "";
      btn.appendChild(fallback);
    }, { once: true });

    svgWrap.appendChild(img);
    btn.appendChild(svgWrap);
    return btn;
  }

  // Fallback: pip-based domino
  btn.appendChild(createPipDomino(tile));
  return btn;
}

function createPipDomino(tile) {
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

  return domino;
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
    logBox = null,
    optionsBox = null,
    selectedTileId,
    logFilterMode = "all",
    logSearch = "",
    renderMode = "pretty",
    dominoSkin = "classic",
    maxPip = 12
  }
)
 {
  const isHumanTurn = state.currentPlayer === 0 && !state.matchOver && !state.roundOver;

  // BEGIN: requiredPip (train orientation seed)
  const requiredPip = state.rules?.startDoubleDescending
    ? (
        Math.max(0, Math.min(maxPip, state.rules?.maxPip ?? maxPip))
      )
    : 12;
  // END: requiredPip

  const canContinuePlaysThisTurn =
    state.currentPlayer === 0 &&
    !state.matchOver &&
    !state.roundOver &&
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
      disabled: !isHumanTurn,
      dominoSkin
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
      const tileEl = renderTileEl(t, { selected: false, disabled, dominoSkin });
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
