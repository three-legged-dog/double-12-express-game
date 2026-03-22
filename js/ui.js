/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/ui.js

/**
 * UI renderer (DOM-based).
 * Engine remains the source of truth for rules and legality.
 *
 * Supports:
 * - renderMode: "pretty" | "text"
 * - dominoSkin: "classic" | "svg" (future)
 */
const PIP_COLORS = [
  "#111827", // 0 (unused fallback)
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
  const i = Math.max(0, Math.min(12, Number(n) || 0));
  return PIP_COLORS[i] || "#111827";
}

function makeFaceGrid(value) {
  const isHigh = value > 9;
  const face = document.createElement("div");
  face.className = `domino-face ${isHigh ? "grid-3x4" : "grid-3x3"}`;

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

  const indicesMap3x4 = {
    10: [0, 2, 3, 5, 6, 8, 9, 11, 1, 10],
    11: [0, 1, 2, 3, 5, 6, 8, 9, 10, 11, 4],
    12: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  };

  const totalCells = isHigh ? 12 : 9;
  const filled = new Set(isHigh ? (indicesMap3x4[value] || indicesMap3x4[12]) : (indicesMap3x3[value] || []));
  const color = getPipColor(value);

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("div");
    cell.className = "pip-cell";
    if (filled.has(i)) {
      const pip = document.createElement("span");
      pip.className = "pip";
      pip.style.backgroundColor = color;
      cell.appendChild(pip);
    }
    face.appendChild(cell);
  }

  return face;
}

function normalizeSkinFolder(raw) {
  const v = String(raw || "classic").trim().toLowerCase();
  if (v === "classic") return "default";
  return v;
}

function zeroPad2(n) {
  return String(n).padStart(2, "0");
}

function guessPackTagFromFolder(skinFolder) {
  switch (skinFolder) {
    case "irish": return "IRISH";
    case "neon": return "NEON";
    case "default":
    default:
      return "DEFAULT";
  }
}

function buildSvgSources(tile, skinFolder) {
  const a = Number(tile?.a);
  const b = Number(tile?.b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];

  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const aa = zeroPad2(lo);
  const bb = zeroPad2(hi);
  const tag = guessPackTagFromFolder(skinFolder);

  const exts = ["svg", "png", "webp"];
  const out = [];
  for (const ext of exts) {
    out.push(`packs/${skinFolder}/tiles/D12_${aa}_${bb}_${tag}.${ext}`);
    out.push(`packs/${skinFolder}/tiles_optimized/D12_${aa}_${bb}_${tag}.${ext}`);
  }
  return out;
}

function createExternalImageDomino(tile, skinFolder) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tile tile--packart";
  btn.dataset.tileId = tile.id;
  btn.dataset.double = (tile.a === tile.b) ? "1" : "0";

  const img = document.createElement("img");
  img.className = "tile-packart";
  img.alt = `${tile.a}|${tile.b}`;
  img.loading = "eager";
  img.decoding = "async";

  const sources = buildSvgSources(tile, skinFolder);
  let idx = 0;

  const tryNext = () => {
    if (idx >= sources.length) return false;
    img.src = sources[idx++];
    return true;
  };

  img.addEventListener("error", () => {
    if (!tryNext()) {
      img.remove();
      btn.classList.add("tile--packart-missing");
      btn.appendChild(createFallbackDomino(tile));
    }
  });

  btn.appendChild(img);
  if (!tryNext()) {
    btn.appendChild(createFallbackDomino(tile));
  }

  return btn;
}

function createFallbackDomino(tile) {
  const domino = document.createElement("div");
  domino.className = "domino";
  domino.setAttribute("aria-label", `Domino ${tile.a}|${tile.b}`);

  const leftHalf = document.createElement("div");
  leftHalf.className = "domino-half";
  leftHalf.appendChild(makeFaceGrid(tile.a));

  const divider = document.createElement("div");
  divider.className = "domino-divider";

  const rightHalf = document.createElement("div");
  rightHalf.className = "domino-half";
  rightHalf.appendChild(makeFaceGrid(tile.b));

  const label = document.createElement("div");
  label.className = "tile-label";
  label.textContent = `${tile.a}|${tile.b}`;

  domino.appendChild(leftHalf);
  domino.appendChild(divider);
  domino.appendChild(rightHalf);
  domino.appendChild(label);
  return domino;
}

function renderTileEl(tile, {
  selected = false,
  disabled = false,
  dominoSkin = "classic",
  renderMode = "pretty",
  tileClass = "",
} = {}) {
  const skinFolder = normalizeSkinFolder(dominoSkin);

  // TEXT MODE
  if (renderMode === "text") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tile tile--text ${tileClass}`.trim();
    btn.dataset.tileId = tile.id;
    btn.dataset.double = (tile.a === tile.b) ? "1" : "0";
    btn.disabled = !!disabled;
    btn.textContent = `${tile.a}|${tile.b}`;
    if (selected) btn.classList.add("selected");
    if (disabled) btn.classList.add("disabled");
    return btn;
  }

  // PRETTY MODE: external pack art first, fallback to built-in pips.
  let btn = createExternalImageDomino(tile, skinFolder);
  btn.className = `tile ${tileClass}`.trim();
  btn.dataset.tileId = tile.id;
  btn.dataset.double = (tile.a === tile.b) ? "1" : "0";
  btn.disabled = !!disabled;
  if (selected) btn.classList.add("selected");
  if (disabled) btn.classList.add("disabled");
  return btn;
}

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

function renderTrainRow({
  train,
  label,
  ownerId,
  openEnd,
  isOpen,
  isMex = false,
  isCurrent = false,
  pendingDouble = null,
  requiredPip = null,
  renderMode = "pretty",
  dominoSkin = "classic",
  handCount = null,
}) {
  const row = document.createElement("section");
  row.className = "train-row";
  if (isCurrent) row.classList.add("is-current");
  if (isOpen) row.classList.add("is-open");

  const titleRow = document.createElement("div");
  titleRow.className = "train-title-row";

  const title = document.createElement("div");
  title.className = "train-title";
  title.textContent = label;
  titleRow.appendChild(title);

  const badges = document.createElement("div");
  badges.className = "train-badges";

  if (typeof handCount === "number") {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = `🎴 ${handCount}`;
    badges.appendChild(b);
  }

  if (isMex) {
    const b = document.createElement("span");
    b.className = "badge mex";
    b.textContent = "Mexican Train";
    badges.appendChild(b);
  }

  if (isOpen) {
    const b = document.createElement("span");
    b.className = "badge open";
    b.textContent = "🟢 OPEN";
    badges.appendChild(b);
  }

  if (pendingDouble && pendingDouble.trainKey === (isMex ? "MEX" : `P${ownerId}`)) {
    const b = document.createElement("span");
    b.className = "badge pending";
    b.textContent = `Pending ${pendingDouble.pip}`;
    badges.appendChild(b);
  }

  const endBadge = document.createElement("span");
  endBadge.className = "badge";
  endBadge.textContent = `End ${openEnd ?? "?"}`;
  badges.appendChild(endBadge);

  titleRow.appendChild(badges);
  row.appendChild(titleRow);

  const scroller = document.createElement("div");
  scroller.className = "train-scroller";

  const dz = document.createElement("button");
  dz.className = "dropzone active";
  dz.type = "button";
  dz.dataset.target = JSON.stringify(isMex ? { kind: "MEX" } : { kind: "PLAYER", ownerId });
  dz.innerHTML = `<strong>${label}</strong><span class="mini">end: ${openEnd ?? "?"}</span>`;
  scroller.appendChild(dz);

  const orientedTiles = orientTilesForChain(train?.tiles || [], requiredPip);
  for (const tile of orientedTiles) {
    const el = renderTileEl(tile, {
      selected: false,
      disabled: true,
      dominoSkin,
      renderMode,
      tileClass: "tile--onboard",
    });
    scroller.appendChild(el);
  }

  row.appendChild(scroller);
  return row;
}

function renderScoreBarHTML(state) {
  const players = state.players || [];
  return players.map((p) => {
    const isCurrent = state.currentPlayer === p.id;
    const isHuman = p.id === 0;
    const action = p.id === 0
      ? (isCurrent ? "Your turn" : "Waiting")
      : (isCurrent ? "Thinking" : "Waiting");

    return `
      <div class="icon-chip ${isCurrent ? "is-current" : ""} ${isHuman ? "is-human" : ""}">
        <span class="mini">${isHuman ? "You" : `P${p.id}`}</span>
        <span class="sub">${p.score} pts • ${p.hand?.length ?? 0} left</span>
        ${isCurrent ? `<span class="thinking-dot" aria-hidden="true"></span>` : ""}
      </div>
    `;
  }).join("");
}

function scoreboardText(state) {
  const sorted = (state.players || [])
    .map(p => ({ id: p.id, score: p.score, hand: p.hand.length }))
    .sort((a, b) => a.score - b.score);

  const lines = [];
  lines.push(`Round: ${state.round}/${state.roundsTotal}`);
  lines.push(state.matchOver ? "Match: OVER" : (state.roundOver ? "Match: paused (round over)" : "Match: active"));
  lines.push("");
  lines.push("Ranking (lowest wins):");
  sorted.forEach((p, i) => lines.push(`${i + 1}. P${p.id} — ${p.score} pts (hand ${p.hand})`));
  return lines.join("\n");
}

function renderTrainStatusLine(state, p) {
  const train = p?.train;
  const markers = [];
  if (state.currentPlayer === p.id) markers.push("Current");
  if (train?.isOpen) markers.push("🟢 OPEN");
  if (state.pendingDouble?.trainKey === `P${p.id}`) markers.push(`Pending ${state.pendingDouble.pip}`);
  return markers.join(" • ") || "Ready";
}

export function render(state, ctx) {
  const {
    boardArea,
    handArea,
    statusBox,
    optionsBox,
    scoreBox,
    scoreChips,
    boneyardLine,
    selectedTileId,
    logFilterMode = "all",
    logSearch = "",
    renderMode = "pretty",
    dominoSkin = "classic",
    maxPip = 12,
  } = ctx;

  const isHumanTurn = state.currentPlayer === 0 && !state.matchOver && !state.roundOver;
  const requiredPip = state.rules?.startDoubleDescending ? (maxPip - (state.round - 1)) : maxPip;

  if (scoreChips) scoreChips.innerHTML = renderScoreBarHTML(state);
  if (scoreBox) scoreBox.textContent = scoreboardText(state);
  if (boneyardLine) boneyardLine.textContent = `Boneyard: ${state.deck.length}`;

  if (optionsBox) {
    if (state.matchOver) optionsBox.textContent = "Match over.";
    else if (state.roundOver) optionsBox.textContent = "Round over — waiting to start next round.";
    else if (state.currentPlayer !== 0) optionsBox.textContent = `Waiting for opponents… (P${state.currentPlayer})`;
    else if (state.pendingDouble) optionsBox.textContent = `A double must be satisfied on ${state.pendingDouble.trainKey}.`;
    else optionsBox.textContent = isHumanTurn ? "Select a tile, then tap a train." : "Waiting for opponents…";
  }

  // BOARD
  boardArea.innerHTML = "";
  boardArea.classList.add("board-area");

  boardArea.appendChild(renderTrainRow({
    train: state.mexicanTrain,
    label: "Mexican Train",
    ownerId: null,
    openEnd: state.mexicanTrain?.openEnd,
    isOpen: true,
    isMex: true,
    isCurrent: false,
    pendingDouble: state.pendingDouble,
    requiredPip,
    renderMode,
    dominoSkin,
  }));

  for (const p of state.players || []) {
    boardArea.appendChild(renderTrainRow({
      train: p.train,
      label: p.id === 0 ? "Your Train" : `P${p.id} Train`,
      ownerId: p.id,
      openEnd: p.train?.openEnd,
      isOpen: !!p.train?.isOpen,
      isMex: false,
      isCurrent: state.currentPlayer === p.id,
      pendingDouble: state.pendingDouble,
      requiredPip,
      renderMode,
      dominoSkin,
      handCount: Array.isArray(p.hand) ? p.hand.length : null,
    }));
  }

  // HAND
  handArea.innerHTML = "";
  handArea.classList.add("hand-area");
  const me = state.players?.[0];
  const handSelectionLocked = !isHumanTurn || (!!state.turnHasPlayed && !state.pendingDouble && !state.doubleSatisfiedThisTurn);

  for (const t of me?.hand || []) {
    const el = renderTileEl(t, {
      selected: selectedTileId === t.id,
      disabled: handSelectionLocked,
      dominoSkin,
      renderMode,
      tileClass: "tile--hand",
    });
    handArea.appendChild(el);
  }

  // LOG FILTERING
  const normalize = (s) => (s || "").toLowerCase();
  const query = normalize(logSearch).trim();

  const matchesMode = (line) => {
    const s = line || "";
    if (logFilterMode === "all") return true;
    if (logFilterMode === "turn") return s.startsWith("Turn ->");
    if (logFilterMode === "plays") return s.includes(" played ");
    if (logFilterMode === "draws") return s.includes(" drew ") || s.includes(" passes") || s.includes("Pass");
    if (logFilterMode === "round") return s.includes("--- Round") || s.includes("ROUND OVER") || s.includes("MATCH OVER") || s.includes("Starter:");
    if (logFilterMode === "errors") return s.includes("ERROR") || s.includes("FATAL");
    return true;
  };

  const matchesSearch = (line) => !query || normalize(line).includes(query);
  const filteredLog = (state.log || []).filter(line => matchesMode(line) && matchesSearch(line));

  if (statusBox) {
    const nearBottom = (statusBox.scrollTop + statusBox.clientHeight) >= (statusBox.scrollHeight - 40);

    const lines = [
      `Turn: P${state.currentPlayer}`,
      `Boneyard: ${state.deck.length}`,
      `Theme: ${dominoSkin} • Render: ${renderMode}`,
      state.pendingDouble
        ? `Pending Double: ${state.pendingDouble.pip} on ${state.pendingDouble.trainKey}`
        : `Pending Double: none`,
      `Turn flags: played=${!!state.turnHasPlayed} drew=${!!state.turnHasDrawn} satisfiedThisTurn=${!!state.doubleSatisfiedThisTurn}`,
      `Rule: allowMultipleAfterSatisfy=${!!state.rules?.allowMultipleAfterSatisfy}`,
      "",
      "Player trains:",
      ...(state.players || []).map((p) => `P${p.id}: ${renderTrainStatusLine(state, p)}`),
      "",
      "Log:",
      ...filteredLog,
    ];

    statusBox.textContent = lines.join("\n");
    if (nearBottom) statusBox.scrollTop = statusBox.scrollHeight;
  }
}
// END: js/ui.js
