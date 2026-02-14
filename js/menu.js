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
const optAutoPlay = document.getElementById("optAutoPlay"); // may be hidden/removed (safe)
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

// =========================
// BEGIN: Options DOM - Audio
// =========================
const optSoundEnabled = document.getElementById("optSoundEnabled");
const optMusicEnabled = document.getElementById("optMusicEnabled");
const optSfxVolume = document.getElementById("optSfxVolume");
const optMusicVolume = document.getElementById("optMusicVolume");
const optSfxVolumeValue = document.getElementById("optSfxVolumeValue");
const optMusicVolumeValue = document.getElementById("optMusicVolumeValue");
// =========================
// END: Options DOM - Audio
// =========================


// =========================
// BEGIN: Shared Helpers
// =========================
function clamp01(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
// =========================
// END: Shared Helpers
// =========================


// =========================
// BEGIN: Menu Audio (index.html intro + live preview)
// =========================
const MENU_SOUND = {
  intro: "sounds/game_intro.mp3",
  sfxPreview: "sounds/domino_play.mp3",
  themes: ["sounds/theme1.mp3", "sounds/theme2.mp3", "sounds/theme3.mp3"],
};

let menuAudioUnlocked = false;
let menuIntroHasPlayedThisLoad = false;

let menuMusicPlayer = null;
let menuThemeIdx = 0;

let lastSfxPreviewAt = 0;

function getMenuAudioState() {
  const s = (typeof draft !== "undefined" && draft) ? draft : (settings || {});
  return {
    soundEnabled: s.soundEnabled !== false,
    musicEnabled: s.musicEnabled !== false,
    sfxVolume: clamp01(s.sfxVolume ?? 0.8),
    musicVolume: clamp01(s.musicVolume ?? 0.55),
  };
}


function ensureMenuMusicPlayer() {
  if (menuMusicPlayer) return;

  menuMusicPlayer = new Audio();
  menuMusicPlayer.preload = "auto";
  menuMusicPlayer.loop = false;

  menuMusicPlayer.addEventListener("ended", () => {
    const a = getMenuAudioState();
    if (!a.soundEnabled || !a.musicEnabled) return;
    playNextMenuTheme();
  });
}

function applyMenuMusicVolumeLive() {
  ensureMenuMusicPlayer();
  const a = getMenuAudioState();
  try { menuMusicPlayer.volume = a.musicVolume; } catch {}
}

function stopMenuMusic() {
  if (!menuMusicPlayer) return;
  try {
    menuMusicPlayer.pause();
    menuMusicPlayer.currentTime = 0;
  } catch {}
}

function playMenuMusic(src) {
  const a = getMenuAudioState();
  if (!a.soundEnabled || !a.musicEnabled) return;
  if (!menuAudioUnlocked) return;

  ensureMenuMusicPlayer();
  applyMenuMusicVolumeLive();

  try {
    menuMusicPlayer.src = src;
    menuMusicPlayer.currentTime = 0;
    menuMusicPlayer.play().catch(() => {});
  } catch {}
}

function playNextMenuTheme() {
  if (!MENU_SOUND.themes.length) return;
  const src = MENU_SOUND.themes[menuThemeIdx % MENU_SOUND.themes.length];
  menuThemeIdx = (menuThemeIdx + 1) % MENU_SOUND.themes.length;
  playMenuMusic(src);
}

function maybeStartMenuIntro({ force = false } = {}) {
  const a = getMenuAudioState();
  if (!a.soundEnabled || !a.musicEnabled) return;
  if (!menuAudioUnlocked) return;

  if (menuIntroHasPlayedThisLoad && !force) return;

  menuIntroHasPlayedThisLoad = true;
  stopMenuMusic();
  playMenuMusic(MENU_SOUND.intro);
}

function ensureMenuMusicIsPlaying() {
  const a = getMenuAudioState();
  if (!a.soundEnabled || !a.musicEnabled) { stopMenuMusic(); return; }
  if (!menuAudioUnlocked) return;

  ensureMenuMusicPlayer();
  applyMenuMusicVolumeLive();

  const hasSrc = !!(menuMusicPlayer && menuMusicPlayer.src);
  const isPaused = !menuMusicPlayer || menuMusicPlayer.paused;

  if (!hasSrc || isPaused) {
    if (!menuIntroHasPlayedThisLoad) maybeStartMenuIntro({ force: true });
    else playNextMenuTheme();
  }
}

function unlockMenuAudioOnce() {
  if (menuAudioUnlocked) return;
  menuAudioUnlocked = true;

  ensureMenuMusicPlayer();
  applyMenuMusicVolumeLive();

  // Start intro immediately on the first user gesture (if enabled)
  maybeStartMenuIntro();
}

// Browser audio policy: unlock on first gesture
window.addEventListener("pointerdown", unlockMenuAudioOnce, { once: true });
window.addEventListener("keydown", unlockMenuAudioOnce, { once: true });

// Any click: if unlocked & music enabled, make sure something is playing
document.addEventListener("click", () => {
  if (!menuAudioUnlocked) unlockMenuAudioOnce();
  ensureMenuMusicIsPlaying();
});

function previewSfxTick() {
  const a = getMenuAudioState();
  if (!a.soundEnabled) return;
  if (!menuAudioUnlocked) return;

  const now = Date.now();
  if (now - lastSfxPreviewAt < 220) return;
  lastSfxPreviewAt = now;

  try {
    const snd = new Audio(MENU_SOUND.sfxPreview);
    snd.preload = "auto";
    snd.volume = clamp01(a.sfxVolume * 0.85);
    snd.play().catch(() => {});
  } catch {}
}
// =========================
// END: Menu Audio (index.html intro + live preview)
// =========================

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

// =========================
// BEGIN: Options Logic - Audio
// =========================


function pctTo01(pct) {
  return clamp01(Number(pct) / 100);
}

function v01ToPct(v01) {
  return Math.round(clamp01(v01) * 100);
}

function ensureAudioDefaultsOnDraft() {
  // defaults if settings.js didn't already provide them
  if (draft.soundEnabled === undefined) draft.soundEnabled = true;
  if (draft.musicEnabled === undefined) draft.musicEnabled = true;
  if (draft.sfxVolume === undefined) draft.sfxVolume = 0.8;     // 0..1
  if (draft.musicVolume === undefined) draft.musicVolume = 0.55; // 0..1
}

function refreshAudioUiFromDraft() {
  ensureAudioDefaultsOnDraft();

  setToggle(optSoundEnabled, !!draft.soundEnabled);
  setToggle(optMusicEnabled, !!draft.musicEnabled);

  const sfxPct = v01ToPct(draft.sfxVolume ?? 0.8);
  const musPct = v01ToPct(draft.musicVolume ?? 0.55);

  if (optSfxVolume) optSfxVolume.value = String(sfxPct);
  if (optMusicVolume) optMusicVolume.value = String(musPct);

  if (optSfxVolumeValue) optSfxVolumeValue.textContent = `${sfxPct}%`;
  if (optMusicVolumeValue) optMusicVolumeValue.textContent = `${musPct}%`;
}

// toggle: sounds master
optSoundEnabled?.addEventListener("click", () => {
  ensureAudioDefaultsOnDraft();
  draft.soundEnabled = !draft.soundEnabled;
  setToggle(optSoundEnabled, !!draft.soundEnabled);

  unlockMenuAudioOnce();

  if (draft.soundEnabled === false) {
    stopMenuMusic();
  } else {
    // If music is enabled too, start intro on unlock/gesture
    if (draft.musicEnabled !== false) maybeStartMenuIntro();
  }

  refreshApplyState?.();
});


// toggle: music on/off
optMusicEnabled?.addEventListener("click", () => {
  ensureAudioDefaultsOnDraft();
  draft.musicEnabled = !draft.musicEnabled;
  setToggle(optMusicEnabled, !!draft.musicEnabled);

  unlockMenuAudioOnce();

  const musicShouldPlay = (draft.soundEnabled !== false) && (draft.musicEnabled !== false);
  if (musicShouldPlay) maybeStartMenuIntro();
  else stopMenuMusic();

  refreshApplyState?.();
});


// slider: sfx volume
optSfxVolume?.addEventListener("input", () => {
  ensureAudioDefaultsOnDraft();
  const pct = Number(optSfxVolume.value);
  draft.sfxVolume = pctTo01(pct);
  if (optSfxVolumeValue) optSfxVolumeValue.textContent = `${Math.round(pct)}%`;

  // Live preview tick while dragging
  unlockMenuAudioOnce();
  previewSfxTick();

  refreshApplyState?.();
});


// slider: music volume
optMusicVolume?.addEventListener("input", () => {
  ensureAudioDefaultsOnDraft();
  const pct = Number(optMusicVolume.value);
  draft.musicVolume = pctTo01(pct);
  if (optMusicVolumeValue) optMusicVolumeValue.textContent = `${Math.round(pct)}%`;

  // Live preview
  unlockMenuAudioOnce();
  applyMenuMusicVolumeLive();

  const s = getMenuAudioState();
  if (s.soundEnabled && s.musicEnabled) {
    // If nothing is playing yet, start intro (or a theme if intro already played)
    ensureMenuMusicPlayer();
    const hasSrc = !!(menuMusicPlayer && menuMusicPlayer.src);
    if (!hasSrc || menuMusicPlayer.paused) {
      if (!menuIntroHasPlayedThisLoad) maybeStartMenuIntro({ force: true });
      else playNextMenuTheme();
    }
  } else {
    stopMenuMusic();
  }

  refreshApplyState?.();
});

// =========================
// END: Options Logic - Audio
// =========================

function syncUIFromDraft() {
  // Keep draft aligned with defaults in case settings.js adds new fields later
  draft.playerName = (draft.playerName ?? DEFAULT_SETTINGS.playerName);
  draft.aiDifficulty = (draft.aiDifficulty ?? DEFAULT_SETTINGS.aiDifficulty);
  draft.autoPlay = (draft.autoPlay ?? DEFAULT_SETTINGS.autoPlay);
  draft.showLog = (draft.showLog ?? DEFAULT_SETTINGS.showLog);
  draft.ruleset = (draft.ruleset ?? DEFAULT_SETTINGS.ruleset);
  draft.dominoPack = sanitizeSkin(draft.dominoPack ?? DEFAULT_SETTINGS.dominoPack);

  ensureAudioDefaultsOnDraft();

  if (optPlayerName) optPlayerName.value = draft.playerName || "";
  if (optAiDifficulty) optAiDifficulty.value = draft.aiDifficulty;
  if (optRuleset) optRuleset.value = draft.ruleset;
  if (optDominoPack) optDominoPack.value = draft.dominoPack;

  setToggle(optAutoPlay, !!draft.autoPlay); // safe if hidden/removed
  setToggle(optShowLog, !!draft.showLog);

  refreshAudioUiFromDraft();
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

// Autoplay UI may be hidden/removed; keep handler safe
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
  ensureAudioDefaultsOnDraft();

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
  // Ensure the menu music volume matches current draft immediately
  applyMenuMusicVolumeLive();
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
