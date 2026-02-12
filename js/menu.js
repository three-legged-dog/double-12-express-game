/*!
 * Double 12 Express - Menu (index.html)
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/menu.js
import { loadSettings, saveSettings, DEFAULT_SETTINGS, deepEqual, sanitizeSkin } from "./settings.js";
import { loadHighScores, clearHighScores } from "./highscores.js";

/* ---------- DOM ---------- */
const playBtn = document.getElementById("playBtn");
const instructionsBtn = document.getElementById("instructionsBtn");
const optionsBtn = document.getElementById("optionsBtn");
const scoresBtn = document.getElementById("scoresBtn");
const pageFade = document.getElementById("pageFade");

const instructionsBackdrop = document.getElementById("instructionsModalBackdrop");
const optionsBackdrop = document.getElementById("optionsModalBackdrop");
const scoresBackdrop = document.getElementById("scoresModalBackdrop");

/* Options */
const optPlayerName = document.getElementById("optPlayerName");
const optAiDifficulty = document.getElementById("optAiDifficulty");
const optAutoPlay = document.getElementById("optAutoPlay");
const optShowLog = document.getElementById("optShowLog");
const optRuleset = document.getElementById("optRuleset");
const optDominoPack = document.getElementById("optDominoPack");
const optionsApplyBtn = document.getElementById("optionsApplyBtn");

/* Pack preview */
const packPreviewImg = document.getElementById("packPreviewImg");
const packPreviewName = document.getElementById("packPreviewName");
const packPreviewTile = document.getElementById("packPreviewTile");
const packPreviewSource = document.getElementById("packPreviewSource");
const packPreviewError = document.getElementById("packPreviewError");

/* Scores */
const scoresList = document.getElementById("scoresList");
const scoresEmpty = document.getElementById("scoresEmpty");
const scoresClearBtn = document.getElementById("scoresClearBtn");

/* ---------- State ---------- */
let settings = loadSettings();
let draft = structuredClone(settings);

/* ---------- Transition ---------- */
function goToGame() {
  saveSettings(settings);
  pageFade?.classList.add("is-on");
  window.setTimeout(() => { window.location.href = "game.html"; }, 320);
}

/* ---------- Modals ---------- */
let lastFocusedEl = null;

function openModal(backdropEl) {
  if (!backdropEl) return;
  lastFocusedEl = document.activeElement;
  backdropEl.classList.add("is-open");
  const closeBtn = backdropEl.querySelector(".modal-close");
  if (closeBtn) closeBtn.focus();
}

function closeModal(backdropEl) {
  if (!backdropEl) return;
  backdropEl.classList.remove("is-open");
  if (lastFocusedEl) lastFocusedEl.focus();
}

function closeAnyOpenModal() {
  const open = document.querySelector(".modal-backdrop.is-open");
  if (open) closeModal(open);
}

document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal(backdrop);
  });
});

document.querySelectorAll(".modal-close").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.getAttribute("data-close");
    const backdrop = document.getElementById(id);
    if (backdrop) closeModal(backdrop);
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAnyOpenModal();
});

/* ---------- UI sync ---------- */
function setToggle(btn, on) {
  if (!btn) return;
  btn.setAttribute("data-on", String(!!on));
  btn.textContent = on ? "ON" : "OFF";
}

function refreshApplyState() {
  if (!optionsApplyBtn) return;
  const dirty = !deepEqual(draft, settings);
  optionsApplyBtn.disabled = !dirty;
}

function syncUIFromDraft() {
  if (optPlayerName) optPlayerName.value = draft.playerName || "";
  if (optAiDifficulty) optAiDifficulty.value = draft.aiDifficulty;
  if (optRuleset) optRuleset.value = draft.ruleset;
  if (optDominoPack) optDominoPack.value = draft.dominoPack;

  setToggle(optAutoPlay, !!draft.autoPlay);
  setToggle(optShowLog, !!draft.showLog);
  refreshApplyState();
}

optPlayerName?.addEventListener("input", () => {
  draft.playerName = (optPlayerName.value || "").trim() || DEFAULT_SETTINGS.playerName;
  refreshApplyState();
});

optAiDifficulty?.addEventListener("change", () => {
  draft.aiDifficulty = optAiDifficulty.value;
  refreshApplyState();
});

optRuleset?.addEventListener("change", () => {
  draft.ruleset = optRuleset.value;
  refreshApplyState();
});

optAutoPlay?.addEventListener("click", () => {
  draft.autoPlay = !draft.autoPlay;
  setToggle(optAutoPlay, !!draft.autoPlay);
  refreshApplyState();
});

optShowLog?.addEventListener("click", () => {
  draft.showLog = !draft.showLog;
  setToggle(optShowLog, !!draft.showLog);
  refreshApplyState();
});

optDominoPack?.addEventListener("change", async () => {
  draft.dominoPack = sanitizeSkin(optDominoPack.value);
  refreshApplyState();
  await updatePackPreview(draft.dominoPack);
});

/* ---------- Domino pack preview ---------- */
function canonicalPair(a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return [lo, hi];
}

function tileFilename(a, b, style) {
  const [lo, hi] = canonicalPair(a, b);
  const AA = String(lo).padStart(2, "0");
  const BB = String(hi).padStart(2, "0");
  return `D12_${AA}_${BB}_${String(style).toUpperCase()}.svg`;
}

async function tryLoadPackMeta(packId) {
  const url = `packs/${packId}/pack.json`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function defaultPreviewSvgDataUri() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="420" height="220" viewBox="0 0 420 220">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#f8fafc"/>
          <stop offset="1" stop-color="#e7eef7"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.35"/>
        </filter>
      </defs>
      <rect x="18" y="18" rx="18" ry="18" width="384" height="184"
            fill="url(#g)" stroke="rgba(148,163,184,0.55)" stroke-width="3"
            filter="url(#shadow)"/>
      <line x1="210" y1="34" x2="210" y2="186" stroke="rgba(148,163,184,0.55)" stroke-width="3"/>
      ${pipGroup(105, 110)}
      ${pipGroup(315, 110)}
    </svg>
  `;

  function pip(cx, cy) {
    return `<circle cx="${cx}" cy="${cy}" r="11" fill="#0b1220" opacity="0.92"/>`;
  }
  function pipGroup(centerX, centerY) {
    const dx = 44, dy = 40;
    return [
      pip(centerX - dx, centerY - dy),
      pip(centerX - dx, centerY),
      pip(centerX - dx, centerY + dy),
      pip(centerX + dx, centerY - dy),
      pip(centerX + dx, centerY),
      pip(centerX + dx, centerY + dy),
    ].join("");
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function setPreviewError(msgOrFalse) {
  if (!packPreviewError) return;
  if (!msgOrFalse) {
    packPreviewError.style.display = "none";
    packPreviewError.textContent = "";
    return;
  }
  packPreviewError.style.display = "block";
  packPreviewError.textContent = msgOrFalse;
}

async function updatePackPreview(packIdRaw) {
  const packId = sanitizeSkin(packIdRaw);

  setPreviewError(false);
  if (packPreviewImg) {
    packPreviewImg.onload = null;
    packPreviewImg.onerror = null;
  }

  if (packId === "default") {
    if (packPreviewName) packPreviewName.textContent = "Default";
    if (packPreviewTile) packPreviewTile.textContent = "BUILTIN_DEFAULT_06_06";
    if (packPreviewSource) packPreviewSource.textContent = "builtin://default";
    if (packPreviewImg) packPreviewImg.src = defaultPreviewSvgDataUri();
    return;
  }

  let displayName = packId;
  let tilePath = "tiles/";
  let previewTile = tileFilename(6, 6, packId);

  const meta = await tryLoadPackMeta(packId);
  if (meta) {
    displayName = meta.displayName || meta.name || displayName;
    tilePath = meta.tilePath || meta.tilesPath || tilePath;
    tilePath = String(tilePath).replace(/^\//, "").replace(/\/?$/, "/");
    previewTile = meta.previewTile || meta.preview || meta.sampleTile || previewTile;
  }

  const source = `packs/${packId}/${tilePath}${previewTile}`;

  if (packPreviewName) packPreviewName.textContent = displayName;
  if (packPreviewTile) packPreviewTile.textContent = previewTile;
  if (packPreviewSource) packPreviewSource.textContent = source;

  if (packPreviewImg) {
    packPreviewImg.onerror = () => setPreviewError(`Couldn’t load preview tile. Expected: ${source}`);
    packPreviewImg.src = `${source}?v=${Date.now()}`;
  }
}

/* ---------- High Scores render ---------- */
function formatDate(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return String(ts || "");
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderHighScores() {
  if (!scoresList || !scoresEmpty) return;

  const scores = loadHighScores();
  const shown = scores.slice(0, 20);

  scoresList.innerHTML = "";

  if (shown.length === 0) {
    scoresEmpty.style.display = "block";
    return;
  }
  scoresEmpty.style.display = "none";

  // Header
  const head = el("div", "scores-row scores-head");
  head.append(
    el("div", "", "#"),
    el("div", "", "Player"),
    el("div", "", "Score"),
    el("div", "", "Place"),
    el("div", "", "Winner"),
    el("div", "", "When"),
  );
  scoresList.appendChild(head);

  shown.forEach((s, i) => {
    const row = el("div", "scores-row");
    row.append(
      el("div", "", String(i + 1)),
      el("div", "", s.playerName || "Player"),
      el("div", "", String(s.playerScore)),
      el("div", "", `${s.placement}/${s.playerCount}`),
      el("div", "", s.winnerName ? `${s.winnerName} (${s.winnerScore})` : "—"),
      el("div", "", formatDate(s.ts)),
    );
    scoresList.appendChild(row);
  });
}

/* ---------- Apply ---------- */
optionsApplyBtn?.addEventListener("click", () => {
  draft.dominoPack = sanitizeSkin(draft.dominoPack);
  settings = structuredClone(draft);
  saveSettings(settings);
  refreshApplyState();
});

/* ---------- Wire buttons ---------- */
playBtn?.addEventListener("click", goToGame);
instructionsBtn?.addEventListener("click", () => openModal(instructionsBackdrop));
optionsBtn?.addEventListener("click", async () => {
  settings = loadSettings();
  draft = structuredClone(settings);
  syncUIFromDraft();
  openModal(optionsBackdrop);
  await updatePackPreview(draft.dominoPack);
});
scoresBtn?.addEventListener("click", () => {
  renderHighScores();
  openModal(scoresBackdrop);
});

scoresClearBtn?.addEventListener("click", () => {
  clearHighScores();
  renderHighScores();
});

/* ---------- Init ---------- */
syncUIFromDraft();
updatePackPreview(settings.dominoPack);
renderHighScores();

// END: js/menu.js
