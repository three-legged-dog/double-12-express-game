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
    dominoSkin = "classic"
  }
) {
  /* ============================================================
   * TURN / UX GATING (UI-only locking)
   * ============================================================ */

  const isHumanTurn = state.currentPlayer === 0 && !state.matchOver && !state.roundOver;

  const canContinuePlaysThisTurn =
    !!state.rules?.allowMultipleAfterSatisfy &&
    !!state.doubleSatisfiedThisTurn &&
    !state.pendingDouble;

  const humanPlayLockedByTurn =
    isHumanTurn &&
    !!state.turnHasPlayed &&
    !canContinuePlaysThisTurn &&
    !state.pendingDouble;

  const pendingKey = state.pendingDouble?.trainKey || null;

  const trainKeyForTarget = (target) => {
    if (target.kind === "MEX") return "MEX";
    if (target.kind === "PLAYER") return `P${target.ownerId}`;
    return "";
  };

  /* ============================================================
   * PIP GRID (5x5) — Letters A..Y (row-major)
   *
   * A B C D E
   * F G H I J
   * K L M N O
   * P Q R S T
   * U V W X Y
   * ============================================================ */

  const GRID_5x5 = [
    "A","B","C","D","E",
    "F","G","H","I","J",
    "K","L","M","N","O",
    "P","Q","R","S","T",
    "U","V","W","X","Y",
  ];

  // Your symmetry patterns (single system)
  // 1  = M
  // 2  = C W
  // 3  = C M W
  // 4  = A E U Y
  // 5  = A E M U Y
  // 6  = A E K O U Y
  // 7  = A E K M O U W Y
  // 8  = A E F J P T U Y
  // 9  = A E F J M P T U Y
  // 10 = A C E F J P T U W Y
  // 11 = A C E F J M P T U W Y
  // 12 = A C E F H J P R T U W Y
  const PIP_MAP_5x5 = {
    0: "",
    1: "M",
    2: "CW",
    3: "CMW",
    4: "AEUY",
    5: "AEMUY",
    6: "AEKOUY",
    7: "AEKMOUWY",
    8: "AEFJPTUY",
    9: "AEFJMPTUY",
    10: "ACEFJPTUWY",
    11: "ACEFJMPTUWY",
    12: "ACEFHJPRTUWY",
  };

  const makePipSquare = (value) => {
    const square = document.createElement("div");
    square.className = "domino-square";
    square.dataset.value = String(value);

    const grid = document.createElement("div");
    grid.className = "pip-grid";

    const wantedStr = PIP_MAP_5x5[value] || "";
    const wanted = new Set(wantedStr.split(""));

    for (const letter of GRID_5x5) {
      const cell = document.createElement("div");
      cell.className = `pip-cell pip-${letter}`;
      if (wanted.has(letter)) {
        const pip = document.createElement("span");
        pip.className = "pip";
        cell.appendChild(pip);
      }
      grid.appendChild(cell);
    }

    square.appendChild(grid);
    return square;
  };

  // Placeholder for future SVG skin packs
  const makeSvgDomino = (tile) => {
    const wrap = document.createElement("div");
    wrap.className = "domino-svg";
    wrap.textContent = `${tile.a}|${tile.b} (svg skin not loaded)`;
    return wrap;
  };

  /* ============================================================
   * TILE COMPONENT
   * ============================================================ */

  const renderTileEl = (tile, { selected = false, disabled = false } = {}) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile";
    btn.dataset.tileId = tile.id;
    btn.dataset.double = (tile.a === tile.b) ? "1" : "0";
    btn.disabled = !!disabled;

    if (selected) btn.classList.add("selected");
    if (disabled) btn.classList.add("disabled");

    // TEXT MODE
    if (renderMode === "text") {
      btn.classList.add("tile--text");
      btn.textContent = `${tile.a}|${tile.b}`;
      return btn;
    }

    // PRETTY MODE
    btn.classList.add("tile--pretty");

    if (dominoSkin === "svg") {
      btn.appendChild(makeSvgDomino(tile));
      return btn;
    }

    const domino = document.createElement("div");
    domino.className = "domino";
    domino.setAttribute("aria-label", `Domino ${tile.a}|${tile.b}`);

    const leftHalf = document.createElement("div");
    leftHalf.className = "domino-half";
    leftHalf.appendChild(makePipSquare(tile.a));

    const divider = document.createElement("div");
    divider.className = "domino-divider";

    const rightHalf = document.createElement("div");
    rightHalf.className = "domino-half";
    rightHalf.appendChild(makePipSquare(tile.b));

    domino.appendChild(leftHalf);
    domino.appendChild(divider);
    domino.appendChild(rightHalf);

    btn.appendChild(domino);
    return btn;
  };

  const renderTrainTiles = (tilesArr, { disabled = true } = {}) => {
    if (renderMode === "text") {
      const line = document.createElement("div");
      line.className = "line";
      line.textContent = tilesArr.map(t => `${t.a}|${t.b}`).join("  ");
      return line;
    }

    const wrap = document.createElement("div");
    wrap.className = "train-tiles";

    for (const t of tilesArr) {
      const tileEl = renderTileEl(t, { selected: false, disabled });
      tileEl.classList.add("tile--onboard");
      wrap.appendChild(tileEl);
    }

    return wrap;
  };

  /* ============================================================
   * DROPZONES
   * ============================================================ */

  const makeDropZone = (label, target, end, isOpenFlag, isActive) => {
    const zone = document.createElement("button");
    zone.className = "dropzone";
    zone.type = "button";
    zone.dataset.target = JSON.stringify(target);

    const key = trainKeyForTarget(target);

    const lockedByPending = !!pendingKey && key !== pendingKey;
    const lockedByTurn = !isHumanTurn;
    const lockedByOnePlayRule = humanPlayLockedByTurn;

    const disabled = lockedByTurn || lockedByPending || lockedByOnePlayRule;

    zone.disabled = disabled;
    zone.classList.add(isActive ? "active" : "inactive");
    if (disabled) zone.classList.add("disabled");

    const badges = [];
    if (isOpenFlag) badges.push("OPEN");
    if (lockedByPending) badges.push("LOCKED (double)");
    if (lockedByOnePlayRule) badges.push("LOCKED (turn)");
    if (lockedByTurn) badges.push("LOCKED (not your turn)");

    zone.innerHTML =
      `<strong>${label}</strong> <span class="muted">(end: ${end ?? "?"})</span>` +
      (badges.length ? ` <span class="muted"> • ${badges.join(" • ")}</span>` : "");

    return zone;
  };

  /* ============================================================
   * BOARD
   * ============================================================ */

  boardArea.innerHTML = "";

  // Mexican Train
  {
    const mexZone = makeDropZone(
      "Mexican Train",
      { kind: "MEX" },
      state.mexicanTrain.openEnd,
      true,
      true
    );
    boardArea.appendChild(mexZone);
    boardArea.appendChild(renderTrainTiles(state.mexicanTrain.tiles, { disabled: true }));
  }

  // Player trains
  for (const p of state.players) {
    const label = p.id === 0 ? "Your Train" : `P${p.id} Train`;
    const isActive = state.currentPlayer === p.id;

    const zone = makeDropZone(
      label,
      { kind: "PLAYER", ownerId: p.id },
      p.train.openEnd,
      p.train.isOpen,
      isActive
    );
    boardArea.appendChild(zone);
    boardArea.appendChild(renderTrainTiles(p.train.tiles, { disabled: true }));
  }

  /* ============================================================
   * HAND
   * ============================================================ */

  handArea.innerHTML = "";
  const me = state.players[0];
  const handSelectionLocked = !isHumanTurn || humanPlayLockedByTurn;

  for (const t of me.hand) {
    const el = renderTileEl(t, {
      selected: selectedTileId === t.id,
      disabled: handSelectionLocked
    });
    handArea.appendChild(el);
  }

  /* ============================================================
   * LOG FILTERING
   * ============================================================ */

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

  const matchesSearch = (line) => {
    if (!query) return true;
    return normalize(line).includes(query);
  };

  const filteredLog = state.log.filter(line => matchesMode(line) && matchesSearch(line));

  /* ============================================================
   * STATUS BOX
   * ============================================================ */

  if (statusBox) {
    const nearBottom =
      (statusBox.scrollTop + statusBox.clientHeight) >= (statusBox.scrollHeight - 40);

    statusBox.textContent = [
      `Turn: P${state.currentPlayer}`,
      `Boneyard: ${state.deck.length}`,
      `Render: ${renderMode} (skin: ${dominoSkin})`,
      state.pendingDouble
        ? `Pending Double: ${state.pendingDouble.pip} on ${state.pendingDouble.trainKey}`
        : `Pending Double: none`,
      `Turn flags: played=${!!state.turnHasPlayed} drew=${!!state.turnHasDrawn} satisfiedThisTurn=${!!state.doubleSatisfiedThisTurn}`,
      `Rule: allowMultipleAfterSatisfy=${!!state.rules?.allowMultipleAfterSatisfy}`,
      "",
      "Log:",
      ...filteredLog
    ].join("\n");

    if (nearBottom) statusBox.scrollTop = statusBox.scrollHeight;
  }
}
// END: js/ui.js
