/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/ui.js

/* ---------- Shared helpers ---------- */

const PIP_COLORS = {
  0: "#94a3b8",
  1: "#e879f9",
  2: "#fbbf24",
  3: "#22c55e",
  4: "#38bdf8",
  5: "#fb7185",
  6: "#a3e635",
  7: "#f97316",
  8: "#60a5fa",
  9: "#34d399",
  10: "#facc15",
  11: "#c084fc",
  12: "#2dd4bf"
};

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/* ---------- Render helpers ---------- */

function renderLog(log, filterMode, search) {
  const q = (search || "").trim().toLowerCase();
  const lines = (log || []).filter((line) => {
    const s = String(line || "");
    if (filterMode === "ai") {
      if (!/P\d/.test(s) || s.startsWith("P0")) return false;
    } else if (filterMode === "p0") {
      if (!s.startsWith("P0")) return false;
    }
    if (q) return s.toLowerCase().includes(q);
    return true;
  });

  // show last ~200 to keep UI snappy
  const tail = lines.slice(-200);
  return tail.join("\n");
}

function computeRequiredPip(state) {
  const rules = state?.rules || {};
  const maxPip = state?.maxPip ?? 12;
  const round = state?.round ?? 1;
  return rules.startDoubleDescending ? (maxPip - (round - 1)) : maxPip;
}

/**
 * Given a chain of tiles and the starting required end (the round's required pip),
 * compute the *display order* for each tile so it reads left-to-right along the chain.
 *
 * We store as __displayA/__displayB so the renderer can show the correct side on the left/right.
 */
// BEGIN: orientTilesForChain (robust + syntax-safe)
function orientTilesForChain(tiles, startEnd) {
  const out = [];
  let end = startEnd;

  for (const t of (tiles || [])) {
    // If we don't know required end yet, just emit natural order
    if (end == null) {
      out.push({ ...t, __displayA: t.a, __displayB: t.b });
      end = t.b;
      continue;
    }

    if (t.a === end) {
      // a touches previous end, so show a|b
      out.push({ ...t, __displayA: t.a, __displayB: t.b });
      end = t.b;
    } else if (t.b === end) {
      // b touches previous end, so show b|a (flip)
      out.push({ ...t, __displayA: t.b, __displayB: t.a });
      end = t.a;
    } else {
      // Engine/UI mismatch safety: emit natural order, keep chain moving
      out.push({ ...t, __displayA: t.a, __displayB: t.b });
      end = t.b;
    }
  }

  return out;
}
// END: orientTilesForChain

// BEGIN: createPipDomino (fills the .tile button nicely)
function createPipDomino(tile) {
  const aDisp = tile.__displayA ?? tile.a;
  const bDisp = tile.__displayB ?? tile.b;

  const wrap = document.createElement("div");
  wrap.className = "domino domino--pips";

  // IMPORTANT: Fill the parent .tile button
  wrap.style.width = "100%";
  wrap.style.height = "100%";
  wrap.style.display = "flex";
  wrap.style.gap = "0";
  wrap.style.padding = "0";
  wrap.style.borderRadius = "10px";
  wrap.style.overflow = "hidden";
  wrap.style.border = "1px solid rgba(255,255,255,0.18)";
  wrap.style.background = "rgba(255,255,255,0.06)";

  const makeHalf = (val, isLeft) => {
    const half = document.createElement("div");
    half.className = "domino-half";
    half.style.flex = "1";
    half.style.height = "100%";
    half.style.display = "flex";
    half.style.alignItems = "center";
    half.style.justifyContent = "center";

    // divider line between halves
    if (isLeft) {
      half.style.borderRight = "1px solid rgba(255,255,255,0.16)";
    }

    const badge = document.createElement("div");
    badge.className = "pip-badge";

    const c = PIP_COLORS[val] || "#94a3b8";
    badge.textContent = String(val);

    badge.style.width = "70%";
    badge.style.maxWidth = "34px";
    badge.style.aspectRatio = "1 / 1";
    badge.style.borderRadius = "999px";
    badge.style.display = "flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.fontWeight = "800";
    badge.style.fontSize = "14px";
    badge.style.color = "rgba(255,255,255,0.92)";
    badge.style.background = c;
    badge.style.boxShadow = "0 6px 16px rgba(0,0,0,0.25)";

    half.appendChild(badge);
    return half;
  };

  wrap.appendChild(makeHalf(aDisp, true));
  wrap.appendChild(makeHalf(bDisp, false));
  return wrap;
}
// END: createPipDomino

// =========================
// BEGIN: Skin name normalization
// =========================
function normalizeSkinNames(rawSkin) {
  const skin = String(rawSkin || "default").trim();

  return {
    folder: skin.toLowerCase(),   // packs/<folder>/
    tag: skin.toUpperCase()       // _<TAG>.svg
  };
}
// =========================
// END: Skin name normalization
// =========================


// =========================
// BEGIN: renderTileEl (SVG packs for ALL skins, normalized casing)
// =========================
function renderTileEl(tile, opts = {}) {
  const {
    isSelected = false,
    disabled = false,
    onClick = null,
    skin = "default",
    renderMode = "pretty",
  } = opts;

  const btn = document.createElement("button");
  btn.className = "tile tile--pretty";
  if (renderMode === "text") btn.classList.add("tile--text");
  if (isSelected) btn.classList.add("is-selected");
  if (disabled) btn.classList.add("is-disabled");
  btn.disabled = !!disabled;
  btn.setAttribute("aria-disabled", disabled ? "true" : "false");

  btn.dataset.tileId = tile.id;

  const aDisp = tile.__displayA ?? tile.a;
  const bDisp = tile.__displayB ?? tile.b;

  // TEXT mode
  if (renderMode === "text") {
    btn.textContent = `${aDisp}|${bDisp}`;
    if (typeof onClick === "function" && !disabled) btn.addEventListener("click", onClick);
    return btn;
  }

  // ----- Normalize casing once -----
  const rawSkin = String(skin || "default").trim() || "default";
  const skinFolder = rawSkin.toLowerCase(); // packs/<folder>/
  const skinTag = rawSkin.toUpperCase();    // ..._<TAG>.svg

  // Always load canonical AA<=BB file
  const AA = String(Math.min(aDisp, bDisp)).padStart(2, "0");
  const BB = String(Math.max(aDisp, bDisp)).padStart(2, "0");

  // Flip visually if display order is reversed relative to canonical
  const needFlip = !(aDisp === Number(AA) && bDisp === Number(BB));
  if (needFlip) btn.classList.add("tile--flip");
  else btn.classList.remove("tile--flip");

  const svgWrap = document.createElement("div");
  svgWrap.className = "domino domino--svg";

  const img = document.createElement("img");
  img.className = "domino-svg";
  img.alt = `Domino ${aDisp}|${bDisp}`;
  img.loading = "lazy";
  img.decoding = "async";

  img.src = `packs/${skinFolder}/tiles/D12_${AA}_${BB}_${skinTag}.svg`;

  img.addEventListener("error", () => {
    console.warn(
      `[Domino SVG missing] packs/${skinFolder}/tiles/D12_${AA}_${BB}_${skinTag}.svg`
    );

    // Optional fallback (keep during development)
    btn.classList.remove("tile--flip");
    btn.innerHTML = "";
    btn.appendChild(createPipDomino(tile));
  });

  svgWrap.appendChild(img);
  btn.appendChild(svgWrap);

  if (typeof onClick === "function" && !disabled) btn.addEventListener("click", onClick);
  return btn;
}
// =========================
// END: renderTileEl
// =========================


function renderTrainTiles(train, startEnd, opts) {
  const tiles = train?.tiles || [];
  const oriented = orientTilesForChain(tiles, startEnd);

  const wrap = document.createElement("div");
  wrap.className = "train-tiles";

  oriented.forEach((t) => {
    wrap.appendChild(renderTileEl(t, opts));
  });

  return wrap;
}

export function render(state, ui) {
  const {
    boardArea,
    handArea,
    statusBox,
    logBox,
    optionsBox,
    selectedTileId,
    logFilterMode,
    logSearch,
    renderMode = "pretty",
    dominoSkin = "default"
  } = ui;

  // Status + log
  if (statusBox) statusBox.textContent = state?.log?.slice(-1)?.[0] || "";
  if (logBox) logBox.textContent = renderLog(state?.log || [], logFilterMode, logSearch);

  // Board
  if (boardArea) {
    boardArea.innerHTML = "";

    const requiredPip = computeRequiredPip(state);

    // Mexican train first
    const mex = state.mexicanTrain;

    const mexRow = document.createElement("div");
    mexRow.className = "train-row";

    const mexHdr = document.createElement("div");
    mexHdr.className = "train-hdr";
    // Express Line first
        mexHdr.innerHTML = `
      <div class="train-title">Express Line ${mex.isOpen ? "(OPEN)" : ""}</div>
      <div class="train-end">+ ${esc(mex.openEnd ?? "")}</div>
    `;

    mexRow.appendChild(mexHdr);
    mexRow.appendChild(renderTrainTiles(mex, requiredPip, {
      renderMode,
      skin: dominoSkin
    }));

    // Dropzone
    const mexDrop = document.createElement("div");
    mexDrop.className = "dropzone";
    mexDrop.dataset.target = JSON.stringify({ kind: "MEX" });
    mexDrop.textContent = "+";
    mexRow.appendChild(mexDrop);

    boardArea.appendChild(mexRow);

    // Player trains
    state.players.forEach((p) => {
      const tr = p.train;

      const row = document.createElement("div");
      row.className = "train-row";

      const hdr = document.createElement("div");
      hdr.className = "train-hdr";

      const name = esc(p.name || `P${p.id}`);
      hdr.innerHTML = `
        <div class="train-title">${name} — Train ${tr.isOpen ? "(OPEN)" : ""}</div>
        <div class="train-end">+ ${esc(tr.openEnd ?? "")}</div>
      `;

      row.appendChild(hdr);
      row.appendChild(renderTrainTiles(tr, requiredPip, {
        renderMode,
        skin: dominoSkin
      }));

      const dz = document.createElement("div");
      dz.className = "dropzone";
      dz.dataset.target = JSON.stringify({ kind: "PLAYER", ownerId: p.id });
      dz.textContent = "+";
      row.appendChild(dz);

      boardArea.appendChild(row);
    });
  }

  // Hand
  if (handArea) {
    const cur = state.players?.[0];
    const moves = ui?.selectedTileId ? null : null;

    const handWrap = document.createElement("div");
    handWrap.className = "hand-area";

    const hdr = document.createElement("div");
    hdr.className = "hand__hdr";
    hdr.innerHTML = `<div class="hand-title">Your Hand</div>`;

    const tilesWrap = document.createElement("div");
    tilesWrap.className = "hand__tiles";

    // Determine legal tile ids for disabled UI
// Determine legal tile ids for specific logic
    const legalMoves = (state.currentPlayer === 0 && !state.matchOver && !state.roundOver)
      ? (ui?.engine?.getLegalMoves?.(0) || [])
      : [];
    
    const legalTileIds = new Set(legalMoves.map(m => m.tileId));

    (cur?.hand || []).forEach((tile) => {
      // A tile is visually "disabled" (dimmed) if it's not in the legal set
      // BUT we only apply this logic if it is actually the player's turn.
      const isMyTurn = state.currentPlayer === 0;
      const isLegal = legalTileIds.has(tile.id);
      
      const disabled =
        !isMyTurn ||
        state.matchOver ||
        state.roundOver ||
        (!isLegal); // Dim if not legal

      const el = renderTileEl(tile, {
        isSelected: tile.id === selectedTileId,
        disabled, // This applies the CSS class .is-disabled
        renderMode,
        skin: dominoSkin
      });

      tilesWrap.appendChild(el);
    });

    handWrap.appendChild(hdr);
    handWrap.appendChild(tilesWrap);
    handArea.innerHTML = "";
    handArea.appendChild(handWrap);
  }

  // Options text
  if (optionsBox) {
    // main.js owns this string, but keep empty-safe
    optionsBox.textContent = optionsBox.textContent || "";
  }
}

// END: js/ui.js
