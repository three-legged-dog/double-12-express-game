/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/ui.js

/* ---------- Small helpers ---------- */

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pipStr(n) {
  return (typeof n === "number" && Number.isFinite(n)) ? String(n) : "";
}
function cssPxVar(name, fallbackPx = 0) {
  // Reads a CSS custom property (e.g. "--tile-w") from :root and returns its numeric px value.
  // If the variable is missing or not parseable, returns fallbackPx.
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const n = parseFloat(String(raw || "").trim());
    return Number.isFinite(n) ? n : fallbackPx;
  } catch {
    return fallbackPx;
  }
}

/* ---------- Log rendering ---------- */

function renderLog(lines, filterMode = "all", search = "") {
  const q = String(search || "").trim().toLowerCase();
  return (lines || [])
    .filter((ln) => {
      const s = String(ln || "");
      const lo = s.toLowerCase();

      if (q && !lo.includes(q)) return false;

      if (filterMode === "all") return true;
      if (filterMode === "turn") return lo.includes("turn") || lo.includes("->");
      if (filterMode === "plays") return lo.includes("played") || lo.includes("🀄");
      if (filterMode === "draws") return lo.includes("draw") || lo.includes("pass") || lo.includes("🎴") || lo.includes("⏭");
      if (filterMode === "round") return lo.includes("round") || lo.includes("starter") || lo.includes("match");
      if (filterMode === "errors") return lo.includes("error") || lo.includes("⚠");
      return true;
    })
    .join("\n");
}

/* ---------- Domino orientation for display ---------- */
/**
 * Orients tiles left-to-right using startEnd (hub pip).
 * Sets DISPLAY values only (tile.__displayA / tile.__displayB).
 * Mirroring the *image* is handled in renderTileEl() using needsFlip.
 */
function orientTilesForChain(tiles, startEnd) {
  const remaining = Array.isArray(tiles) ? tiles.slice() : [];
  const out = [];

  if (startEnd == null) {
    remaining.forEach(t => {
      t.__displayA = t.a;
      t.__displayB = t.b;
      out.push(t);
    });
    return out;
  }

  let open = startEnd;

  while (remaining.length) {
    const idx = remaining.findIndex(t => t.a === open || t.b === open);

    if (idx === -1) {
      // chain broke; append rest canonically
      remaining.forEach(t => {
        t.__displayA = t.a;
        t.__displayB = t.b;
        out.push(t);
      });
      break;
    }

    const t = remaining.splice(idx, 1)[0];

    if (t.a === open) {
      t.__displayA = t.a; // hub-side left
      t.__displayB = t.b; // open end right
      open = t.b;
    } else {
      t.__displayA = t.b; // hub-side left
      t.__displayB = t.a; // open end right
      open = t.a;
    }

    out.push(t);
  }

  return out;
}

/* ---------- Skin name normalization ---------- */

function normalizeSkinNames(skin) {
  const raw = String(skin || "default").trim() || "default";
  return {
    skinFolder: raw.toLowerCase(), // packs/<folder>/
    skinTag: raw.toUpperCase()     // ..._<TAG>.svg
  };
}

/* ---------- Tile renderer ---------- */

function renderTileEl(tile, opts = {}) {
  const {
    isSelected = false,
    disabled = false, // disabled-for-play (we still allow drag/reorder)
    onClick = null,
    skin = "default",
    pack = null,
    renderMode = "pretty",
  } = opts;

  const btn = document.createElement("button");
  btn.className = "tile tile--pretty";
  btn.type = "button";

  // CRITICAL: used by reorder drop logic
  btn.dataset.tileId = String(tile?.id ?? "");

  if (renderMode === "text") btn.classList.add("tile--text");
  if (isSelected) btn.classList.add("is-selected");
  if (disabled) btn.classList.add("is-disabled");

  // IMPORTANT: don't set btn.disabled=true or drag can break in some browsers
  btn.setAttribute("aria-disabled", disabled ? "true" : "false");

  if (renderMode === "text") {
    const a = (tile.__displayA ?? tile.a);
    const b = (tile.__displayB ?? tile.b);
    btn.textContent = `${pipStr(a)}|${pipStr(b)}`;
  } else {
    const { skinFolder } = normalizeSkinNames(skin);

    const a = (tile.__displayA ?? tile.a);
    const b = (tile.__displayB ?? tile.b);

    // Always fetch file using unordered pair
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    // Mirror image when desired order is hi|lo
    const needsFlip = (a !== b) && (a === hi);

    let src = null;
    if (pack && typeof pack.getTileUrl === "function") {
      src = pack.getTileUrl(lo, hi);
    }

    if (!src) {
      const aa = String(lo).padStart(2, "0");
      const bb = String(hi).padStart(2, "0");
      src = `packs/${skinFolder}/tiles/D12_${aa}_${bb}_${skinFolder.toUpperCase()}.svg`;
    }

    const img = document.createElement("img");
    img.className = "tileImg";
    if (needsFlip) img.classList.add("is-flipped");
    img.alt = `${pipStr(a)}|${pipStr(b)}`;
    img.src = src;
    img.draggable = false; // don't let the image steal drag

    btn.appendChild(img);
  }

  if (typeof onClick === "function") {
    btn.addEventListener("click", onClick);
  }

  return btn;
}

/* ---------- Train renderer ---------- */

function renderTrainTiles(train, startEnd, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "train-tiles";

  const tiles = train?.tiles || [];
  const oriented = orientTilesForChain(tiles, startEnd);

  // If empty, give a real hitbox so click-to-play works before first tile
  if (oriented.length === 0) {
    wrap.classList.add("train-tiles--empty");
    wrap.style.minHeight = "44px";
    wrap.style.padding = "6px 8px";
    wrap.style.border = "1px dashed rgba(255,255,255,0.14)";
    wrap.style.borderRadius = "12px";
    wrap.style.background = "rgba(255,255,255,0.03)";
    wrap.style.cursor = "pointer";
    return wrap;
  }

  // =========================
  // BEGIN: Train auto-shrink (2% per tile, responsive-safe)
  // =========================
  const TRAIN_SHRINK_PER_TILE = 0.02; // 2% per tile
  const TRAIN_MIN_SCALE = 0.55;       // stop shrinking at 55%
  const count = oriented.length;

  const scale =
    Math.max(TRAIN_MIN_SCALE, 1 - (TRAIN_SHRINK_PER_TILE * Math.max(0, count - 1)));

  // Measure the *actual* current tile size (works with clamp()/vw on mobile)
  let baseW = 168;
  let baseH = 84;

  try {
    const ref =
      document.querySelector("#handArea .tile") ||
      document.querySelector(".hand-area .tile") ||
      document.querySelector(".tile");

    if (ref) {
      const r = ref.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) {
        baseW = r.width;
        baseH = r.height;
      }
    }
  } catch {}

  // Train-only sizing vars (prevents shrinking the hand on mobile)
  wrap.style.setProperty("--train-tile-w", `${Math.round(baseW * scale)}px`);
  wrap.style.setProperty("--train-tile-h", `${Math.round(baseH * scale)}px`);
  // =========================
  // END: Train auto-shrink
  // =========================

  oriented.forEach((t) => {
    const el = renderTileEl(t, opts);
    el.classList.add("train-tile");
    wrap.appendChild(el);
  });

  // =========================
  // BEGIN: Auto-follow RIGHT end (always show latest playable end)
  // =========================
  const scrollToRightEnd = () => {
    try {
      if (wrap.scrollWidth > wrap.clientWidth + 2) {
        wrap.scrollLeft = wrap.scrollWidth;
      }
    } catch {}
  };

  // Wait for layout (double RAF is more reliable on mobile)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollToRightEnd();
      // Extra safety for slower devices
      setTimeout(scrollToRightEnd, 0);
    });
  });
  // =========================
  // END: Auto-follow
  // =========================

  return wrap;
}

/* -------End Train renderer ------- */

/* ---------- Main render ---------- */

export function render(state, ctx) {
  // =========================
  // BEGIN: Difficulty UI flags
  // =========================
  const ui = ctx || {};
  const dimUnplayable = ui.dimUnplayable !== false;         // default true
  const highlightPlayable = ui.highlightPlayable !== false; // default true
  // =========================
  // END: Difficulty UI flags
  // =========================

  const {
    engine,
    boardArea,
    handArea,
    statusBox,
    logBox,
    optionsBox,
    selectedTileId,
    logFilterMode,
    logSearch,
    renderMode = "pretty",
    dominoSkin = "default",
    activePack = null,
    handOrder = [],
    onHandReorder = null,
    requestPaint = null,
  } = ui;

  // Basic state flags (NEEDED for both board + hand)
  const isMyTurn = state?.currentPlayer === 0;
  const matchOver = !!state?.matchOver;
  const roundOver = !!state?.roundOver;

  // =========================
  // BEGIN: Legal move visibility control (no hints mode)
  // =========================
  let legalMoves = [];
  let legalTileIds = new Set();
  let legalTargetKeys = new Set();

  try {
    if (isMyTurn && !matchOver && !roundOver && engine?.getLegalMoves) {
      legalMoves = engine.getLegalMoves(0) || [];
      legalTileIds = new Set(legalMoves.map(m => m.tileId));

      // Keys: "MEX" or "P:<id>"
      legalMoves.forEach(m => {
        const t = m?.target;
        if (!t) return;
        if (t.kind === "MEX") legalTargetKeys.add("MEX");
        if (t.kind === "PLAYER") legalTargetKeys.add(`P:${t.ownerId}`);
      });
    }
  } catch {
    legalMoves = [];
    legalTileIds = new Set();
    legalTargetKeys = new Set();
  }
  // =========================
  // END: Legal move visibility control (no hints mode)
  // =========================

  // Status + log
  if (statusBox) statusBox.textContent = state?.log?.slice(-1)?.[0] || "";
  if (logBox) logBox.textContent = renderLog(state?.log || [], logFilterMode, logSearch);

  /* ---------- Board ---------- */
  if (boardArea) {
    boardArea.innerHTML = "";

    // Hub pip = starter double pip on the hub (mex first tile)
    const hubPip = state?.mexicanTrain?.tiles?.[0]?.a ?? null;

    // Click + drop handlers for train tile area
    const attachTrainInteractions = (el, target) => {
      if (!el) return;

      el.addEventListener("click", () => {
        if (typeof ctx?.onPlaySelectedToTarget === "function") {
          ctx.onPlaySelectedToTarget(target);
        }
      });

      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        try { e.dataTransfer.dropEffect = "move"; } catch {}
      });

      el.addEventListener("drop", (e) => {
        e.preventDefault();
        let tileId = "";
        try { tileId = e.dataTransfer.getData("text/plain"); } catch {}
        if (!tileId) return;

        const idNum = Number(tileId);
        if (typeof ctx?.onSelectTile === "function") ctx.onSelectTile(idNum);
        if (typeof ctx?.onPlaySelectedToTarget === "function") ctx.onPlaySelectedToTarget(target);
      });
    };

    // Mexican train
    const mex = state?.mexicanTrain;
    if (mex) {
      const mexRow = document.createElement("div");
      mexRow.className = "train-row";

      if (isMyTurn && !matchOver && !roundOver && dimUnplayable) {
        if (!legalTargetKeys.has("MEX")) mexRow.classList.add("train-row--blocked");
      }

      const mexHdr = document.createElement("div");
      mexHdr.className = "train-hdr";
      mexHdr.innerHTML = `
        <div class="train-title">Express Line ${mex.isOpen ? "(OPEN)" : ""}</div>
        <div class="train-end">+ ${esc(mex.openEnd ?? "")}</div>
      `;
      mexRow.appendChild(mexHdr);

      const mexTilesWrap = renderTrainTiles(mex, hubPip, {
        renderMode,
        skin: dominoSkin,
        pack: activePack
      });

      attachTrainInteractions(mexTilesWrap, { kind: "MEX" });
      mexRow.appendChild(mexTilesWrap);

      const mexDrop = document.createElement("button");
      mexDrop.type = "button";
      mexDrop.className = "dropzone";
      mexDrop.textContent = "+";
      mexDrop.addEventListener("click", () => {
        if (typeof ctx?.onPlaySelectedToTarget === "function") {
          ctx.onPlaySelectedToTarget({ kind: "MEX" });
        }
      });
      mexRow.appendChild(mexDrop);

      boardArea.appendChild(mexRow);
    }

    // Player trains
    (state?.players || []).forEach((p) => {
      const tr = p?.train;
      if (!tr) return;

      const row = document.createElement("div");
      row.className = "train-row";

      if (isMyTurn && !matchOver && !roundOver && dimUnplayable) {
        const key = `P:${p.id}`;
        if (!legalTargetKeys.has(key)) row.classList.add("train-row--blocked");
      }

      const hdr = document.createElement("div");
      hdr.className = "train-hdr";
      const name = esc(p.name || `P${p.id}`);
      hdr.innerHTML = `
        <div class="train-title">${name} — Train ${tr.isOpen ? "(OPEN)" : ""}</div>
        <div class="train-end">+ ${esc(tr.openEnd ?? "")}</div>
      `;
      row.appendChild(hdr);

      const tilesWrap = renderTrainTiles(tr, hubPip, {
        renderMode,
        skin: dominoSkin,
        pack: activePack
      });

      attachTrainInteractions(tilesWrap, { kind: "PLAYER", ownerId: p.id });
      row.appendChild(tilesWrap);

      const dz = document.createElement("button");
      dz.type = "button";
      dz.className = "dropzone";
      dz.textContent = "+";
      dz.addEventListener("click", () => {
        if (typeof ctx?.onPlaySelectedToTarget === "function") {
          ctx.onPlaySelectedToTarget({ kind: "PLAYER", ownerId: p.id });
        }
      });
      row.appendChild(dz);

      boardArea.appendChild(row);
    });
  }

  /* ---------- Hand (reorder + click select) ---------- */
  if (handArea) {
    handArea.innerHTML = "";

    const cur = state?.players?.[0];
    const hand = Array.isArray(cur?.hand) ? [...cur.hand] : [];

    if (!hand.length) {
      const msg = document.createElement("div");
      msg.className = "muted";
      msg.textContent = "(Hand is empty)";
      handArea.appendChild(msg);
    } else {
      // Allow reorder unless the round/match is over
      const canReorder = !matchOver && !roundOver;

      // Apply saved order
      const order = Array.isArray(handOrder) ? handOrder : [];
      if (order.length) {
        const idx = new Map(order.map((id, i) => [String(id), i]));
        hand.sort((a, b) => {
          const ai = idx.has(String(a.id)) ? idx.get(String(a.id)) : 1e9;
          const bi = idx.has(String(b.id)) ? idx.get(String(b.id)) : 1e9;
          if (ai !== bi) return ai - bi;
          return 0;
        });
      }

      const commitOrder = (fromId, toId) => {
        if (!fromId || !toId || fromId === toId) return;

        const handIds = hand.map(t => String(t.id));
        const base = (Array.isArray(handOrder) ? [...handOrder] : [])
          .filter(id => handIds.includes(String(id)));

        handIds.forEach(id => { if (!base.includes(id)) base.push(id); });

        const from = String(fromId);
        const to = String(toId);

        const fromIdx = base.indexOf(from);
        const toIdx = base.indexOf(to);
        if (fromIdx < 0 || toIdx < 0) return;

        base.splice(fromIdx, 1);
        base.splice(toIdx, 0, from);

        if (typeof onHandReorder === "function") onHandReorder(base);
        if (typeof requestPaint === "function") requestPaint();
      };

      hand.forEach((tile) => {
        const isLegal = legalTileIds.size ? legalTileIds.has(tile.id) : true;

        // “disabled” here just means disabled for PLAY actions
        // If highlightPlayable is false (hard/chaos), we DO NOT visually dim illegal tiles.
        const disabledForPlay =
          !isMyTurn ||
          matchOver ||
          roundOver ||
          (highlightPlayable ? !isLegal : false);

        const el = renderTileEl(tile, {
          isSelected: tile.id === selectedTileId,
          disabled: disabledForPlay,
          renderMode,
          skin: dominoSkin,
          pack: activePack,
          onClick: () => {
            if (typeof ctx?.onSelectTile === "function") {
              ctx.onSelectTile(tile.id);
            }
            if (typeof requestPaint === "function") requestPaint();
          }
        });

        // Unified drag data source
        const setDragData = (e) => {
          try {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(tile.id));
          } catch {}
        };

        // Reorder drag/drop (drop onto another tile)
        if (canReorder) {
          el.draggable = true;
          el.classList.add("hand-draggable");

          el.addEventListener("dragstart", (e) => {
            el.classList.add("is-dragging");
            setDragData(e);
          });

          el.addEventListener("dragend", () => {
            el.classList.remove("is-dragging");
          });

          el.addEventListener("dragover", (e) => {
            e.preventDefault();
            try { e.dataTransfer.dropEffect = "move"; } catch {}
          });

          el.addEventListener("drop", (e) => {
            e.preventDefault();
            let fromId = "";
            try { fromId = e.dataTransfer.getData("text/plain"); } catch {}
            const toId = el.dataset.tileId;
            commitOrder(fromId, toId);
          });
        } else {
          // Still allow drag-to-play if you ever re-enable it later
          // (currently your trains handle drop; this keeps the hand tile draggable)
          if (isMyTurn && !matchOver && !roundOver && isLegal) {
            el.draggable = true;
            el.addEventListener("dragstart", (e) => setDragData(e));
          }
        }

        handArea.appendChild(el);
      });
    }
  }

  // Options panel intentionally minimal (HUD shows options)
  if (optionsBox) {
    optionsBox.textContent = "";
  }
}

// END: js/ui.js
