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
// =========================
// BEGIN: Touch reorder (mobile-friendly press & hold)
// =========================
const TOUCH_REORDER_HOLD_MS = 160;        // how long to hold before reorder starts
const TOUCH_REORDER_CANCEL_PX = 10;       // move this far before hold completes => cancel reorder
let __lastTouchReorderAt = 0;

function shouldSuppressClickAfterReorder(){
  try { return (performance.now() - __lastTouchReorderAt) < 260; } catch { return false; }
}
// =========================
// END: Touch reorder

// =========================
// BEGIN: Hand flip (double-tap / double-click)
// =========================
const HAND_FLIP_TAP_WINDOW_MS = 320; // ms between taps on same tile
const HAND_FLIP_ANIM_MS = 260;
let __lastHandTapAt = 0;
let __lastHandTapTileId = "";
let __lastFlippedHandTileId = "";
let __lastFlippedHandTileAt = 0;

function markHandTileFlipAnim(tileId){
  __lastFlippedHandTileId = String(tileId ?? "");
  __lastFlippedHandTileAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
}

function isHandTileFlipAnimating(tileId){
  const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  return (
    String(tileId ?? "") &&
    String(tileId ?? "") === __lastFlippedHandTileId &&
    (now - __lastFlippedHandTileAt) <= HAND_FLIP_ANIM_MS
  );
}

function shouldTreatAsFlipTap(tileId){
  const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  const id = String(tileId ?? "");

  const isSecond =
    id &&
    (id === __lastHandTapTileId) &&
    ((now - __lastHandTapAt) <= HAND_FLIP_TAP_WINDOW_MS);

  if (isSecond){
    __lastHandTapAt = 0;
    __lastHandTapTileId = "";
    return true;
  }

  __lastHandTapAt = now;
  __lastHandTapTileId = id;
  return false;
}
// =========================
// END: Hand flip (double-tap / double-click)
// =========================


// =========================



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
      const packTag = (pack && pack.packId) ? pack.packId : skinFolder.toUpperCase();
      const ext = (pack && pack.dominoSet && pack.dominoSet.fileExt) ? String(pack.dominoSet.fileExt).toLowerCase() : "svg";
      src = `packs/${skinFolder}/tiles/D12_${aa}_${bb}_${packTag}.${ext}`;
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
  const anim = (opts && opts.anim) ? opts.anim : null;
  const trainKey = String((opts && opts.trainKey) || "");
  const scrollState = (opts && opts.scrollState) || null;
  const wrap = document.createElement("div");
  wrap.className = "train-tiles";
  if (trainKey) wrap.dataset.trainKey = trainKey;

  // =========================
  // BEGIN: Train-only horizontal scrolling (prevents whole-page sideways scroll)
  // =========================
  wrap.style.maxWidth = "100%";
  wrap.style.minWidth = "0";
  wrap.style.overflowX = "auto";
  wrap.style.overflowY = "hidden";
  wrap.style.WebkitOverflowScrolling = "touch";
  wrap.style.display = "flex";
  wrap.style.flexWrap = "nowrap";
  wrap.style.gap = "8px";
  wrap.style.boxSizing = "border-box";
  wrap.style.overscrollBehaviorX = "contain";
  // =========================
  // END: Train-only horizontal scrolling
  // =========================

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
      // BEGIN: Train auto-shrink (mobile starts smaller + shrinks faster)
      // =========================
      const isMobileTrain = window.matchMedia("(max-width: 900px)").matches;

      // Desktop keeps the current feel.
      // Mobile starts smaller and shrinks faster.
      const TRAIN_BASE_SCALE = isMobileTrain ? 0.6 : 1.00;
      const TRAIN_SHRINK_START = isMobileTrain ? 2 : 4;
      const TRAIN_SHRINK_PER_TILE = isMobileTrain ? 0.09 : 0.035;
      const TRAIN_MIN_SCALE = isMobileTrain ? 0.45 : 0.50;

      const count = oriented.length;
      const shrinkTiles = Math.max(0, count - TRAIN_SHRINK_START);

      // Base down a bit on mobile, then shrink harder as the train grows.
      const rawScale = TRAIN_BASE_SCALE - (TRAIN_SHRINK_PER_TILE * shrinkTiles);
      const scale = Math.max(TRAIN_MIN_SCALE, rawScale);

      // Use the root CSS tile vars as the baseline so scaling is stable.
      const baseW = cssPxVar("--tile-w", 168);
      const baseH = cssPxVar("--tile-h", 84);

      const minW = Math.round(baseW * TRAIN_MIN_SCALE);
      const minH = Math.round(baseH * TRAIN_MIN_SCALE);

      const w = Math.round(Math.max(minW, baseW * scale));
      const h = Math.round(Math.max(minH, baseH * scale));

      wrap.style.setProperty("--train-tile-w", `${w}px`);
      wrap.style.setProperty("--train-tile-h", `${h}px`);
      // =========================
      // END: Train auto-shrink
      // =========================

  oriented.forEach((t) => {
    const el = renderTileEl(t, opts);
    el.classList.add("train-tile");
    // BEGIN: Micro-anim (play onto train)
    if (anim && anim.type === "play" && String(anim.tileId) === String(t.id) && (Date.now() - (anim.at || 0) < 1200)) {
      el.classList.add("anim-play");
    }
    // END: Micro-anim (play onto train)
    wrap.appendChild(el);
  });

        const currentTileCount = Array.isArray(oriented) ? oriented.length : 0;
        const prevTileCount = Number((scrollState && trainKey && scrollState.get(`${trainKey}:count`)) || 0);
        const prevRightOffset = Number((scrollState && trainKey && scrollState.get(`${trainKey}:right`)) || 0);
        const trainGrew = currentTileCount > prevTileCount;

        const justPlayedThisTrain = !!(
          anim &&
          anim.type === "play" &&
          oriented.some(t => String(t.id) === String(anim.tileId))
        );

        const restoreScroll = () => {};

          if (scrollState && trainKey) {
          wrap.addEventListener("scroll", () => {
            try {
              const left = Number(wrap.scrollLeft || 0);
              const right = Math.max(0, Number((wrap.scrollWidth || 0) - (wrap.clientWidth || 0) - left));
              scrollState.set(`${trainKey}:right`, right);
              scrollState.set(`${trainKey}:count`, currentTileCount);
            } catch {}
          }, { passive: true });

          // Keep newly rendered trains logically right-anchored.
          scrollState.set(`${trainKey}:right`, 0);
          scrollState.set(`${trainKey}:count`, currentTileCount);
        }
        wrap.style.visibility = "";

  return wrap;
}
/* -------End Train renderer ------- */

/* ---------- Main render ---------- */

export function render(state, ctx) {
  // =========================
  // BEGIN: Difficulty UI flags
  // =========================
  const ui = ctx || {};
  
  const playerActionMap = ui.playerActionMap || {};
  const playerLastMoveMap = ui.playerLastMoveMap || {};
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
    const scrollState = (ui && ui.boardTrainScroll instanceof Map) ? ui.boardTrainScroll : null;
    // Do NOT snapshot train scroll positions here.
    // The old DOM can report transient left=0 values during rebuilds,
    // which poisons the saved scroll state and makes trains jump left.

    // Build into a fragment so the DOM doesn't temporarily collapse to 0 height
    // (which can cause the page scroll to clamp to top on re-render).
    const frag = document.createDocumentFragment();

    // Hub pip = starter double pip on the hub (mex first tile)
    const hubPip = state?.mexicanTrain?.tiles?.[0]?.a ?? null;

    // Click + drop handlers for train tile area
        const attachTrainInteractions = (el, target) => {
      if (!el) return;

      const now = () => {
        try { return performance.now(); } catch { return Date.now(); }
      };

      // Suppress click right after a swipe gesture (mobile WebViews love to double-fire)
      let ignoreClickUntil = 0;

      // Click / tap-to-play
      el.addEventListener("click", () => {
        if (now() < ignoreClickUntil) return;
        if (typeof ctx?.onPlaySelectedToTarget === "function") {
          ctx.onPlaySelectedToTarget(target);
        }
      });

      // Touch/pen: swipe horizontally to scroll trains, tap to play
      // Keep vertical page scroll natural.
      try { el.style.touchAction = "pan-y"; } catch {}

      let drag = null;
      const START_PX = 8; // how far before we decide "gesture"

      el.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;

        drag = {
          id: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startLeft: el.scrollLeft,
          active: false,
          moved: false,
        };
      }, { passive: true });

      el.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;

        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;

        // Decide if we should take over horizontal scrolling
        if (!drag.active) {
          if (Math.abs(dx) < START_PX) return;              // not enough movement yet
          if (Math.abs(dx) <= Math.abs(dy)) return;         // user is scrolling vertically
          if (el.scrollWidth <= el.clientWidth + 2) return; // nothing to scroll anyway
          drag.active = true;
        }

        drag.moved = true;

        // Manual horizontal scroll
        el.scrollLeft = drag.startLeft - dx;

        // Prevent follow-up "click"
        ignoreClickUntil = now() + 450;

        // Only prevent default once we’ve committed to horizontal scrolling
        e.preventDefault();
      }, { passive: false });

      el.addEventListener("pointerup", (e) => {
        if (!drag || e.pointerId !== drag.id) return;

        const wasTap = !drag.moved;
        drag = null;

        ignoreClickUntil = now() + 450;

        if (wasTap && typeof ctx?.onPlaySelectedToTarget === "function") {
          ctx.onPlaySelectedToTarget(target);
        }
      }, { passive: true });

      el.addEventListener("pointercancel", () => {
        drag = null;
      }, { passive: true });

      // Drag/drop for desktop still works
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

    // Double 12 Express row first
    const mexRow = document.createElement("div");
    mexRow.className = "train-row train-row--mex";
    // BEGIN: MEX row dimming (blocked when not a legal target)
    if (isMyTurn && !matchOver && !roundOver && dimUnplayable) {
      if (!legalTargetKeys.has("MEX")) mexRow.classList.add("train-row--blocked");
    }
    // END: MEX row dimming (blocked when not a legal target)


    // BEGIN: Active turn row highlight (Express Line = only on human turn)
    if (state?.currentPlayer === 0) mexRow.classList.add("train-row--active");
    else mexRow.classList.remove("train-row--active");
    // END: Active turn row highlight (Express Line)

    const mexHdr = document.createElement("div");
    mexHdr.className = "train-hdr train-hdr--top";
    mexHdr.innerHTML = `
      <div class="train-title train-title--center">Double 12 Express</div>
      <div class="train-end"></div>
    `;
    try {
      const endEl = mexHdr.querySelector(".train-end");
      if (endEl) endEl.textContent = `+ ${esc(state?.mexicanTrain?.openEnd ?? "")}`;
    } catch {}

    const mexBody = document.createElement("div");
    mexBody.className = "train-body";

    const mex = state?.mexicanTrain;
    const anim = ctx?.anim || null;
    const mexTilesWrap = renderTrainTiles(mex, hubPip, {
      renderMode,
      skin: dominoSkin,
      pack: activePack,
      anim,
      trainKey: "MEX",
      scrollState
    });

    attachTrainInteractions(mexTilesWrap, { kind: "MEX" });

    const mexDrop = document.createElement("button");
    mexDrop.type = "button";
    mexDrop.className = "dropzone";
    mexDrop.textContent = "+";
    mexDrop.addEventListener("click", () => {
      if (typeof ctx?.onPlaySelectedToTarget === "function") {
        ctx.onPlaySelectedToTarget({ kind: "MEX" });
      }
    });

    mexBody.appendChild(mexTilesWrap);
    mexBody.appendChild(mexDrop);

    mexRow.appendChild(mexHdr);
    mexRow.appendChild(mexBody);

    frag.appendChild(mexRow);

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

      // BEGIN: Active turn row highlight (PLAYER row)
      if (state?.currentPlayer === p.id) row.classList.add("train-row--active");
      else row.classList.remove("train-row--active");
      // END: Active turn row highlight (PLAYER row)

      const hdr = document.createElement("div");
      hdr.className = "train-hdr train-hdr--top";

      const name = esc(p.name || `P${p.id}`);
      const openTag = tr.isOpen ? " (OPEN)" : "";

      
    // BEGIN: Player train header (name + openEnd + hand-count badge + active turn badge)
    const handCount = Array.isArray(p?.hand) ? p.hand.length : 0;

    const isActiveTurn = state?.currentPlayer === p.id;

    const act =
      (isActiveTurn && ctx?.turnActivity && ctx.turnActivity.pid === p.id)
        ? String(ctx.turnActivity.action || "thinking")
        : (isActiveTurn ? "thinking" : "");

    const actLabel =
      (p.id === 0 && isActiveTurn) ? "YOUR TURN" :
      act === "drawing" ? "DRAWING…" :
      act === "playing" ? "PLAYING…" :
      act === "passing" ? "PASSING…" :
      (isActiveTurn ? "THINKING…" : "");

    const showStatus = !!actLabel && isActiveTurn;

    hdr.innerHTML = `
      <div class="train-title train-title--center ${showStatus ? "train-title--stack" : ""}">
        <div class="train-title-main">${name}${openTag}</div>
        ${showStatus ? `<div class="train-action">${esc(actLabel)}</div>` : ""}
      </div>
      <div class="train-end">
        + ${esc(tr.openEnd ?? "")}
        <span class="hand-badge" title="Tiles in hand">🎴 ${handCount}</span>
      </div>
    `;
// END: Player train header (name + openEnd + hand-count badge + active turn badge)

      const body = document.createElement("div");
      body.className = "train-body";
      const anim = ctx?.anim || null;
      const tilesWrap = renderTrainTiles(tr, hubPip, {
        renderMode,
        skin: dominoSkin,
        pack: activePack,
        anim,
        trainKey: `P:${p.id}`,
        scrollState
      });

      attachTrainInteractions(tilesWrap, { kind: "PLAYER", ownerId: p.id });

      const dz = document.createElement("button");
      dz.type = "button";
      dz.className = "dropzone";
      dz.textContent = "+";
      dz.addEventListener("click", () => {
        if (typeof ctx?.onPlaySelectedToTarget === "function") {
          ctx.onPlaySelectedToTarget({ kind: "PLAYER", ownerId: p.id });
        }
      });

      body.appendChild(tilesWrap);
      body.appendChild(dz);

      row.appendChild(hdr);    

      row.appendChild(body);

      frag.appendChild(row);
    });
    // One atomic swap keeps scroll more stable than clear+append
    boardArea.replaceChildren(frag);

    // Force train rows to the far right after every render.
    // Android WebView resets scrollLeft to 0 when DOM nodes are replaced.
    requestAnimationFrame(() => {
      const rows = boardArea.querySelectorAll(".train-tiles");
      rows.forEach(el => {
        const maxLeft = el.scrollWidth - el.clientWidth;
        if (maxLeft > 0) {
          el.scrollLeft = maxLeft;
        }
      });
    });

        if (scrollState) {
        requestAnimationFrame(() => {
        try {
          boardArea.querySelectorAll(".train-tiles[data-train-key]").forEach((el) => {
            const key = String(el.dataset.trainKey || "");
            if (!key) return;

            const maxLeft = Math.max(0, Number((el.scrollWidth || 0) - (el.clientWidth || 0)));

            // Mobile / emulator behavior:
            // always keep the visible end of the train pinned to the far right.
            el.scrollLeft = maxLeft;

            // Save the settled state so future renders stay consistent.
            scrollState.set(`${key}:right`, 0);
            scrollState.set(`${key}:count`, Number(el.children?.length || 0));
          });
        } catch {}
      });
    }
}

  /* ---------- Hand (reorder + click select) ---------- */
if (handArea) {
  handArea.innerHTML = "";

  const cur = state?.players?.[0];
  const fullHand = Array.isArray(cur?.hand) ? [...cur.hand] : [];

  // Respect starter-reveal handLimit, but treat 0/negative as “no limit”
  const rawLimit = Number(ui.handLimit);
  const limit = (Number.isFinite(rawLimit) && rawLimit > 0) ? Math.floor(rawLimit) : null;
  const hand = (limit == null) ? fullHand : fullHand.slice(0, Math.min(fullHand.length, limit));

      // =========================
      // BEGIN: Hand auto-shrink
      // =========================
      const HAND_SHRINK_START = 6;        // start shrinking after 6 tiles
      const HAND_SHRINK_PER_TILE = 0.04; // shrink faster than trains
      const HAND_MIN_SCALE = 0.65;        // don't let them get absurdly tiny

      const handCount = hand.length;
      const handShrinkTiles = Math.max(0, handCount - HAND_SHRINK_START);
      const handScale = Math.max(HAND_MIN_SCALE, 1 - (HAND_SHRINK_PER_TILE * handShrinkTiles));

      const baseHandW = cssPxVar("--tile-w", 168);
      const baseHandH = cssPxVar("--tile-h", 84);

      const handMinW = Math.round(baseHandW * HAND_MIN_SCALE);
      const handMinH = Math.round(baseHandH * HAND_MIN_SCALE);

      const handW = Math.round(Math.max(handMinW, baseHandW * handScale));
      const handH = Math.round(Math.max(handMinH, baseHandH * handScale));

      handArea.style.setProperty("--hand-tile-w", `${handW}px`);
      handArea.style.setProperty("--hand-tile-h", `${handH}px`);
      // =========================
      // END: Hand auto-shrink
      // =========================

  const handLocked = !!ui.handLocked;
  const handNewTileId = ui.handNewTileId ?? null;

    // Flip preferences:
    // Prefer the callback from main.js (isHandTileFlipped),
    // but keep handFlipKeys as a fallback for backward compatibility.
    const flipSet = new Set((ui.handFlipKeys || []).map(String).filter(Boolean));

    const isTileFlippedInHand = (tile) => {
      try {
        if (typeof ui.isHandTileFlipped === "function") {
          return !!ui.isHandTileFlipped(tile);
        }
      } catch {}

      const pairKey = `${Math.min(Number(tile?.a), Number(tile?.b))}-${Math.max(Number(tile?.a), Number(tile?.b))}`;
      return flipSet.has(pairKey);
    };

  if (!hand.length) {
    const msg = document.createElement("div");
    msg.className = "muted";
    msg.textContent = "(Hand is empty)";
    handArea.classList.remove("hand-area--no-moves");
    handArea.appendChild(msg);
  } else {
    const canReorder = !matchOver && !roundOver && !handLocked;

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

    const myTurnActive = isMyTurn && !matchOver && !roundOver && !handLocked;
    const hasAnyLegal = myTurnActive ? (legalTileIds.size > 0) : true;

    // If you have ZERO legal moves, dim the entire hand so it’s obvious.
    handArea.classList.toggle("hand-area--no-moves", myTurnActive && !hasAnyLegal && highlightPlayable);

    hand.forEach((tile) => {
      const isLegal = myTurnActive ? legalTileIds.has(tile.id) : true;

      // “disabled” means disabled for PLAY actions (drag reorder still allowed)
      const disabledForPlay =
        !myTurnActive ||
        // Only show “disabled” hints when highlightPlayable is ON
        (highlightPlayable && (!hasAnyLegal || !isLegal));

        const isFlippedInHand = isTileFlippedInHand(tile);

        const tRender = isFlippedInHand
          ? { ...tile, __displayA: tile.b, __displayB: tile.a }
          : { ...tile, __displayA: tile.a, __displayB: tile.b };

      const el = renderTileEl(tRender, {
        isSelected: tile.id === selectedTileId,
        disabled: disabledForPlay,
        renderMode,
        skin: dominoSkin,
        pack: activePack,
        onClick: () => {
          if (shouldSuppressClickAfterReorder()) return;

          // Second tap/click on the SAME tile => flip its orientation in-hand (display only)
          if (typeof ctx?.onToggleHandFlip === "function" && shouldTreatAsFlipTap(tile.id)) {
            markHandTileFlipAnim(tile.id);
            ctx.onToggleHandFlip(tile.id);
            if (typeof requestPaint === "function") requestPaint();
            return;
          }

          if (typeof ctx?.onSelectTile === "function") {
            ctx.onSelectTile(tile.id);
          }
        }
      });

        // BEGIN: Micro-anim (draw into hand)
        const anim = ctx?.anim || null;
        if ((anim && anim.type === "draw" && String(anim.tileId) === String(tile.id) && (Date.now() - (anim.at || 0) < 1200))
            || (handNewTileId != null && String(handNewTileId) === String(tile.id))) {
          el.classList.add("anim-draw");
        }
        // END: Micro-anim (draw into hand)

      // UX hint + visual state for flipped tiles
      try { el.title = "Tip: tap twice quickly (or double-click) to flip this tile in your hand"; } catch {}
      if (isFlippedInHand) el.classList.add("hand-tile--flipped");
      if (isHandTileFlipAnimating(tile.id)) el.classList.add("hand-tile--flip-anim");
const setDragData = (e) => {
        try {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(tile.id));
        } catch {}
      };

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

        // =========================
        // BEGIN: Touch reorder (press & hold, pointer-events)
        // =========================
        el.addEventListener("pointerdown", (e) => {
          if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
          if (e.isPrimary === false) return;

          const pid = e.pointerId;
          const startX = e.clientX;
          const startY = e.clientY;

          let started = false;
          let holdTimer = null;

          const startDrag = () => {
            started = true;
            el.classList.add("is-touch-dragging");
            try { el.setPointerCapture(pid); } catch {}
            try { if (navigator.vibrate) navigator.vibrate(10); } catch {}
          };

          holdTimer = setTimeout(startDrag, TOUCH_REORDER_HOLD_MS);

          const onMove = (ev) => {
            if (!started) {
              const dx = ev.clientX - startX;
              const dy = ev.clientY - startY;
              if (Math.hypot(dx, dy) > TOUCH_REORDER_CANCEL_PX) {
                clearTimeout(holdTimer);
                holdTimer = null;
              }
              return;
            }

            ev.preventDefault();

            try {
              const r = handArea.getBoundingClientRect();
              if (ev.clientX < r.left + 26) handArea.scrollLeft -= 14;
              else if (ev.clientX > r.right - 26) handArea.scrollLeft += 14;
            } catch {}

            const under = document.elementFromPoint(ev.clientX, ev.clientY);
            const overTile = under?.closest?.(".hand-area .tile");
            if (!overTile || overTile === el) return;
            if (overTile.parentElement !== handArea) return;

            const rect = overTile.getBoundingClientRect();
            const before = ev.clientX < (rect.left + rect.width / 2);

            if (before) {
              handArea.insertBefore(el, overTile);
            } else {
              handArea.insertBefore(el, overTile.nextSibling);
            }
          };

          const finish = () => {
            if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }

            document.removeEventListener("pointermove", onMove, { passive: false });
            document.removeEventListener("pointerup", finish, { passive: false });
            document.removeEventListener("pointercancel", finish, { passive: false });

            if (!started) return;

            started = false;
            el.classList.remove("is-touch-dragging");
            __lastTouchReorderAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

            try {
              const ids = Array.from(handArea.querySelectorAll(".tile"))
                .map(n => n?.dataset?.tileId)
                .filter(Boolean);

              if (typeof onHandReorder === "function") onHandReorder(ids);
              if (typeof requestPaint === "function") requestPaint();
            } catch {}
          };

          document.addEventListener("pointermove", onMove, { passive: false });
          document.addEventListener("pointerup", finish, { passive: false });
          document.addEventListener("pointercancel", finish, { passive: false });
        });
        // =========================
        // END: Touch reorder
        // =========================

      } else {
        if (myTurnActive && isLegal) {
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
