/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/main.js
import { GameEngine } from "./engine.js";
import { render } from "./ui.js";
import { chooseMove } from "./ai.js";
import { addHighScore } from "./highscores.js";
import { sanitizeSkin } from "./settings.js";
import { loadPack, DEFAULT_PACK, applyPackUI } from "./packs.js";

/* ---------- DOM ---------- */

const boardArea = document.getElementById("boardArea");
const handArea = document.getElementById("handArea");
const statusBox = document.getElementById("statusBox");
const logBox = document.getElementById("logBox");
const optionsBox = document.getElementById("optionsBox");
const scoreBox = document.getElementById("scoreBox");
const boneyardLine = document.getElementById("boneyardLine");
const topStatus = document.getElementById("topStatus");
const topBoneyard = document.getElementById("topBoneyard");
const topOptions = document.getElementById("topOptions");
const scoreBar = document.getElementById("scoreBar");

// Log modal (optional)
const openLogBtn = document.getElementById("openLogBtn");
const logOverlay = document.getElementById("logOverlay");
const logCloseBtn = document.getElementById("logCloseBtn");
const logCloseX = document.getElementById("logCloseX");

// Optional legacy input (menu-only now)
const playerNameInput = document.getElementById("playerNameInput");

const newGameBtn = document.getElementById("newGameBtn");
const drawBtn = document.getElementById("drawBtn");
const passBtn = document.getElementById("passBtn");

/* Controls */
const aiDifficultySelect = document.getElementById("aiDifficultySelect");
const autoPlayToggle = document.getElementById("autoPlayToggle");

// If the checkbox exists, wire it. If not, silently keep mechanics available.
if (autoPlayToggle) {
  autoPlayToggle.addEventListener("change", () => {
    // intentionally unused (UI hidden); mechanics retained
  });
}

const logFilterSelect = document.getElementById("logFilterSelect");
const logSearchInput = document.getElementById("logSearchInput");
const logClearBtn = document.getElementById("logClearBtn");
const renderModeSelect = document.getElementById("renderModeSelect");

const openSettingsBtn = document.getElementById("openSettingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const settingsResumeBtn = document.getElementById("settingsResumeBtn");
const settingsSkinSelect = document.getElementById("settingsSkinSelect");
const settingsAiSelect = document.getElementById("settingsAiSelect");
const settingsRenderSelect = document.getElementById("settingsRenderSelect");
const settingsShowLogSelect = document.getElementById("settingsShowLogSelect");

// IMPORTANT: keep this defined even if the element is removed from game.html
const dominoSkinSelect = document.getElementById("dominoSkinSelect");

// Legacy/optional Apply button (we hide it if present)
const optionsApplyBtn = document.getElementById("optionsApplyBtn");

/* Game Over modal */
const gameOverOverlay = document.getElementById("gameOverOverlay");
const gameOverBody = document.getElementById("gameOverBody");
const gameOverNewGameBtn = document.getElementById("gameOverNewGameBtn");
const gameOverCloseBtn = document.getElementById("gameOverCloseBtn");

/* Round Over modal */
const roundOverOverlay = document.getElementById("roundOverOverlay");
const roundOverBody = document.getElementById("roundOverBody");
const roundNextBtn = document.getElementById("roundNextBtn");
const roundCountdown = document.getElementById("roundCountdown");

/* Rules modal */
const rulesBtn = document.getElementById("rulesBtn");
const rulesOverlay = document.getElementById("rulesOverlay");
const rulesCloseBtn = document.getElementById("rulesCloseBtn");
const rulesCloseX = document.getElementById("rulesCloseX");
const rulesApplyBtn = document.getElementById("rulesApplyBtn");
const rulesResetBtn = document.getElementById("rulesResetBtn");
const rulesToggles = document.getElementById("rulesToggles");

function logMsg(msg, { playerId = null, kind = "info" } = {}) {
  const emo =
    kind === "play" ? "🀄" :
    kind === "draw" ? "🎴" :
    kind === "pass" ? "⏭️" :
    kind === "rules" ? "📜" :
    kind === "error" ? "⚠️" :
    "🧠";

  const who = (playerId === null || playerId === undefined)
    ? ""
    : `P${playerId}: `;

  state.log.push(`${emo} ${who}${msg}`);
}

// =========================
// BEGIN: Sound Manager (SFX + Music Playlist)
// =========================
const SOUND = {
  intro: "sounds/game_intro.mp3",
  roundEnd: "sounds/round_end.mp3",
  gameWin: "sounds/game_end_win.mp3",
  gameLose: "sounds/game_end_lose.mp3",
  dominoPlay: "sounds/domino_play.mp3",
  trainHorn: "sounds/train_horn.mp3",
  themes: [
    "sounds/theme1.mp3",
    "sounds/theme2.mp3",
    "sounds/theme3.mp3",
  ],
};

// ---- Audio state ----
let audioUnlocked = false;
let introHasPlayed = false;

let lastPendingDouble = null;
let roundEndSoundPlayed = false;
let gameOverSoundPlayed = false;

// ---- Music players for crossfade ----
let musicA = null;
let musicB = null;
let musicActive = "A"; // "A" or "B"
let currentThemeIdx = 0;
let isCrossfading = false;
let crossfadeTO = null;

// ---- WebAudio for spatial/echo SFX (optional, graceful fallback) ----
let audioCtx = null;

// Shuffle themes once per boot (still cycles without repeats)
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
shuffleInPlace(SOUND.themes);

function getAudioPrefs() {
  // Single source of truth: localStorage settings
  const s = readMenuSettings?.() || {};
  return {
    soundEnabled: s.soundEnabled !== false,
    musicEnabled: s.musicEnabled !== false,
    sfxVolume: clamp01(Number(s.sfxVolume ?? 0.8)),
    musicVolume: clamp01(Number(s.musicVolume ?? 0.55)),
  };
}

function ensureAudioCtx() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      // Only resume after a confirmed user gesture
      audioCtx.resume().catch(() => {});
    }
  } catch {
    // no WebAudio available (fine)
  }
}

function ensureMusicPlayers() {
  if (!musicA) {
    musicA = new Audio();
    musicA.preload = "auto";
    musicA.loop = false;
    musicA.addEventListener("ended", () => {
      // Only react if this is the active player (avoid crossfade end noise)
      if (musicActive !== "A") return;
      const p = getAudioPrefs();
      if (!p.soundEnabled || !p.musicEnabled) return;
      playNextTheme({ fadeMs: 900 });
    });
  }
  if (!musicB) {
    musicB = new Audio();
    musicB.preload = "auto";
    musicB.loop = false;
    musicB.addEventListener("ended", () => {
      if (musicActive !== "B") return;
      const p = getAudioPrefs();
      if (!p.soundEnabled || !p.musicEnabled) return;
      playNextTheme({ fadeMs: 900 });
    });
  }
}

function unlockAudioOnce() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  ensureMusicPlayers();
  ensureAudioCtx();
}

// Browser autoplay restrictions: unlock on first user gesture
window.addEventListener("pointerdown", unlockAudioOnce, { once: true });
window.addEventListener("keydown", unlockAudioOnce, { once: true });

function clamp01(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// ---------- SFX helpers ----------
function playSfx(src, { volume = 0.85, fadeInMs = 0 } = {}) {
  const p = getAudioPrefs();
  if (!p.soundEnabled) return;
  if (!audioUnlocked) return;

  try {
    const a = new Audio(src);
    a.volume = clamp01(volume) * clamp01(p.sfxVolume);
    a.currentTime = 0;

    if (fadeInMs > 0) {
      const target = a.volume;
      a.volume = 0;
      a.play().catch(() => {});
      const steps = 12;
      const dt = Math.max(12, Math.floor(fadeInMs / steps));
      let i = 0;
      const id = setInterval(() => {
        i++;
        a.volume = target * (i / steps);
        if (i >= steps) clearInterval(id);
      }, dt);
      return;
    }

    a.play().catch(() => {});
  } catch {
    // ignore
  }
}

function stopMusic({ fadeMs = 300 } = {}) {
  try {
    if (crossfadeTO) { clearTimeout(crossfadeTO); crossfadeTO = null; }
    isCrossfading = false;

    const players = [musicA, musicB].filter(Boolean);
    players.forEach((p) => {
      if (!p || p.paused) return;
      const startVol = p.volume;
      const steps = 12;
      const dt = Math.max(16, Math.floor(fadeMs / steps));
      let i = 0;
      const id = setInterval(() => {
        i++;
        p.volume = startVol * (1 - i / steps);
        if (i >= steps) {
          clearInterval(id);
          try { p.pause(); } catch {}
          try { p.currentTime = 0; } catch {}
          p.volume = startVol;
        }
      }, dt);
    });
  } catch {}
}

function getActivePlayer() {
  return (musicActive === "A") ? musicA : musicB;
}

function getInactivePlayer() {
  return (musicActive === "A") ? musicB : musicA;
}

function playThemeOn(player, src, { fadeMs = 650 } = {}) {
  const prefs = getAudioPrefs();
  if (!prefs.soundEnabled || !prefs.musicEnabled) return;

  try {
    player.src = src;
    player.currentTime = 0;
    player.volume = 0;
    player.play().catch(() => {});

    const target = clamp01(prefs.musicVolume);
    const steps = 14;
    const dt = Math.max(18, Math.floor(fadeMs / steps));
    let i = 0;
    const id = setInterval(() => {
      i++;
      player.volume = target * (i / steps);
      if (i >= steps) clearInterval(id);
    }, dt);
  } catch {}
}

function crossfadeToNext(src, { fadeMs = 900 } = {}) {
  const prefs = getAudioPrefs();
  if (!prefs.soundEnabled || !prefs.musicEnabled) return;

  ensureMusicPlayers();
  const from = getActivePlayer();
  const to = getInactivePlayer();
  if (!to) return;

  if (isCrossfading) return;
  isCrossfading = true;

  try {
    to.src = src;
    to.currentTime = 0;
    to.volume = 0;
    to.play().catch(() => {});

    const target = clamp01(prefs.musicVolume);
    const steps = 18;
    const dt = Math.max(18, Math.floor(fadeMs / steps));
    let i = 0;
    const id = setInterval(() => {
      i++;
      const t = i / steps;
      if (from) from.volume = target * (1 - t);
      to.volume = target * t;
      if (i >= steps) {
        clearInterval(id);
        try { from?.pause(); } catch {}
        try { from && (from.currentTime = 0); } catch {}
        musicActive = (musicActive === "A") ? "B" : "A";
        isCrossfading = false;
      }
    }, dt);
  } catch {
    isCrossfading = false;
  }
}

function playNextTheme({ fadeMs = 900 } = {}) {
  const prefs = getAudioPrefs();
  if (!prefs.soundEnabled || !prefs.musicEnabled) return;

  const src = SOUND.themes[currentThemeIdx % SOUND.themes.length];
  currentThemeIdx++;

  // If nothing playing yet, just start.
  const active = getActivePlayer();
  if (!active || active.paused) {
    playThemeOn(active ?? musicA, src, { fadeMs });
    return;
  }

  crossfadeToNext(src, { fadeMs });
}

function ensureBackgroundMusic() {
  const prefs = getAudioPrefs();
  if (!prefs.soundEnabled || !prefs.musicEnabled) return;

  ensureMusicPlayers();
  const active = getActivePlayer();
  if (!active) return;

  // If already playing, done.
  if (!active.paused) return;

  playNextTheme({ fadeMs: 650 });
}

function onNewGameSoundStart() {
  const prefs = getAudioPrefs();
  if (!prefs.soundEnabled) return;

  if (!introHasPlayed) {
    introHasPlayed = true;
    playSfx(SOUND.intro, { volume: 0.8, fadeInMs: 120 });
  }
  ensureBackgroundMusic();
}

function onStateTransitionForSounds(prev, next) {
  const prevPD = prev?.pendingDouble;
  const nextPD = next?.pendingDouble;

  const prevHas = !!prevPD;
  const nextHas = !!nextPD;

  if (!prevHas && nextHas) {
    // double became pending
    playSfx(SOUND.trainHorn, { volume: 0.85 });
  }
}

function playRoundEndSoundIfNeeded() {
  if (roundEndSoundPlayed) return;
  roundEndSoundPlayed = true;
  playSfx(SOUND.roundEnd, { volume: 0.8 });
}

function playGameOverSoundIfNeeded(st) {
  if (gameOverSoundPlayed) return;
  gameOverSoundPlayed = true;

  const sorted = st.players
    .map((p) => ({ id: p.id, score: p.score }))
    .sort((a, b) => a.score - b.score);

  const winner = sorted[0]?.id;
  if (winner === 0) playSfx(SOUND.gameWin, { volume: 0.85 });
  else playSfx(SOUND.gameLose, { volume: 0.85 });
}

// =========================
// END: Sound Manager
// =========================

// =========================
// BEGIN: Menu settings wiring (read/write)
// =========================
const MENU_SETTINGS_KEY = "double12express.settings.v1";
function readMenuSettings() {
  try {
    const raw = localStorage.getItem(MENU_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function writeMenuSettings(s) {
  try { localStorage.setItem(MENU_SETTINGS_KEY, JSON.stringify(s || {})); } catch {}
}
// =========================
// END: Menu settings wiring
// =========================

// =========================
// BEGIN: Domino skin read/write
// =========================
function readDominoSkinSetting() {
  const s = readMenuSettings() || {};
  return sanitizeSkin(s.dominoPack || s.dominoSkin || s.skin || "default");
}
function writeDominoSkinSetting(skin) {
  try {
    const s = readMenuSettings() || {};
    s.dominoPack = sanitizeSkin(skin);
    writeMenuSettings(s);
  } catch {}
}
// =========================
// END: Domino skin read/write
// =========================

// =========================
// BEGIN: Sync Menu-Driven Audio Settings (hoisted, safe)
// =========================
function syncMenuDrivenSettings({ fadeMs = 250 } = {}) {
  const s = readMenuSettings?.() || {};
  const soundEnabled = s.soundEnabled !== false;
  const musicEnabled = s.musicEnabled !== false;

  const musicVol = (typeof s.musicVolume === "number")
    ? Math.min(1, Math.max(0, s.musicVolume))
    : Math.min(1, Math.max(0, Number(s.musicVolume ?? 0.55)));

  // 1) If sound is OFF → stop music now and bail
  if (!soundEnabled) {
    stopMusic?.({ fadeMs });
    try { updateGameAudioToggleUI?.(); } catch {}
    return;
  }

  // 2) Sound ON but Music OFF → stop music
  if (!musicEnabled) {
    stopMusic?.({ fadeMs });
    try { updateGameAudioToggleUI?.(); } catch {}
    return;
  }

  // 3) Sound ON + Music ON → ensure background music is running
  ensureBackgroundMusic?.();

  // 4) Keep current music volume synced (if a player exists)
  try {
    // If you have getActivePlayer() from the crossfade manager, use it
    const active = (typeof getActivePlayer === "function") ? getActivePlayer() : null;
    if (active) active.volume = musicVol;
  } catch {}

  try { updateGameAudioToggleUI?.(); } catch {}
}
// =========================
// END: Sync Menu-Driven Audio Settings (hoisted, safe)
// =========================

// =========================
// BEGIN: In-Game Speaker Toggle (3-state, fancy)
// =========================
const gameAudioToggle = document.getElementById("gameAudioToggle");

/**
 * Mode meanings:
 * 0 = 🔊 Sounds ON + Music ON
 * 1 = 🔈 Sounds ON + Music OFF
 * 2 = 🔇 Mute ALL
 */
function getGameAudioMode() {
  const s = readMenuSettings?.() || {};
  const soundOn = s.soundEnabled !== false;
  const musicOn = s.musicEnabled !== false;

  if (!soundOn) return 2;
  if (soundOn && !musicOn) return 1;
  return 0;
}

function applyGameAudioMode(mode) {
  const s = readMenuSettings?.() || {};

  if (mode === 0) {
    s.soundEnabled = true;
    s.musicEnabled = true;
  } else if (mode === 1) {
    s.soundEnabled = true;
    s.musicEnabled = false;
  } else {
    s.soundEnabled = false;
    s.musicEnabled = false;
  }

  // Persist
  writeMenuSettings?.(s);

  // Apply immediately
  syncMenuDrivenSettings?.({ fadeMs: 120 });

  // Fallback behavior if sync is unavailable
  if (s.soundEnabled === false) {
    stopMusic?.({ fadeMs: 120 });
  } else {
    if (s.musicEnabled === false) {
      stopMusic?.({ fadeMs: 120 });
    } else {
      ensureBackgroundMusic?.();
    }
  }
}

function updateGameAudioToggleUI() {
  if (!gameAudioToggle) return;

  const iconEl = document.getElementById("gameAudioIcon");
  const tipEl = document.getElementById("gameAudioTip");

  const mode = getGameAudioMode();

  let icon = "🔊";
  let label = "Audio: ON (Music ON)";
  let isOn = true;
  let isMuted = false;

  if (mode === 0) {
    icon = "🔊";
    label = "Audio: ON (Music ON)";
  } else if (mode === 1) {
    icon = "🔈";
    label = "Audio: ON (Music OFF)";
  } else {
    icon = "🔇";
    label = "Audio: MUTED";
    isOn = false;
    isMuted = true;
  }

  if (iconEl) iconEl.textContent = icon;
  gameAudioToggle.setAttribute("aria-label", label);
  if (tipEl) tipEl.textContent = label;

  gameAudioToggle.classList.toggle("is-on", isOn);
  gameAudioToggle.classList.toggle("is-muted", isMuted);
}

// Click cycle
gameAudioToggle?.addEventListener("click", () => {
  unlockAudioOnce?.();

  const nextMode = (getGameAudioMode() + 1) % 3;
  applyGameAudioMode(nextMode);
  updateGameAudioToggleUI();

  // Fancy feedback: ping ring
  gameAudioToggle.classList.remove("ping");
  void gameAudioToggle.offsetWidth;
  gameAudioToggle.classList.add("ping");
});

// Initialize UI
try { updateGameAudioToggleUI(); } catch {}
// =========================
// END: In-Game Speaker Toggle
// =========================

/* ---------- Overlay helpers ---------- */

function showOverlay(el) { el?.classList.remove("hidden"); }
function hideOverlay(el) { el?.classList.add("hidden"); }
function isVisible(el) { return !!el && !el.classList.contains("hidden"); }

function isAnyModalOpen() {
  return isVisible(gameOverOverlay) || isVisible(roundOverOverlay) || isVisible(rulesOverlay) || isVisible(settingsOverlay) || isVisible(logOverlay);
}

// =========================
// BEGIN: Modal sanity sync (prevents AI hang)
// =========================
function syncOverlaysWithState() {
  // If state says "not over", overlays MUST be hidden.
  if (!state?.matchOver && gameOverOverlay && !gameOverOverlay.classList.contains("hidden")) {
    gameOverOverlay.classList.add("hidden");
  }

  if (!state?.roundOver && roundOverOverlay && !roundOverOverlay.classList.contains("hidden")) {
    roundOverOverlay.classList.add("hidden");
  }

  // Rules overlay should ONLY be open when user explicitly opens it.
  // If it ever gets stuck open, it blocks AI forever.
  if (rulesOverlay && rulesOverlay.dataset?.autoHide === "1") {
    rulesOverlay.classList.add("hidden");
    delete rulesOverlay.dataset.autoHide;
  }
}
// =========================
// END: Modal sanity sync (prevents AI hang)
// =========================


/* ---------- Rules presets ---------- */

const RULE_PRESETS = {
  standard: {
    preset: "standard",
    startDoubleDescending: true,
    drawUntilStartDouble: true,
    satisfyDoubles: true,
    openTrainAfterNoPlay: true,
    allowPlayOnAnyOpenTrain: true,
    autoPassAfterDrawNoPlay: true,
    stalemateWhenAllPlayersLocked: true,
    endMatchAfterAllRounds: true,
  },
  beginner: {
    preset: "beginner",
    startDoubleDescending: true,
    drawUntilStartDouble: true,
    satisfyDoubles: true,
    openTrainAfterNoPlay: true,
    allowPlayOnAnyOpenTrain: true,
    autoPassAfterDrawNoPlay: true,
    stalemateWhenAllPlayersLocked: true,
    endMatchAfterAllRounds: true,
  },
  house: {
    preset: "house",
    startDoubleDescending: true,
    drawUntilStartDouble: true,
    satisfyDoubles: true,
    openTrainAfterNoPlay: true,
    allowPlayOnAnyOpenTrain: true,
    autoPassAfterDrawNoPlay: true,
    stalemateWhenAllPlayersLocked: true,
    endMatchAfterAllRounds: true,
  },
  chaos: {
    preset: "chaos",
    startDoubleDescending: true,
    drawUntilStartDouble: true,
    satisfyDoubles: true,
    openTrainAfterNoPlay: true,
    allowPlayOnAnyOpenTrain: true,
    autoPassAfterDrawNoPlay: true,
    stalemateWhenAllPlayersLocked: true,
    endMatchAfterAllRounds: true,
  },
};

let activeRules = structuredClone(RULE_PRESETS.standard);

/* ---------- Rules modal helpers ---------- */

function getSelectedPreset() {
  const el = document.querySelector('input[name="rules_preset"]:checked');
  return el ? el.value : "standard";
}

function syncToggleEnabledState() {
  const preset = getSelectedPreset();
  const isCustom = preset === "custom";
  if (!rulesToggles) return;

  rulesToggles.classList.toggle("disabled", !isCustom);
  rulesToggles.querySelectorAll("input").forEach((inp) => {
    inp.disabled = !isCustom;
  });
}

function applyPresetToToggles(preset) {
  const r = RULE_PRESETS[preset] || RULE_PRESETS.standard;

  const map = {
    r_startDoubleDescending: "startDoubleDescending",
    r_drawUntilStartDouble: "drawUntilStartDouble",
    r_satisfyDoubles: "satisfyDoubles",
    r_openTrainAfterNoPlay: "openTrainAfterNoPlay",
    r_allowPlayOnAnyOpenTrain: "allowPlayOnAnyOpenTrain",
    r_autoPassAfterDrawNoPlay: "autoPassAfterDrawNoPlay",
    r_stalemateWhenAllPlayersLocked: "stalemateWhenAllPlayersLocked",
    r_endMatchAfterAllRounds: "endMatchAfterAllRounds",
  };

  Object.entries(map).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!r[key];
  });
}

  function getCustomRulesFromToggles() {
    const read = (id, def) => {
      const el = document.getElementById(id);
      return el ? !!el.checked : def;
    };

    return {
      preset: "custom",
      startDoubleDescending: read("r_startDoubleDescending", true),
      drawUntilStartDouble: read("r_drawUntilStartDouble", true),
      satisfyDoubles: read("r_satisfyDoubles", true),
      openTrainAfterNoPlay: read("r_openTrainAfterNoPlay", true),
      allowPlayOnAnyOpenTrain: read("r_allowPlayOnAnyOpenTrain", true),
      autoPassAfterDrawNoPlay: read("r_autoPassAfterDrawNoPlay", true),
      stalemateWhenAllPlayersLocked: read("r_stalemateWhenAllPlayersLocked", true),
      endMatchAfterAllRounds: read("r_endMatchAfterAllRounds", true),
    };
  }

  function computeRulesFromModal() {
    const preset = getSelectedPreset();
    if (preset === "custom") return getCustomRulesFromToggles();
    return structuredClone(RULE_PRESETS[preset] || RULE_PRESETS.standard);
  }

  function openRules() {
    // Mark as intentionally user-opened (prevents AI-unblock safety code from hiding it)
    if (rulesOverlay) rulesOverlay.dataset.userOpen = "1";

    rulesOverlay?.classList.remove("hidden");
    syncToggleEnabledState();

    const preset = getSelectedPreset();
    if (preset !== "custom") applyPresetToToggles(preset);
  }

  function closeRules() {
    // Clear "user-open" marker so safety sync can hide if it ever gets stuck open
    if (rulesOverlay) delete rulesOverlay.dataset.userOpen;

    rulesOverlay?.classList.add("hidden");
  }

    /* ---------- Engine ---------- */

    let aiRunning = false;
    let aiDifficulty = aiDifficultySelect?.value || "normal";
    let autoPlayP0 = false;
    let autoPlayIntervalId = null;

    // High Scores: capture once per match (reset on new game)
    let highScoreCaptured = false;

    let engine = new GameEngine({ maxPip: 12, playerCount: 4, handSize: 15, rules: activeRules });
    let state = engine.newGame();

    window.__D12 = { get state(){ return state; }, get engine(){ return engine; } };

    highScoreCaptured = false;
    resetStableAiNames({ force: false });
    applyPlayerNamesToState();

    let selectedTileId = null;

  // BEGIN: Selection + play wiring
    function selectTile(tileId) {
      // toggle select
      if (selectedTileId === tileId) selectedTileId = null;
      else selectedTileId = tileId;
      paint();
  }

function playSelectedToTarget(target) {
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;
  if (state.currentPlayer !== 0) return;
  if (!selectedTileId) return;

  try {
    const prev = state;
    state = engine.playTile(0, selectedTileId, target);

    // sfx + pending-double transitions (if you have them)
    try { playSfx(SOUND.dominoPlay, { volume: 0.80 }); } catch {}
    try { onStateTransitionForSounds(prev, state); } catch {}

    // If engine didn’t advance but no pending double, you can pass (depends on your rules)
    // NOTE: This mirrors your AI logic pattern; keeps game moving.
    if (!state.pendingDouble && state.currentPlayer === 0) {
      // don't auto-pass if you want multi-plays later; for now keep consistent
      state = engine.pass(0);
    }

      selectedTileId = null;
      applyPlayerNamesToState();
      paint();
      ensureAI();
    } catch (err) {
      logMsg(err?.message || String(err), { playerId: 0, kind: "error" });
      paint();
    }
    }
    // END: Selection + play wiring

    // Hand order persistence (drag-to-reorder)
    let handOrder = [];
    function loadHandOrder() {
      try {
        const raw = localStorage.getItem("d12_handOrder_v1");
        const arr = raw ? JSON.parse(raw) : null;
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    }
    function setHandOrder(order) {
      handOrder = Array.isArray(order) ? order : [];
      try { localStorage.setItem("d12_handOrder_v1", JSON.stringify(handOrder)); } catch {}
    }
    handOrder = loadHandOrder();

    /* Log filter state */
    let logFilterMode = "all";
    let logSearch = "";

    /* UI Render options */
    let renderMode = localStorage.getItem("mt_renderMode") || "pretty";
    let dominoSkin = readDominoSkinSetting();

    let activePack = DEFAULT_PACK;

    // Load pack manifest for the current skin (and fall back safely)
    async function ensureActivePackLoaded(skin) {
      const folder = String(skin || "default").toLowerCase();
      const manifestUrl = `packs/${folder}/manifest.json`;
      try {
        activePack = await loadPack(manifestUrl);
        applyPackUI(activePack);
        return activePack;
      } catch (err) {
        // Back-compat: older packs may still use pack.json
        try {
          activePack = await loadPack(`packs/${folder}/pack.json`);
          applyPackUI(activePack);
          console.warn("[pack] Using pack.json fallback for", folder);
          return activePack;
        } catch (err2) {
          console.warn("[pack] Failed to load pack; using DEFAULT_PACK", err2);
          activePack = DEFAULT_PACK;
          applyPackUI(activePack);
          return activePack;
        }
      }
    }
  writeDominoSkinSetting(dominoSkin); // normalize/persist

  // Apply audio settings from menu immediately at boot
  applyAudioSettingsFromMenu(readMenuSettings() || {});

  /* Disable redundant in-game settings */
  if (dominoSkinSelect) {
    dominoSkinSelect.disabled = true;
    dominoSkinSelect.title = "Domino skin is set in the main menu Options.";
  }
  if (optionsApplyBtn) {
    optionsApplyBtn.disabled = true;
    optionsApplyBtn.style.display = "none";
  }

  /* ---------- Name stability ---------- */

  function resetStableAiNames({ force = false } = {}) {
    const s = readMenuSettings() || {};
    if (!force && Array.isArray(s.aiNames) && s.aiNames.length) return;

    s.aiNames = ["Puppet", "Trip", "Conductor Carl", "Switchman Sam"];
    writeMenuSettings(s);
  }

  function applyPlayerNamesToState() {
    const s = readMenuSettings() || {};
    const playerName = String(s.playerName || s.name || "Player");

    state.players?.forEach((p) => {
      if (p.id === 0) p.name = playerName;
    });

    const pool = Array.isArray(s.aiNamePool) ? s.aiNamePool : ["Puppet", "Trip", "Conductor Carl", "Switchman Sam"];
    state.players?.forEach((p) => {
      if (p.id !== 0) p.name = pool[(p.id - 1) % pool.length];
    });
  }

  /* ---------- UI helpers ---------- */

  function canHumanPlayAny() {
    const legal = engine.getLegalMoves(0);
    return Array.isArray(legal) && legal.length > 0;
  }

  function canHumanPass() {
    if (state.currentPlayer !== 0) return false;

    if (state.pendingDouble) {
      const legal = engine.getLegalMoves(0);
      if (legal.length > 0) return false;
      return state.deck.length === 0 || state.turnHasDrawn;
    }

    if (state.turnHasPlayed) return true;

    const legal = engine.getLegalMoves(0);
    if (legal.length > 0) return false;

    return state.deck.length === 0 || state.turnHasDrawn;
  }

  function computeOptionsText() {
    if (state.matchOver) return `Match over.`;
    if (state.roundOver) return `Round over — waiting to start next round.`;
    if (state.currentPlayer !== 0) return `Waiting for opponents… (P${state.currentPlayer})`;

    if (state.pendingDouble) {
      const legal = engine.getLegalMoves(0);
      if (legal.length > 0) return `A double must be satisfied.`;
      if (state.deck.length > 0 && !state.turnHasDrawn) return `No match. Draw to try.`;
      return `No match and no draw. You may Pass.`;
    }

    const legal = engine.getLegalMoves(0);
    if (legal.length > 0) return `You have playable tiles.`;
    if (state.deck.length > 0 && !state.turnHasDrawn) return `No playable tiles. Click Draw.`;
    return `No playable tiles and no draw. You may Pass.`;
  }

  function renderScoreBarHTML() {
    const players = Array.isArray(state?.players) ? state.players : [];
    if (!players.length) return "";

    const minScore = Math.min(...players.map(p => Number(p.score ?? 0)));
    const chips = players.map((p) => {
      const pid = p.id ?? 0;
      const name = p.name || `P${pid}`;
      const score = Number(p.score ?? 0);
      const isLeader = score === minScore;
      const cls = isLeader ? "score-chip leader" : "score-chip";
      // Lowest score leads in Mexican Train scoring
      return `<div class="${cls}" title="${name}: ${score} points">
        <span class="who">${escapeHtml(name)}</span>
        <span class="pts">${score} pts</span>
      </div>`;
    });

    return chips.join("");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function scoreboardText() {
    const sorted = state.players
      .map((p) => ({ id: p.id, name: p.name, score: p.score, hand: p.hand.length }))
      .sort((a, b) => a.score - b.score);

    const lines = [];
    lines.push(`Round: ${state.round}/${state.roundsTotal}`);
    lines.push(state.matchOver ? "Match: OVER" : (state.roundOver ? "Match: paused (round over)" : "Match: active"));
    lines.push("");
    lines.push("Ranking (lowest wins):");
    sorted.forEach((p, i) => lines.push(`${i + 1}. ${p.name || `P${p.id}`} — ${p.score} pts (hand ${p.hand})`));
    return lines.join("\n");
  }


/* ---------- Turn flow + AI ---------- */

// =========================
// BEGIN: Apply Audio Settings From Menu (hoisted)
// =========================
function applyAudioSettingsFromMenu() {
  const p = getAudioPrefs?.() || { soundEnabled: true, musicEnabled: true, sfxVolume: 0.8, musicVolume: 0.55 };

  // If sound is off, stop everything immediately
  if (!p.soundEnabled) {
    stopMusic?.({ fadeMs: 160 });
    return;
  }

  // Music on/off
  if (!p.musicEnabled) {
    stopMusic?.({ fadeMs: 160 });
  } else {
    ensureBackgroundMusic?.();
  }

  // Keep active music volume synced
  try {
    const active = getActivePlayer?.();
    if (active) active.volume = p.musicVolume;
  } catch {}
}
// =========================
// END: Apply Audio Settings From Menu (hoisted)
// =========================

function targetsEqual(a, b) {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "MEX") return true;
  if (a.kind === "PLAYER") return Number(a.ownerId) === Number(b.ownerId);
  return false;
}

// BEGIN: ensureAI (validated AI moves; prevents “waiting forever”)
async function ensureAI() {
  if (aiRunning) return;
  if (isAnyModalOpen()) return;
  if (state.matchOver || state.roundOver) return;

  // Hard safety: prevent a runaway loop from ever freezing the browser
  let steps = 0;
  const MAX_STEPS = 80;

  while (
    state.currentPlayer !== 0 &&
    !state.matchOver &&
    !state.roundOver &&
    !isAnyModalOpen()
  ) {
    steps++;
    if (steps > MAX_STEPS) {
      console.warn("AI watchdog: ensureAI bailed after max steps to avoid lockup.");
      return;
    }

    aiRunning = true;
    try {
      const pid = state.currentPlayer;
      const legal = engine.getLegalMoves(pid);

      if (legal.length > 0) {
        // chooseMove() may return a move that is not currently legal.
        // Only accept it if it matches the legal list exactly.
        const picked = chooseMove(engine, pid, aiDifficulty);

        const isValidPick =
          picked &&
          legal.some((m) => m.tileId === picked.tileId && targetsEqual(m.target, picked.target));

        const move = isValidPick ? picked : legal[0];

        const prevState = state;
        state = engine.playTile(pid, move.tileId, move.target);

        // SFX
        try { playSfx(SOUND.dominoPlay, { volume: 0.75 }); } catch {}
        try { onStateTransitionForSounds(prevState, state); } catch {}

        // End turn ONLY if it's still that player's turn (engine may have advanced)
        if (!state.pendingDouble && state.currentPlayer === pid) {
          state = engine.pass(pid);
        }
      } else {
        // No play moves
        if (state.deck.length > 0 && !state.turnHasDrawn) state = engine.draw(pid);
        else state = engine.pass(pid);
      }

      applyPlayerNamesToState();
      paint();

      // Small AI “thinking” delay
      await sleep(Math.random() * 450 + 550);
    } catch (err) {
      const msg = String(err?.message || err);

      // benign boundaries
      if (msg.includes("Round is over") || state.roundOver || state.matchOver) return;

      console.error("AI loop error:", err);

      // Critical: do not get stuck on “Waiting…”
      // Kick again next tick
      setTimeout(() => {
        aiRunning = false;
        ensureAI();
      }, 0);

      return;
    } finally {
      aiRunning = false;
    }
  }
}
// END: ensureAI

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// =========================
// BEGIN: AI Turn Watchdog (prevents rare stalls)
// =========================
let aiTurnWatchdogId = null;

function startAiTurnWatchdog() {
  if (aiTurnWatchdogId) return;

  aiTurnWatchdogId = setInterval(() => {
    try {
      if (!engine || !state) return;
      if (state.matchOver || state.roundOver) return;
      if (isAnyModalOpen()) return;

      // If it's an AI player's turn and the AI loop isn't currently running, nudge it.
      if (state.currentPlayer !== 0 && !aiRunning) {
        ensureAI();
      }
    } catch (e) {
      // Never let watchdog crash the game
      console.warn("AI watchdog tick failed:", e);
    }
  }, 600); // responsive but cheap
}

function stopAiTurnWatchdog() {
  if (!aiTurnWatchdogId) return;
  clearInterval(aiTurnWatchdogId);
  aiTurnWatchdogId = null;
}

// Start automatically
startAiTurnWatchdog();
// =========================
// END: AI Turn Watchdog
// =========================

function startAutoPlayWatchdog() {
  stopAutoPlayWatchdog();
  autoPlayIntervalId = setInterval(() => {
    try {
      if (!autoPlayP0) return;
      if (state.matchOver || state.roundOver) return;
      if (isAnyModalOpen()) return;
      if (state.currentPlayer !== 0) return;

      const legal = engine.getLegalMoves(0);
      if (legal.length > 0) {
        const picked = chooseMove(engine, 0, aiDifficulty);
        const move = (picked && legal.some((m) => m.tileId === picked.tileId && targetsEqual(m.target, picked.target)))
          ? picked
          : legal[0];

        const prevState = state;
        state = engine.playTile(0, move.tileId, move.target);
        playSfx(SOUND.dominoPlay, { volume: 0.80 });
        onStateTransitionForSounds(prevState, state);

        if (!state.pendingDouble && state.currentPlayer === 0) state = engine.pass(0);
      } else {
        if (state.deck.length > 0 && !state.turnHasDrawn) state = engine.draw(0);
        else state = engine.pass(0);
      }

      applyPlayerNamesToState();
      paint();
      ensureAI();
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (msg.includes("Round is over") || state.roundOver || state.matchOver) {
        stopAutoPlayWatchdog();
        autoPlayP0 = false;
        return;
      }
      console.error(err);
    }
  }, 350);
}

function stopAutoPlayWatchdog() {
  if (autoPlayIntervalId) {
    clearInterval(autoPlayIntervalId);
    autoPlayIntervalId = null;
  }
}

/* ---------- Round + Game Over overlays ---------- */

let gameOverShown = false;
let roundTimer = null;
let roundSeconds = 30;

function stopRoundCountdown() {
  if (roundTimer) {
    clearInterval(roundTimer);
    roundTimer = null;
  }
}

function showRoundOverIfNeeded() {
  if (!state.roundOver) return;
  if (state.matchOver) return;
  if (isVisible(roundOverOverlay)) return;

  playRoundEndSoundIfNeeded();

  const sum = state.lastRoundSummary || null;

  const lines = [];
  lines.push(sum?.reason || "Round over.");
  lines.push("");

  // Engine summary uses { roundAdds: [{id, added, total}, ...] }
  const adds = Array.isArray(sum?.roundAdds) ? sum.roundAdds : [];
  if (adds.length) {
    lines.push("Scores this round (added → total):");
    adds.forEach((s) => {
      const pid = (s.id ?? s.playerId ?? "?");
      const added = Number(s.added ?? s.points ?? 0);
      const total = Number(s.total ?? 0);
      lines.push(`P${pid}: +${added} → ${total}`);
    });
  } else {
    // Fallback if engine summary is missing
    lines.push(scoreboardText());
  }

  if (roundOverBody) roundOverBody.textContent = lines.join("\n");

  roundSeconds = 30;
  if (roundCountdown) roundCountdown.textContent = `${roundSeconds}s`;

  showOverlay(roundOverOverlay);

  // BEGIN: Fireworks on round win (P0)
try {
  const winners = state?.lastRoundSummary?.winners || [];
  if (Array.isArray(winners) && winners.includes(0)) {
    launchFireworks();
  }
} catch {}
// END: Fireworks on round win (P0)

  stopRoundCountdown();
  roundTimer = setInterval(() => {
    roundSeconds--;
    if (roundCountdown) roundCountdown.textContent = `${roundSeconds}s`;
    if (roundSeconds <= 0) {
      stopRoundCountdown();
      startNextRound();
    }
  }, 1000);
}

function startNextRound() {
  if (!state.roundOver) return;
  stopAutoPlayWatchdog();
  autoPlayP0 = false;
  stopRoundCountdown();
  hideOverlay(roundOverOverlay);

  state = engine.startNextRound();

  roundEndSoundPlayed = false;
  ensureBackgroundMusic();

  resetStableAiNames({ force: false });
  applyPlayerNamesToState();

  selectedTileId = null;
  gameOverShown = false;

  paint();
  ensureAI();

  try { awaitMaybeEnsureAI(); } catch {}
}

function showGameOverIfNeeded() {
  if (!state.matchOver) return;
  if (gameOverShown) return;
  gameOverShown = true;
  recordHighScoreIfNeeded();

  playGameOverSoundIfNeeded(state);

  const lines = [];
  lines.push("Match over!");
  lines.push("");
  lines.push(scoreboardText());

  if (gameOverBody) gameOverBody.textContent = lines.join("\n");
  showOverlay(gameOverOverlay);
}

/* ---------- High score capture ---------- */

function recordHighScoreIfNeeded() {
  if (!state.matchOver) return;
  if (highScoreCaptured) return;

  try {
    const sorted = state.players
      .map((p) => ({ id: p.id, name: p.name || `P${p.id}`, score: Number(p.score) }))
      .sort((a, b) => a.score - b.score);

    const placementIdx = sorted.findIndex((p) => p.id === 0);
    const winner = sorted[0];

    addHighScore({
      ts: new Date().toISOString(),
      playerName: state.players?.[0]?.name || "Player",
      playerScore: Number(state.players?.[0]?.score ?? 0),
      placement: placementIdx >= 0 ? (placementIdx + 1) : 99,
      playerCount: state.players?.length || 4,
      roundsTotal: state.roundsTotal || 13,
      aiDifficulty: aiDifficulty || "normal",
      ruleset: (activeRules && activeRules.preset) ? activeRules.preset : "standard",
      dominoPack: dominoSkin || "default",
      winnerName: winner?.name || "",
      winnerScore: Number(winner?.score ?? 0),
    });

    highScoreCaptured = true;
  } catch {
    highScoreCaptured = true;
  }
}

/* ---------- Render ---------- */

function paint() {
  syncOverlaysWithState();
  syncMenuDrivenSettings();
  applyPlayerNamesToState();

  if (scoreBar) scoreBar.innerHTML = renderScoreBarHTML();
  else if (scoreBox) scoreBox.textContent = scoreboardText();

  const locked = state.matchOver || state.roundOver || isAnyModalOpen();
  const myTurn = state.currentPlayer === 0;

    // =========================
  // BEGIN: UI difficulty-based hint control (define EARLY)
  // =========================
  const diff = String(aiDifficulty || "").trim().toLowerCase();
  const noHints = (diff === "hard" || diff === "chaos");
  // =========================
  // END: UI difficulty-based hint control
  // =========================

  if (drawBtn) {
    drawBtn.disabled = locked || !myTurn || state.deck.length === 0 || state.turnHasDrawn;
  }

  if (passBtn) {
    passBtn.disabled = locked || !myTurn || !canHumanPass();
  }

  // Topbar HUD text
  if (topBoneyard) topBoneyard.textContent = `Boneyard: ${state.deck.length}`;
  // =========================
  // BEGIN: Hide "Your Options" in Hard/Chaos
  // NOTE: `noHints` is defined above in the "UI difficulty-based hint control" block
  // =========================
  if (topOptions) {
    if (noHints) {
      topOptions.textContent = "";
      topOptions.classList.add("hidden");
    } else {
      topOptions.classList.remove("hidden");
      topOptions.textContent = `Your Options: ${computeOptionsText()}`;
    }
  }
  // =========================
  // END: Hide "Your Options" in Hard/Chaos
  // =========================


    // Top Status Strip Update (optional element)
  if (topStatus) {
    const lastLine =
      Array.isArray(state.log) && state.log.length
        ? state.log[state.log.length - 1]
        : "";

    const boneyardCount =
      Array.isArray(state.deck) ? state.deck.length : 0;

    const turnName =
      state.players?.[state.currentPlayer]?.name ??
      `P${state.currentPlayer}`;

    let turnHint = "";
    if (!myTurn) {
      turnHint = "Waiting…";
    } else if (state.pendingDouble != null) {
      turnHint = "Must satisfy double";
    } else if (!canHumanPlayAny()) {
      turnHint = state.deck.length ? "Draw required" : "No moves";
    } else {
      turnHint = "Your move";
    }

    topStatus.textContent =
      `Turn: ${turnName} • ` +
      `Boneyard: ${boneyardCount} • ` +
      `${turnHint}` +
      (lastLine ? ` — ${lastLine}` : "");
  }

  // =========================
  // BEGIN: Hide "Your Options" in Hard/Chaos
  // =========================
  if (topOptions) {
    if (noHints) {
      topOptions.textContent = "";
      topOptions.classList.add("hidden");
    } else {
      topOptions.classList.remove("hidden");
      topOptions.textContent = `Your Options: ${computeOptionsText()}`;
    }
  }
  // =========================
  // END: Hide "Your Options" in Hard/Chaos
  // =========================

  // ONE render() call. Everything goes inside THIS object.
  render(state, {
    engine,
    boardArea,
    handArea,
    statusBox,
    logBox,
    optionsBox,
    selectedTileId,
    logFilterMode,
    logSearch,
    renderMode,
    dominoSkin,
    activePack,
    maxPip: 12,
    handOrder,
    onHandReorder: setHandOrder,
    requestPaint: paint,

    // selection + play callbacks
    onSelectTile: selectTile,
    onPlaySelectedToTarget: playSelectedToTarget,

    // difficulty UI behavior
    noHints,
    dimUnplayable: !noHints,
    highlightPlayable: !noHints,
    hideOptionsHud: noHints,
  });

  showGameOverIfNeeded();
  showRoundOverIfNeeded();
}

/* ---------- Events ---------- */

newGameBtn?.addEventListener("click", async () => {
  if (isAnyModalOpen()) return;
  stopAutoPlayWatchdog();
  autoPlayP0 = false;

  state = engine.newGame();
  highScoreCaptured = false;

  unlockAudioOnce();
  onNewGameSoundStart();

  resetStableAiNames({ force: false });
  applyPlayerNamesToState();

  selectedTileId = null;
  gameOverShown = false;

  // Load pack and paint once ready
  dominoSkin = readDominoSkinSetting();
  await ensureActivePackLoaded(dominoSkin);
  paint();
  ensureAI();
});

drawBtn?.addEventListener("click", () => {
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;
  if (state.currentPlayer !== 0) return;

  try {
    const previousPlayerId = state.currentPlayer;
    state = engine.draw(0);

    if (state.currentPlayer !== previousPlayerId) {
      logMsg("Drawn tile not playable. Auto-passed.", { kind: "pass" });
    } else {
      logMsg("Drawn tile is playable!", { kind: "draw" });
    }

    applyPlayerNamesToState();
    paint();
    ensureAI();
  } catch (err) {
    logMsg(err?.message || String(err), { playerId: 0, kind: "error" });
    paint();
  }
});

passBtn?.addEventListener("click", () => {
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;
  if (state.currentPlayer !== 0) return;

  try {
    state = engine.pass(0);
    applyPlayerNamesToState();
    selectedTileId = null;
    paint();
    ensureAI();
  } catch (err) {
    logMsg(err?.message || String(err), { playerId: 0, kind: "error" });
    paint();
  }
});

// Game over buttons
gameOverNewGameBtn?.addEventListener("click", () => {
  hideOverlay(gameOverOverlay);
  state = engine.newGame();
  highScoreCaptured = false;
  applyPlayerNamesToState();

  unlockAudioOnce();
  onNewGameSoundStart();

  selectedTileId = null;
  gameOverShown = false;
  paint();
  ensureAI();
});
gameOverCloseBtn?.addEventListener("click", () => {
  hideOverlay(gameOverOverlay);
  paint();
});

// Round over button
roundNextBtn?.addEventListener("click", startNextRound);

// Log modal open/close
openLogBtn?.addEventListener("click", () => showOverlay(logOverlay));
logCloseBtn?.addEventListener("click", () => hideOverlay(logOverlay));
logCloseX?.addEventListener("click", () => hideOverlay(logOverlay));
logOverlay?.addEventListener("click", (e) => { if (e.target === logOverlay) hideOverlay(logOverlay); });

/* ---------- Log filter controls ---------- */

logFilterSelect?.addEventListener("change", () => {
  logFilterMode = logFilterSelect.value;
  paint();
});
logSearchInput?.addEventListener("input", () => {
  logSearch = logSearchInput.value || "";
  paint();
});
logClearBtn?.addEventListener("click", () => {
  logFilterMode = "all";
  logSearch = "";
  if (logFilterSelect) logFilterSelect.value = "all";
  if (logSearchInput) logSearchInput.value = "";
  paint();
});

/* ---------- Rules modal listeners ---------- */

rulesBtn?.addEventListener("click", openRules);
rulesCloseBtn?.addEventListener("click", closeRules);
rulesCloseX?.addEventListener("click", closeRules);
rulesOverlay?.addEventListener("click", (e) => { if (e.target === rulesOverlay) closeRules(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && rulesOverlay && !rulesOverlay.classList.contains("hidden")) closeRules();
});

document.querySelectorAll('input[name="rules_preset"]').forEach((r) => {
  r.addEventListener("change", () => {
    const preset = getSelectedPreset();
    syncToggleEnabledState();
    if (preset !== "custom") applyPresetToToggles(preset);
  });
});

rulesApplyBtn?.addEventListener("click", () => {
  activeRules = computeRulesFromModal();
  engine = new GameEngine({ maxPip: 12, playerCount: 4, handSize: 15, rules: activeRules });
  state = engine.newGame();

  unlockAudioOnce();
  onNewGameSoundStart();

  highScoreCaptured = false;
  resetStableAiNames({ force: false });
  applyPlayerNamesToState();

  selectedTileId = null;
  gameOverShown = false;

  closeRules();
  paint();
  setTimeout(() => ensureAI(), 0);
});

rulesResetBtn?.addEventListener("click", () => {
  document.querySelector('input[name="rules_preset"][value="standard"]').checked = true;
  applyPresetToToggles("standard");
  activeRules = structuredClone(RULE_PRESETS.standard);
  syncToggleEnabledState();
});

// =========================
// BEGIN: Fireworks (tiny canvas celebration)
// =========================
function launchFireworks() {
  // prevent stacking
  if (document.getElementById("fwOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "fwOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "9999";

  const c = document.createElement("canvas");
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  overlay.appendChild(c);
  document.body.appendChild(overlay);

  const ctx = c.getContext("2d");
  const particles = [];
  const bursts = 7;
  const gravity = 0.06;

  function burst() {
    const x = Math.random() * c.width * 0.8 + c.width * 0.1;
    const y = Math.random() * c.height * 0.35 + c.height * 0.1;
    const count = 70;

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * 4.8 + 1.2;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 90 + Math.random() * 40,
        r: 1.2 + Math.random() * 1.6
      });
    }
  }

  for (let i = 0; i < bursts; i++) setTimeout(burst, i * 180);

  let t = 0;
  function tick() {
    t++;
    ctx.clearRect(0, 0, c.width, c.height);

    ctx.globalAlpha = 1;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= 1;
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 120));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (t < 220) requestAnimationFrame(tick);
    else cleanup();
  }

  function cleanup() {
    overlay.remove();
  }

  window.addEventListener("resize", () => {
    c.width = window.innerWidth;
    c.height = window.innerHeight;
  }, { once: true });

  tick();
}
// =========================
// END: Fireworks (tiny canvas celebration)
// =========================

// Boot
(async function boot() {
  dominoSkin = readDominoSkinSetting();
  await ensureActivePackLoaded(dominoSkin);

  unlockAudioOnce();
  onNewGameSoundStart();

  paint();
  ensureAI();
})();

async function awaitMaybeEnsureAI() {
  // best-effort helper to keep AI moving after some overlay transitions
  await sleep(0);
  ensureAI();
}
// END: js/main.js
