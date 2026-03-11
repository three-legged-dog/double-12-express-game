/*!
 * Double 12 Express - Menu (index.html)
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/menu.js
import { loadSettings, saveSettings, DEFAULT_SETTINGS, deepEqual, sanitizeSkin } from "./settings.js";
import { loadHighScores, clearHighScores, HIGH_SCORES_MAX } from "./highscores.js";
import { PackStore } from "./packstore.js";

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

/* Theme gallery */
const themeGalleryEl = document.getElementById("themeGallery");

/* Scores */
const scoresList = document.getElementById("scoresList");
const scoresEmpty = document.getElementById("scoresEmpty");
const scoresClearBtn = document.getElementById("scoresClearBtn");

function renderHighScores() {
  if (!scoresList || !scoresEmpty) return;

  const scores = loadHighScores();

  scoresList.innerHTML = "";

  if (!Array.isArray(scores) || scores.length === 0) {
    scoresEmpty.hidden = false;
    scoresList.hidden = true;
    return;
  }

  scoresEmpty.hidden = true;
  scoresList.hidden = false;

  const rows = scores.slice(0, Number(HIGH_SCORES_MAX || 50));

  rows.forEach((entry, idx) => {
    const item = document.createElement("div");
    item.className = "score-row";

    const when = entry?.ts
      ? new Date(entry.ts).toLocaleDateString()
      : "";

    const placement = Number(entry?.placement ?? 99);
    const playerScore = Number(entry?.playerScore ?? 0);
    const playerName = String(entry?.playerName ?? "Player");
    const winnerName = String(entry?.winnerName ?? "");
    const aiDifficulty = String(entry?.aiDifficulty ?? "normal");
    const ruleset = String(entry?.ruleset ?? "standard");

    item.innerHTML = `
      <div class="score-rank">#${idx + 1}</div>
      <div class="score-main">
        <div class="score-line">
          <strong>${playerName}</strong>
          <span>Score: ${playerScore}</span>
          <span>Place: ${placement}</span>
        </div>
        <div class="score-sub">
          <span>${when}</span>
          <span>${aiDifficulty}</span>
          <span>${ruleset}</span>
          ${winnerName ? `<span>Winner: ${winnerName}</span>` : ""}
        </div>
      </div>
    `;

    scoresList.appendChild(item);
  });
}

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
// BEGIN: Menu Custom Select Overlay (Android WebView fix)
// (Android WebView native <select> picker can inject the app icon into rows.
//  We bypass it and show our own overlay list instead.)
// =========================
(function initMenuCustomSelectOverlay(){
  function isAndroidWebView(){
    const ua = navigator.userAgent || "";
    return /Android/i.test(ua) && (/\swv\)/i.test(ua) || /\bwv\b/i.test(ua) || !!window.Capacitor);
  }
  if (!isAndroidWebView()) return;

  // Build overlay using the SAME modal styles as index.html (modal-backdrop + modal)
  let backdrop = document.getElementById("selectPickerBackdrop");
  if (!backdrop){
    backdrop = document.createElement("div");
    backdrop.id = "selectPickerBackdrop";
    backdrop.className = "modal-backdrop";
    backdrop.style.zIndex = "2147483647"; // win z-index wars
    backdrop.innerHTML = `
      <section class="modal" style="width:min(560px, 100%);">
        <div class="modal-header">
          <div class="modal-title" id="selectPickerTitle">Choose</div>
          <button class="modal-close" id="selectPickerCloseX" type="button">Close</button>
        </div>
        <div class="modal-body">
          <div id="selectPickerList" style="display:flex;flex-direction:column;gap:10px;"></div>
        </div>
      </section>
    `;
    try{ document.body.appendChild(backdrop); }catch(_){}
  } else {
    try{ document.body.appendChild(backdrop); }catch(_){}
  }

  const titleEl = backdrop.querySelector("#selectPickerTitle");
  const listEl = backdrop.querySelector("#selectPickerList");
  const closeBtn = backdrop.querySelector("#selectPickerCloseX") || backdrop.querySelector("#selectPickerCloseBtn");

  let activeSelect = null;

  function close(){
    backdrop.classList.remove("is-open");
    activeSelect = null;
    if (listEl) listEl.innerHTML = "";
  }

  function open(selectEl, title){
    if (!selectEl || !listEl) return;
    if (backdrop.classList.contains("is-open")) return;

    activeSelect = selectEl;
    if (titleEl) titleEl.textContent = title || "Choose";

    listEl.innerHTML = "";
    const opts = Array.from(selectEl.options || []);
    const current = String(selectEl.value);

    opts.forEach((opt) => {
      if (!opt || opt.disabled) return;
      const v = String(opt.value);
      const label = opt.textContent || opt.label || v;
      const isSel = (v === current);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toggle";
      btn.style.width = "100%";
      btn.style.textAlign = "left";
      btn.style.display = "flex";
      btn.style.justifyContent = "space-between";
      btn.style.gap = "12px";
      btn.style.padding = "12px 12px";
      btn.innerHTML = `<span>${label}</span><span style="opacity:.9">${isSel ? "◉" : "○"}</span>`;

      btn.addEventListener("click", () => {
        try{
          selectEl.value = v;
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        }catch(_){}
        close();
      });

      listEl.appendChild(btn);
    });

    try{ selectEl.blur(); }catch(_){}
    backdrop.classList.add("is-open");
  }

  function wire(selectEl, title){
    if (!selectEl) return;

    const handler = (e) => {
      if (selectEl.disabled) return;
      try{ e.preventDefault(); }catch(_){}
      try{ e.stopPropagation(); }catch(_){}
      open(selectEl, title);
    };

    selectEl.addEventListener("pointerdown", handler, { passive: false });
    selectEl.addEventListener("click", handler);

    selectEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " "){
        e.preventDefault();
        open(selectEl, title);
      }
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", close);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // Wire menu selects inside Options modal
  wire(optAiDifficulty, "AI Difficulty");
  wire(optRuleset, "Ruleset");
  wire(optDominoPack, "Theme");
})();
// =========================
// END: Menu Custom Select Overlay
// =========================

// =========================


// =========================
// BEGIN: Menu Audio (index.html intro + live preview)
// =========================
const MENU_SOUND = {
  intro: "sounds/game_intro.mp3",
  sfxPreview: "sounds/domino_play.mp3",
  accept: "sounds/accept.mp3",
  themes: ["sounds/theme1.mp3", "sounds/theme2.mp3", "sounds/theme3.mp3"],
};

let menuAudioUnlocked = false;
let menuIntroHasPlayedThisLoad = false;

let menuMusicPlayer = null;
let menuThemeIdx = 0;

let lastSfxPreviewAt = 0;
let menuAcceptPlayer = null;

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
function playMenuAcceptSfx() {
  const a = getMenuAudioState();
  if (!a.soundEnabled) return;

  // Keep playback inside the direct click gesture path.
  unlockMenuAudioOnce();
  if (!menuAudioUnlocked) return;

  try {
    if (!menuAcceptPlayer) {
      menuAcceptPlayer = new Audio(MENU_SOUND.accept);
      menuAcceptPlayer.preload = "auto";
    }

    menuAcceptPlayer.pause();
    menuAcceptPlayer.currentTime = 0;
    menuAcceptPlayer.volume = clamp01(a.sfxVolume);
    menuAcceptPlayer.play().catch((err) => {
      console.warn("accept.mp3 failed to play:", err);
    });
  } catch (err) {
    console.warn("accept.mp3 setup failed:", err);
  }
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

optDominoPack?.addEventListener("change", () => {
  setThemeKey(optDominoPack.value);
});


/* ---------- Theme gallery ---------- */
const BUNDLED_THEMES = [
  { key: "default", name: "Classic", packId: "DEFAULT", source: "bundled" },
  { key: "neon", name: "Neon", packId: "NEON", source: "bundled" },
];

function placeholderThemeSvgDataUri() {
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
      <circle cx="120" cy="110" r="12" fill="#0b1220" opacity="0.92"/>
      <circle cx="300" cy="110" r="12" fill="#0b1220" opacity="0.92"/>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function loadThemeCatalog() {
  const map = new Map();

  // Bundled packs
  for (const t of BUNDLED_THEMES) map.set(t.key, { ...t });

  // Installed packs (OPFS via PackStore)
  try {
    if (PackStore?.isSupported?.()) {
      await PackStore.init();
      for (const p of PackStore.list()) {
        const key = String(p.key || "").toLowerCase();
        if (!key || map.has(key)) continue;
        map.set(key, {
          key,
          name: String(p.name || p.packId || key),
          packId: String(p.packId || key).toUpperCase(),
          source: "installed",
        });
      }
    }
  } catch {}

  const arr = Array.from(map.values());

  // Sort: built-ins first, then alphabetical
  arr.sort((a, b) => {
    if (a.source !== b.source) return (a.source === "bundled") ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });

  return arr;
}

function fillThemeSelect(themes) {
  if (!optDominoPack) return;

  const desired = sanitizeSkin(draft?.dominoPack || settings?.dominoPack || "default");

  optDominoPack.innerHTML = "";
  for (const t of themes) {
    const opt = document.createElement("option");
    opt.value = t.key;
    opt.textContent = t.name;
    optDominoPack.appendChild(opt);
  }

  if (themes.some(t => t.key === desired)) {
    optDominoPack.value = desired;
  } else {
    optDominoPack.value = "default";
  }
}

function setThemeSelectionUI(selectedKey) {
  const sel = sanitizeSkin(selectedKey);

  if (optDominoPack && optDominoPack.value !== sel) {
    optDominoPack.value = sel;
  }

  if (!themeGalleryEl) return;
  themeGalleryEl.querySelectorAll(".theme-card").forEach((btn) => {
    const k = btn.getAttribute("data-pack");
    const on = (k === sel);
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

function setThemeKey(key) {
  draft.dominoPack = sanitizeSkin(key);
  setThemeSelectionUI(draft.dominoPack);
  refreshApplyState();
}

function bundledPreviewCandidates(t) {
  return {
    thumb: `packs/${t.key}/thumbs/preview.png`,
    tile: `packs/${t.key}/tiles/D12_06_06_${t.packId}.svg`,
  };
}

async function renderThemeGallery() {
  if (!themeGalleryEl) return;

  const themes = await loadThemeCatalog();
  fillThemeSelect(themes);

  const ph = placeholderThemeSvgDataUri();
  themeGalleryEl.innerHTML = "";

  for (const t of themes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-card";
    btn.setAttribute("data-pack", t.key);
    btn.setAttribute("aria-pressed", "false");

    const thumb = document.createElement("div");
    thumb.className = "theme-thumb";

    const img = document.createElement("img");
    img.alt = `${t.name} preview`;
    img.src = ph;
    thumb.appendChild(img);

    const name = document.createElement("div");
    name.className = "theme-name";
    name.textContent = t.name;

    const sub = document.createElement("div");
    sub.className = "theme-sub";
    sub.innerHTML =
      `<span class="theme-pill">${t.source === "bundled" ? "Built-in" : "Installed"}</span> ` +
      `<span style="opacity:.85">${t.packId}</span>`;

    btn.appendChild(thumb);
    btn.appendChild(name);
    btn.appendChild(sub);

    themeGalleryEl.appendChild(btn);

    // Preview image loading
    if (t.source === "bundled") {
      const cand = bundledPreviewCandidates(t);
      img.src = cand.thumb;
      img.onerror = () => {
        img.onerror = null;
        img.src = cand.tile;
        img.onerror = () => { img.onerror = null; img.src = ph; };
      };
    } else {
      // Installed pack preview (fast: one file)
      try {
        if (PackStore?.isSupported?.()) {
          const u = await PackStore.previewImageUrl(t.key);
          if (u) img.src = u;
        }
      } catch {}
    }
  }

  // Current selection highlight
  setThemeSelectionUI(draft.dominoPack || "default");
}

// Delegate clicks in gallery
themeGalleryEl?.addEventListener("click", (e) => {
  const btn = e.target?.closest?.(".theme-card");
  if (!btn) return;
  const key = btn.getAttribute("data-pack");
  if (!key) return;
  setThemeKey(key);
});
/* ---------- Theme gallery ---------- */

/* ---------- Apply ---------- */
optionsApplyBtn?.addEventListener("click", () => {
  draft.dominoPack = sanitizeSkin(draft.dominoPack);
  ensureAudioDefaultsOnDraft();

  // Play immediately while still inside the direct click gesture.
  playMenuAcceptSfx();

  settings = structuredClone(draft);
  saveSettings(settings);
  refreshApplyState();

  // quick visual ping
  optionsApplyBtn.classList.remove("is-ping");
  void optionsApplyBtn.offsetWidth;
  optionsApplyBtn.classList.add("is-ping");
  setTimeout(() => optionsApplyBtn.classList.remove("is-ping"), 260);
});

/* ---------- Wire buttons ---------- */
playBtn?.addEventListener("click", goToGame);
optionsBtn?.addEventListener("click", async () => {
  settings = loadSettings();
  draft = structuredClone(settings);
  syncUIFromDraft();
  openModal(optionsBackdrop);
  // Ensure the menu music volume matches current draft immediately
  applyMenuMusicVolumeLive();
  await renderThemeGallery();
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
console.log("menu.js init start");
syncUIFromDraft();
console.log("menu.js after syncUIFromDraft");
renderThemeGallery();
console.log("menu.js after renderThemeGallery");
renderHighScores();
console.log("menu.js after renderHighScores");
// END: js/menu.js
