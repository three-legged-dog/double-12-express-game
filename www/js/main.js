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
import { PackStore, wirePackStoreUI } from "./packstore.js";

// =========================
// BEGIN: Native StatusBar (Capacitor)
// =========================
function initNativeStatusBar(){
  try{
    const Cap = window.Capacitor;
    const StatusBar = Cap?.Plugins?.StatusBar;
    if (!Cap?.isNativePlatform?.() || !StatusBar) return;

    // CSS hook for safe-area/statusbar guard
    try{ document.body.classList.add("is-native"); }catch(_){ }

    // Critical: prevent content under clock/battery
    StatusBar.setOverlaysWebView({ overlay: false });

    // Make the status bar area solid
    StatusBar.setBackgroundColor({ color: "#0b1220" });
  }catch(_){}
}

document.addEventListener("DOMContentLoaded", initNativeStatusBar);
// Re-apply on resume/focus (Android 15 can reassert edge-to-edge after activity changes)
document.addEventListener("visibilitychange", () => { if (!document.hidden) initNativeStatusBar(); });
window.addEventListener("focus", initNativeStatusBar);
// =========================
// END: Native StatusBar (Capacitor)
// =========================

/* ---------- DOM ---------- */

const boardArea = document.getElementById("boardArea");
const handArea = document.getElementById("handArea");
const statusBox = document.getElementById("statusBox");
const logBox = document.getElementById("logBox");
const optionsBox = document.getElementById("optionsBox");
const scoreBox = document.getElementById("scoreBox");
const boneyardLine = document.getElementById("boneyardLine");
const topStatus = document.getElementById("topStatus");
const sbBoneyard = document.getElementById("sbBoneyard");
const sbOptions = document.getElementById("sbOptions");
const scoreBar = document.getElementById("scoreBar");
const scoreChips = document.getElementById("scoreChips");
const scoreboardBtn = document.getElementById("scoreboardBtn");
const scoreboardOverlay = document.getElementById("scoreboardOverlay");
const scoreboardBody = document.getElementById("scoreboardBody");
const scoreboardCloseBtn = document.getElementById("scoreboardCloseBtn");
const scoreboardCloseX = document.getElementById("scoreboardCloseX");

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
// =========================
// BEGIN: Top Menu (hamburger modal)
// =========================
const topMenuBtn = document.getElementById("topMenuBtn");
const topMenuOverlay = document.getElementById("topMenuOverlay");
const topMenuCloseBtn = document.getElementById("topMenuCloseBtn");
const topMenuResumeBtn = document.getElementById("topMenuResumeBtn");

// =========================
// BEGIN: Portal Top Menu Overlay to <body> (escapes stacking contexts)
// =========================
(function portalTopMenuOverlay(){
  if (!topMenuOverlay) return;

  const move = () => {
    try {
      // Make it the LAST thing in <body> so it wins ties and escapes parent stacking contexts
      document.body.appendChild(topMenuOverlay);
    } catch (_) {}
  };

  if (document.body) move();
  else document.addEventListener("DOMContentLoaded", move, { once: true });
})();
// =========================
// END: Portal Top Menu Overlay to <body>
// =========================

function openTopMenu() {
  if (!topMenuOverlay) return;
  document.body.classList.add("topmenu-open");
  topMenuOverlay.classList.remove("hidden");
}

function closeTopMenu() {
  if (!topMenuOverlay) return;
  document.body.classList.remove("topmenu-open");
  topMenuOverlay.classList.add("hidden");
}

function toggleTopMenu() {
  if (!topMenuOverlay) return;
  const isHidden = topMenuOverlay.classList.contains("hidden");
  if (isHidden) openTopMenu();
  else closeTopMenu();
}

if (topMenuBtn) topMenuBtn.addEventListener("click", toggleTopMenu);
if (topMenuCloseBtn) topMenuCloseBtn.addEventListener("click", closeTopMenu);
if (topMenuResumeBtn) topMenuResumeBtn.addEventListener("click", closeTopMenu);

if (topMenuOverlay) {
  // Click the dark backdrop (not the modal) to close
  topMenuOverlay.addEventListener("click", (e) => {
    if (e.target === topMenuOverlay) closeTopMenu();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeTopMenu();
});

// Close the menu when launching any top action
["instructionsBtn", "rulesBtn", "openLogBtn", "newGameBtn"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", () => setTimeout(closeTopMenu, 0));
});
// =========================
// END: Top Menu (hamburger modal)
// =========================
// =========================
// BEGIN: Feature flags
// =========================
const ENABLE_INSTALL_PACK_OPTION = false; // flip to true later
// =========================
// END: Feature flags
// =========================
// =========================
// BEGIN: Theme (pack) select wiring + PackStore integration
// =========================

let __packStoreUI = null;

/**
 * Rebuild the Theme dropdown from:
 * - built-in packs (classic/default, neon)
 * - OPFS-installed packs (PackStore) if supported
 *
 * Keeps the selected value if possible.
 */
async function refreshThemeSelectOptions({ selectSkin = null } = {}){
  if (!dominoSkinSelect) return;

  const desired =
    String(
      selectSkin ||
      (typeof readDominoSkinSetting === "function"
        ? (readDominoSkinSetting() || "default")
        : "default")
    ).toLowerCase();

  // Simplified diagnostic version:
  // keep Theme as a fixed built-in select only.
  dominoSkinSelect.innerHTML = `
    <option value="default">Classic</option>
    <option value="neon">Neon</option>
  `;

  dominoSkinSelect.value =
    (desired === "neon" || desired === "default")
      ? desired
      : "default";
}

async function syncThemeSelectUI({ selectSkin = null } = {}){
  return refreshThemeSelectOptions({
    selectSkin:
      selectSkin ||
      (typeof readDominoSkinSetting === "function"
        ? (readDominoSkinSetting() || "default")
        : (dominoSkin || "default")),
  });
}

// =========================
// BEGIN: Install Pack help + open Pack Store
// =========================
function showInstallPackHelp(){
  alert(
    "Install Pack...\n\n" +
    "Desktop Chrome/Edge:\n" +
    "• Choose an UNZIPPED pack folder (it must contain manifest.json)\n\n" +
    "Tip:\n" +
    "• If you selected /packs and it lists packs, pick the one you want\n" +
    "• Ignore __MACOSX or hidden folders\n\n" +
    "In the finished Capacitor app:\n" +
    "• Installs will be handled in-app (no manual file shuffling)."
  );
}

async function openPackStoreOverlay(){
  if (__packStoreUI?.open){
    await __packStoreUI.open();
    return;
  }
  // If PackStore UI isn't wired, show help
  showInstallPackHelp();
}
// =========================
// END: Install Pack help + open Pack Store
// =========================

if (dominoSkinSelect){
  dominoSkinSelect.addEventListener("change", async () => {
    const v = String(dominoSkinSelect.value || "default").toLowerCase();

    // Simplified diagnostic version:
    // built-ins only, no option rebuilding during change.
    writeDominoSkinSetting(v);
    try { dominoSkin = v; } catch (_) {}

    try{
      await ensureActivePackLoaded(v);
      rebuildAudioFromActivePack({ restartMusic: true });
    }catch(err){
      console.warn("Failed to load theme pack:", err);

      writeDominoSkinSetting("default");
      try { dominoSkin = "default"; } catch (_) {}

      await ensureActivePackLoaded("default");
      rebuildAudioFromActivePack({ restartMusic: true });

      if (dominoSkinSelect) dominoSkinSelect.value = "default";
    }

    try { paint(); } catch(e) {}
  });
}
// =========================
// END: Theme (pack) select wiring + PackStore integration
// =========================


// Legacy/optional Apply button (we hide it if present)
const optionsApplyBtn = document.getElementById("optionsApplyBtn");

/* Game Over modal */
const gameOverOverlay = document.getElementById("gameOverOverlay");
const gameOverBody = document.getElementById("gameOverBody");
const gameOverNewGameBtn = document.getElementById("gameOverNewGameBtn");
const gameOverCloseBtn = document.getElementById("gameOverCloseBtn");
// =========================
// BEGIN: Credits modal elements
// =========================
const gameOverCreditsBtn = document.getElementById("gameOverCreditsBtn");
const creditsOverlay = document.getElementById("creditsOverlay");
const creditsText = document.getElementById("creditsText");
const creditsCloseBtn = document.getElementById("creditsCloseBtn");
const creditsCloseX = document.getElementById("creditsCloseX");
// =========================
// END: Credits modal elements
// =========================

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

// Instructions modal (moved from splash to game screen)
const instructionsBtn = document.getElementById("instructionsBtn");
const instructionsOverlay = document.getElementById("instructionsOverlay");
const instructionsCloseBtn = document.getElementById("instructionsCloseBtn");
const instructionsCloseX = document.getElementById("instructionsCloseX");

// Quit / resume controls
const topMenuQuitBtn = document.getElementById("topMenuQuitBtn");
const quitOverlay = document.getElementById("quitOverlay");
const quitResumeBtn = document.getElementById("quitResumeBtn");
const quitHomeBtn = document.getElementById("quitHomeBtn");
const quitExitBtn = document.getElementById("quitExitBtn");
const quitCloseX = document.getElementById("quitCloseX");

// Accessibility controls
const uiTextSizeSelect = document.getElementById("uiTextSizeSelect");
const uiHighContrastToggle = document.getElementById("uiHighContrastToggle");
const uiReduceMotionToggle = document.getElementById("uiReduceMotionToggle");

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

// Classic (root) fallbacks — used when the active pack doesn't define a sound.
// Pack-provided sounds/themes are defined in /packs/<pack>/manifest.json.
const CLASSIC_SOUND = {
  intro: "sounds/game_intro.mp3",
  roundEnd: "sounds/round_end.mp3",
  gameWin: "sounds/game_end_win.mp3",
  gameLose: "sounds/game_end_lose.mp3",
  dominoPlay: "sounds/domino_play.mp3",
  trainHorn: "sounds/train_horn.mp3",
  draw: "sounds/draw.mp3",

  // Back-compat keys used by some packs
  click: "sounds/default/click.mp3",  
  place: "sounds/default/place.mp3",
  roundWin: "sounds/default/round_win.mp3",
  roundLose: "sounds/default/round_lose.mp3",

  themes: [
    "sounds/theme1.mp3",
    "sounds/theme2.mp3",
    "sounds/theme3.mp3",
  ],
};

// Active sound map (rebuilt whenever the pack/theme changes)
let SOUND = {
  ...CLASSIC_SOUND,
  themes: (CLASSIC_SOUND.themes || []).slice(),
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

function isAbsLikeUrl(s){
  if (!s) return false;
  const str = String(s);
  return (
    str.startsWith("/") ||
    str.startsWith("data:") ||
    str.startsWith("blob:") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(str)
  );
}

function resolvePackAsset(pack, rel){
  if (!rel) return null;
  const s = String(rel);
  if (isAbsLikeUrl(s)) return s;

  const tag = (pack?.packId || "DEFAULT").toLowerCase();
  const base = pack?.__basePath || `/packs/${tag}/`;
  return base + s.replace(/^\/+/, "");
}

function getPackSoundRel(key){
  const snd = activePack?.sounds;
  if (!snd) return null;

  // IMPORTANT:
  // activePack is merged with DEFAULT_PACK, so snd may contain default values
  // even when the manifest didn't define them. We treat "equals default" as "not defined"
  // so packs don't accidentally try to load /packs/<pack>/sounds/default/place.mp3.
  const def = DEFAULT_PACK?.sounds || {};

  const isExplicit = (k) => {
    if (!snd[k]) return false;
    // If the defaults don't define this key, any value is explicit
    if (def[k] == null) return true;
    // Otherwise, only treat it as explicit if it differs from default
    return snd[k] !== def[k];
  };

  // Direct hit (explicit only)
  if (isExplicit(key)) return snd[key];

  // Aliases (explicit only)
  if (key === "dominoPlay" && isExplicit("place")) return snd.place;
  if (key === "place" && isExplicit("dominoPlay")) return snd.dominoPlay;

  if (key === "roundEnd" && isExplicit("roundWin")) return snd.roundWin;
  if (key === "gameWin" && isExplicit("roundWin")) return snd.roundWin;
  if (key === "gameLose" && isExplicit("roundLose")) return snd.roundLose;

  return null;
}

function getPackThemeListRel(){
  const p = activePack;
  if (!p) return null;

  if (Array.isArray(p?.sounds?.themes) && p.sounds.themes.length) return p.sounds.themes;
  if (Array.isArray(p?.music?.themes) && p.music.themes.length) return p.music.themes;
  if (Array.isArray(p?.themes) && p.themes.length) return p.themes;
  return null;
}

// Rebuild sound map + playlist from current activePack.
// Call this after ensureActivePackLoaded().
function rebuildAudioFromActivePack({ restartMusic = true } = {}) {
  const next = {};
  const pack = activePack;

  // SFX keys we use in code (plus back-compat keys)
  const keys = Object.keys(CLASSIC_SOUND).filter(k => k !== "themes");
  for (const k of keys) {
    const rel = getPackSoundRel(k);
    next[k] = rel ? resolvePackAsset(pack, rel) : CLASSIC_SOUND[k];
  }

  // Theme playlist
  const relList = getPackThemeListRel();
  const list = Array.isArray(relList) && relList.length
    ? relList.map(r => resolvePackAsset(pack, r)).filter(Boolean)
    : (CLASSIC_SOUND.themes || []).slice();

  shuffleInPlace(list);
  next.themes = list;

  SOUND = next;
  currentThemeIdx = 0;

  if (restartMusic) {
    // Instant theme switch: stop old track, start a new one from the new playlist.
    stopMusic({ fadeMs: 220 });
    // Let the stop settle before starting
    setTimeout(() => ensureBackgroundMusic(), 0);
  }
}

// Boot shuffle (classic playlist) — pack-specific rebuild happens after pack load.
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
// BEGIN: Accessibility settings (text / contrast / motion)
// =========================
function getUiSettings(){
  const s = readMenuSettings?.() || {};
  const textSizeRaw = String(s.uiTextSize || s.textSize || "md").toLowerCase();
  const textSize = (["md","lg","xl"].includes(textSizeRaw) ? textSizeRaw : "md");
  const highContrast = s.uiHighContrast === true || s.highContrast === true;
  const reduceMotion = s.uiReduceMotion === true || s.reduceMotion === true;
  return { textSize, highContrast, reduceMotion };
}

function applyAccessibilitySettings(){
  const { textSize, highContrast, reduceMotion } = getUiSettings();
  const body = document.body;
  if (!body) return;

  body.classList.remove("ui-text-md", "ui-text-lg", "ui-text-xl");
  body.classList.add(`ui-text-${textSize}`);
  body.classList.toggle("ui-contrast", !!highContrast);
  body.classList.toggle("reduce-motion", !!reduceMotion);

  if (uiTextSizeSelect) uiTextSizeSelect.value = textSize;
  if (uiHighContrastToggle) uiHighContrastToggle.checked = !!highContrast;
  if (uiReduceMotionToggle) uiReduceMotionToggle.checked = !!reduceMotion;
}

function saveAccessibilitySettings(next = {}){
  const s = readMenuSettings?.() || {};
  if (next.textSize != null) s.uiTextSize = String(next.textSize);
  if (next.highContrast != null) s.uiHighContrast = !!next.highContrast;
  if (next.reduceMotion != null) s.uiReduceMotion = !!next.reduceMotion;
  writeMenuSettings?.(s);
  applyAccessibilitySettings();
}
// =========================
// END: Accessibility settings (text / contrast / motion)
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

// Accessibility control wiring
uiTextSizeSelect?.addEventListener("change", () => {
  saveAccessibilitySettings({ textSize: uiTextSizeSelect.value || "md" });
  paint();
});
uiHighContrastToggle?.addEventListener("change", () => {
  saveAccessibilitySettings({ highContrast: !!uiHighContrastToggle.checked });
  paint();
});
uiReduceMotionToggle?.addEventListener("change", () => {
  saveAccessibilitySettings({ reduceMotion: !!uiReduceMotionToggle.checked });
  paint();
});

applyAccessibilitySettings();
// =========================
// END: In-Game Speaker Toggle
// =========================

// =========================
// BEGIN: In-Game Volume Sliders (SFX + Music)
// =========================
(function initGameVolumeSliders(){
  const pop = document.getElementById("gameAudioPopover");
  const sfx = document.getElementById("gameSfxVol");
  const mus = document.getElementById("gameMusicVol");
  const toggle = document.getElementById("gameAudioToggle");

  if (!pop || !sfx || !mus) return;

  // Don’t let slider clicks toggle the 3-state speaker mode
  ["click","mousedown","pointerdown","touchstart"].forEach((evt)=>{
    pop.addEventListener(evt, (e)=> e.stopPropagation(), { passive: true });
    sfx.addEventListener(evt, (e)=> e.stopPropagation(), { passive: true });
    mus.addEventListener(evt, (e)=> e.stopPropagation(), { passive: true });
  });

  function clamp01(n){
    n = Number(n);
    if (!isFinite(n)) n = 0;
    return Math.max(0, Math.min(1, n));
  }

  function loadFromSettings(){
    const s = readMenuSettings?.() || {};
    sfx.value = String(clamp01(s.sfxVolume ?? 0.8));
    mus.value = String(clamp01(s.musicVolume ?? 0.55));
  }

  function saveToSettings(){
    const s = readMenuSettings?.() || {};
    s.sfxVolume = clamp01(sfx.value);
    s.musicVolume = clamp01(mus.value);
    writeMenuSettings?.(s);

    // Apply immediately (no drama)
    syncMenuDrivenSettings?.({ fadeMs: 0 });
  }

  sfx.addEventListener("input", saveToSettings);
  mus.addEventListener("input", saveToSettings);

  // Also refresh slider positions after mode changes (speaker click)
  toggle?.addEventListener("click", () => {
    try { loadFromSettings(); } catch {}
  });

  loadFromSettings();
})();
// =========================
// END: In-Game Volume Sliders (SFX + Music)
// =========================

// =========================
// BEGIN: Audio Popover Portal (fix z-index under scorebar)
// =========================
(function portalAudioPopover(){
  const btn = document.getElementById("gameAudioToggle");
  const pop = document.getElementById("gameAudioPopover");
  if (!btn || !pop) return;

  // Move popover to <body> so it escapes HUD stacking contexts
  if (pop.parentElement !== document.body){
    document.body.appendChild(pop);
  }
  pop.classList.add("game-audio-popover--portal");

  let open = false;
  let hideTimer = null;

  function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

  function place(){
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth || 220;
    const h = pop.offsetHeight || 120;

    // Right-align to button, but stay on screen
    const left = clamp(r.right - w, 8, window.innerWidth - w - 8);
    // Prefer below the button; if near bottom, float above
    let top = r.bottom + 10;
    if (top + h > window.innerHeight - 8){
      top = Math.max(8, r.top - h - 10);
    }

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  function show(){
    clearTimeout(hideTimer);
    open = true;
    pop.classList.add("is-open");
    place();
  }

  function hide(){
    open = false;
    pop.classList.remove("is-open");
  }

  function scheduleHide(){
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 140);
  }

  // Hover behavior
  btn.addEventListener("mouseenter", show);
  btn.addEventListener("mouseleave", scheduleHide);
  pop.addEventListener("mouseenter", show);
  pop.addEventListener("mouseleave", scheduleHide);

  // Keyboard behavior
  btn.addEventListener("focus", show);
  btn.addEventListener("blur", scheduleHide);

  // Keep positioned
  window.addEventListener("resize", ()=> { if (open) place(); });
  window.addEventListener("scroll", ()=> { if (open) place(); }, true);
})();
// =========================
// END: Audio Popover Portal
// =========================


  // =========================
  // BEGIN: Custom Select Overlay wiring (Android WebView dropdown fix)
  // =========================
  (function initGameCustomSelectOverlay() {
    const overlay = document.getElementById("selectOverlay");
    const titleEl = document.getElementById("selectTitle");
    const listEl = document.getElementById("selectList");
    const closeBtn = document.getElementById("selectCloseBtn");
    const closeX = document.getElementById("selectCloseX");

    if (!overlay || !titleEl || !listEl) return;

    const isAndroidWebView = () => {
      const ua = navigator.userAgent || "";
      return /Android/i.test(ua) && (/\swv\)/i.test(ua) || /\bwv\b/i.test(ua) || !!window.Capacitor);
    };

    const escHtml = (s) =>
      String(s ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c]));

    function closePicker() {
      overlay.classList.add("hidden");
      listEl.innerHTML = "";
    }

    // Portal to <body> so the picker escapes menu/modal stacking contexts.
    try {
      if (document.body && overlay.parentElement !== document.body) {
        document.body.appendChild(overlay);
      }
    } catch {}

    function openPicker(selectEl, title) {
      if (!selectEl || selectEl.disabled) return;

      titleEl.textContent = title || "Choose an option";
      const current = String(selectEl.value ?? "");
      listEl.innerHTML = "";

      Array.from(selectEl.options || []).forEach((opt) => {
        if (!opt || opt.disabled) return;

        const v = String(opt.value ?? "");
        const label = String(opt.textContent || opt.label || v);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "select-item";
        btn.innerHTML =
          `<span class="select-item__label">${escHtml(label)}</span>` +
          `<span class="select-item__mark">${v === current ? "◉" : "○"}</span>`;

        btn.addEventListener("click", () => {
          selectEl.value = v;
          try {
            selectEl.dispatchEvent(new Event("change", { bubbles: true }));
          } catch {}
          closePicker();
        });

        listEl.appendChild(btn);
      });

      overlay.classList.remove("hidden");
    }

    function wireSelect(selectEl, title) {
      if (!selectEl) return;

      const intercept = (e) => {
        if (selectEl.disabled) return;

        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") {
          e.stopImmediatePropagation();
        }

        try {
          selectEl.blur();
        } catch {}

        openPicker(selectEl, title);
      };

      // Intercept the SELECT itself, matching the working index.html pattern
      selectEl.addEventListener("pointerdown", intercept, { passive: false });
      selectEl.addEventListener("click", intercept, { passive: false });
      selectEl.addEventListener("mousedown", intercept, { passive: false });
      selectEl.addEventListener("touchstart", intercept, { passive: false });

      selectEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          intercept(e);
        }
      });

      // Optional: make the whole row clickable too
      const row =
        selectEl.closest(".ctrl") ||
        selectEl.closest("label") ||
        selectEl.parentElement;

      if (row && !row.dataset.selectRowWired) {
        row.dataset.selectRowWired = "1";
        row.addEventListener("pointerdown", intercept, { passive: false });
        row.addEventListener("click", intercept, { passive: false });
      }
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePicker();
    });

    closeBtn?.addEventListener("click", closePicker);
    closeX?.addEventListener("click", closePicker);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
        closePicker();
      }
    });

    if (!isAndroidWebView()) return;

    wireSelect(aiDifficultySelect, "AI Difficulty");
    wireSelect(dominoSkinSelect, "Theme");
    wireSelect(uiTextSizeSelect, "Text Size");
    wireSelect(logFilterSelect, "Log Filter");
  })();
  // =========================
  // END: Custom Select Overlay wiring (Android WebView dropdown fix)
  // =========================

  /* ---------- Overlay helpers ---------- */

  function showOverlay(el) { el?.classList.remove("hidden"); }
  function hideOverlay(el) { el?.classList.add("hidden"); }
  function isVisible(el) { return !!el && !el.classList.contains("hidden"); }

  function isAnyModalOpen() {
    const selectOverlay = document.getElementById("selectOverlay");
    return isVisible(gameOverOverlay) || isVisible(roundOverOverlay) || isVisible(rulesOverlay) || isVisible(settingsOverlay) || isVisible(logOverlay) || isVisible(instructionsOverlay) || isVisible(creditsOverlay) || isVisible(quitOverlay) || isVisible(scoreboardOverlay) || isVisible(selectOverlay);
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

      // =========================
      // BEGIN: Difficulty sync (AI strength + hints + Chaos mode)
      // =========================
      function normalizeDifficulty(v){
        const s = String(v ?? "").toLowerCase().trim();
        if (s === "hard" || s === "chaos" || s === "normal") return s;
        return "normal";
      }

      // Pull from menu/settings storage first (so app bundle + localhost behave the same)
      const __menuSettings = (typeof readMenuSettings === "function") ? (readMenuSettings() || {}) : {};
      let aiDifficulty = normalizeDifficulty(__menuSettings.aiDifficulty ?? __menuSettings.difficulty ?? aiDifficultySelect?.value ?? "normal");

      // Keep both selects (top menu + settings modal) in sync
      if (aiDifficultySelect) aiDifficultySelect.value = aiDifficulty;
      if (settingsAiSelect) settingsAiSelect.value = aiDifficulty;

      function persistDifficulty(){
        try{
          const s = (typeof readMenuSettings === "function") ? (readMenuSettings() || {}) : {};
          s.aiDifficulty = aiDifficulty;
          // Back-compat alias (harmless if unused)
          s.difficulty = aiDifficulty;
          if (typeof writeMenuSettings === "function") writeMenuSettings(s);
        }catch{}
      }
      // =========================
      // END: Difficulty sync (AI strength + hints + Chaos mode)
      // =========================

      let autoPlayP0 = false;
      let autoPlayIntervalId = null;

      // High Scores: capture once per match (reset on new game)
      let highScoreCaptured = false;

      let engine = new GameEngine({ maxPip: 12, playerCount: 4, handSize: 15, rules: activeRules });
      let state = engine.newGame();


      // =========================
      // BEGIN: Hand tile flip preference (double-tap to flip)
      // =========================
      const HAND_FLIP_KEY = "d12_handFlipKeys_v1";
      let handFlipKeys = new Set();

      function pairKeyFromValues(a, b){
        const lo = Math.min(Number(a), Number(b));
        const hi = Math.max(Number(a), Number(b));
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) return "";
        return `${lo}-${hi}`;
      }

      function loadHandFlipKeys(){
        try{
          const raw = localStorage.getItem(HAND_FLIP_KEY);
          const arr = raw ? JSON.parse(raw) : null;
          if (!Array.isArray(arr)) return new Set();
          return new Set(arr.map(String).filter(Boolean));
        }catch{
          return new Set();
        }
      }

      function saveHandFlipKeys(){
        try{
          localStorage.setItem(HAND_FLIP_KEY, JSON.stringify(Array.from(handFlipKeys)));
        }catch{}
      }

      function toggleHandFlip(tileId){
        try{
          const hand = state?.players?.[0]?.hand;
          if (!Array.isArray(hand)) return;

          const tid = String(tileId ?? "");
          const t = hand.find(x => String(x?.id) === tid);
          if (!t) return;

          const key = pairKeyFromValues(t.a, t.b);
          if (!key) return;

          if (handFlipKeys.has(key)) handFlipKeys.delete(key);
          else handFlipKeys.add(key);

          saveHandFlipKeys();
        }catch{}
      }

      function isHandTileFlipped(tile){
        try{
          const key = pairKeyFromValues(tile?.a, tile?.b);
          return !!(key && handFlipKeys.has(String(key)));
        }catch{
          return false;
        }
      }

      handFlipKeys = loadHandFlipKeys();
      // =========================
      // END: Hand tile flip preference (double-tap to flip)
      // =========================


      function applyDifficultyToEngine(){
        // If your engine has Chaos mode support (setDifficulty), re-init its per-round chaos state.
        try{
          if (engine && typeof engine.setDifficulty === "function"){
            state = engine.setDifficulty(aiDifficulty);
          }
        }catch{}
      }

      // Apply immediately on boot so Chaos mode starts “armed”
      applyDifficultyToEngine();

      function setDifficulty(next){
        const v = normalizeDifficulty(next);
        if (!v) return;
        aiDifficulty = v;

        if (aiDifficultySelect) aiDifficultySelect.value = v;
        if (settingsAiSelect) settingsAiSelect.value = v;

        persistDifficulty();
        applyDifficultyToEngine();

        // Repaint + re-kick AI (if needed)
        try{ paint(); }catch{}
        try{ ensureAI(); }catch{}
      }

      // Wire changes once (native select or custom overlay dispatches "change")
      if (aiDifficultySelect && !aiDifficultySelect.dataset.wiredDifficulty){
        aiDifficultySelect.dataset.wiredDifficulty = "1";
        aiDifficultySelect.addEventListener("change", () => setDifficulty(aiDifficultySelect.value));
      }
      if (settingsAiSelect && !settingsAiSelect.dataset.wiredDifficulty){
        settingsAiSelect.dataset.wiredDifficulty = "1";
        settingsAiSelect.addEventListener("change", () => setDifficulty(settingsAiSelect.value));
      }

            // =========================
    // BEGIN: Round-start auto-draw notice (starter double not in opening hands)
    // =========================
    var roundSetupNotice = "";

    function clearRoundSetupNotice() {
      roundSetupNotice = "";
    }

    function captureRoundSetupNotice(nextState) {
      roundSetupNotice = "";

      try {
        const log = Array.isArray(nextState?.log) ? nextState.log : [];
        const foundLine = [...log].reverse().find((line) =>
          /Starter double\s+\d+\|\d+\s+was not in hands\. Found by drawing: P\d+\./.test(String(line || ""))
        );

        if (!foundLine) return;

        const starterPidMatch = String(foundLine).match(/Found by drawing: P(\d+)\./);
        const starterPid = starterPidMatch ? Number(starterPidMatch[1]) : null;

        const requiredPip = Number(
          nextState?.mexicanTrain?.tiles?.[0]?.a ??
          nextState?.mexicanTrain?.openEnd ??
          ""
        );

        const players = Array.isArray(nextState?.players) ? nextState.players : [];
        const baseHandSize = Number(engine?.handSize ?? 15);
        const yourHandStart = Number(players?.[0]?.hand?.length ?? baseHandSize);

        let totalExtra = 0;
        const detailParts = [];

        for (const p of players) {
          const handLen = Array.isArray(p?.hand) ? p.hand.length : 0;
          const baseline = (starterPid !== null && Number(p?.id) === starterPid)
            ? Math.max(0, baseHandSize - 1)
            : baseHandSize;
          const extra = Math.max(0, handLen - baseline);

          totalExtra += extra;
          if (extra > 0) {
            detailParts.push(`${Number(p?.id) === 0 ? "You" : `P${p.id}`} +${extra}`);
          }
        }

        const totalExtraText = totalExtra === 1 ? "1 extra tile" : `${totalExtra} extra tiles`;
        const detailText = detailParts.length ? ` (${detailParts.join(", ")})` : "";

        roundSetupNotice =
          `Round setup: nobody was dealt ${requiredPip}|${requiredPip}, so the game auto-drew one tile per player until it was found. ` +
          `${totalExtraText} were added before play began${detailText}. ` +
          `That is why your hand started this round at ${yourHandStart} tiles.`;
      } catch {
        roundSetupNotice = "";
      }
    }
    // =========================
    // END: Round-start auto-draw notice (starter double not in opening hands)
    // =========================


      window.__D12 = { get state(){ return state; }, get engine(){ return engine; } };

      highScoreCaptured = false;
      resetStableAiNames({ force: false });
      applyPlayerNamesToState();
      captureRoundSetupNotice(state);

      let selectedTileId = null;

      // BEGIN: Selection + play wiring
      function selectTile(tileId) {
      // toggle select
      if (selectedTileId === tileId) selectedTileId = null;
      else selectedTileId = tileId;

      // Do NOT repaint the whole board here.
      // Full repaint was helping trigger train scroll resets.
      // Just re-render the hand so selection highlight updates.
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
        boardTrainScroll,
        onToggleHandFlip: toggleHandFlip,
        isHandTileFlipped,
        onHandReorder: setHandOrder,
        requestPaint: paint,
        onSelectTile: selectTile,
        onPlaySelectedToTarget: playSelectedToTarget,
        noHints: (String(aiDifficulty || "").trim().toLowerCase() === "hard" || String(aiDifficulty || "").trim().toLowerCase() === "chaos"),
        dimUnplayable: !((String(aiDifficulty || "").trim().toLowerCase() === "hard") || (String(aiDifficulty || "").trim().toLowerCase() === "chaos")),
        highlightPlayable: !((String(aiDifficulty || "").trim().toLowerCase() === "hard") || (String(aiDifficulty || "").trim().toLowerCase() === "chaos")),
        hideOptionsHud: ((String(aiDifficulty || "").trim().toLowerCase() === "hard") || (String(aiDifficulty || "").trim().toLowerCase() === "chaos")),
      });
    }

  function playSelectedToTarget(target) {
    if (state.matchOver || state.roundOver || isAnyModalOpen()) return;
    if (state.currentPlayer !== 0) return;
    if (!selectedTileId) return;

    try {
      clearRoundSetupNotice();
      const prev = state;
      state = engine.playTile(0, selectedTileId, target);

      // sfx + pending-double transitions (if you have them)
      try { playSfx(SOUND.dominoPlay, { volume: 0.80 }); } catch {}
      try { onStateTransitionForSounds(prev, state); } catch {}

      // If engine didn’t advance but no pending double, you can pass (depends on your rules)
      // NOTE: This mirrors your AI logic pattern; keeps game moving.
      if (state.pendingDouble == null && state.currentPlayer === 0) {
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
      // Per-train horizontal scroll persistence (prevents scroll jumping on re-render)
      const boardTrainScroll = new Map();
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
        // Load pack manifest for the current skin (OPFS-installed first, then /packs/<skin>/)
    async function ensureActivePackLoaded(skin) {
      const key = String(skin || "default").toLowerCase();

      // Prefer OPFS-installed pack if present
      try{
        if (PackStore?.isSupported?.()){
          await PackStore.init();
          if (PackStore.has(key)){
            activePack = await PackStore.loadPack(key);
            applyPackUI(activePack);
            return activePack;
          }
        }
      }catch(err){
        console.warn("[pack] PackStore load failed; falling back to web packs/", err);
      }

      // Fallback: load from bundled /packs/<folder>/
      const folder = key;
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
    if (optionsApplyBtn) {
      optionsApplyBtn.disabled = true;
      optionsApplyBtn.style.display = "none";
    }

    /* ---------- Name stability ---------- */

      function resetStableAiNames({ force = false } = {}) {
      const s = readMenuSettings() || {};
      if (!force && Array.isArray(s.aiNamePool) && s.aiNamePool.length) return;

      const names = [
        "Puppet",
        "Trip",
        "Conductor Carl",
        "Switchman Sam",
        "Boxcar Bill",
        "Coal Car Cathy",
        "Caboose Bruce",
        "Rail Yard Rita",
        "Turntable Tina",
        "Signal Sid",
        "Whistle Wanda",
        "Steambeam Steve",
        "Ballast Bob",
        "Tie Plate Tate",
        "Spike Mike",
        "Sleeper Sheila",
        "Redlight Reggie",
        "Greenlight Gwen",
        "Junction Judy",
        "Siding Simon",
        "Mainline Max",
        "Crossing Casey",
        "Track Jack",
        "Railin' Ray",
        "ChooChoo Cheyenne",
        "Hobo Hank",
        "Freight Nate",
        "Diesel Deb",
        "Steam Queen",
        "Locomotive Loki",
        "The Roundhouse",
        "Yard Boss Yvette",
        "Ticket Taker Tori",
        "Last Stop Lou",
        "Express Jessie",
        "Platform Pam",
        "Trestle Tess",
        "Coupler Cooper",
        "Gandy Dancer Dan",
        "The Sleeper Agent",
        "Domino Danny",
        "Pip Poppin' Penny",
        "Double Trouble",
        "Spinner Winner",
        "Train of Pains",
        "Pipnado",
        "The BoneYard Baron",
        "Tile Tyler",
        "Pip Smith",
        "The Stubby Double",
        "Shortstack Sally",
        "Powerhouse Puff Julie",
        "Waller the Baller",
        "Boxcar Berry",
        "Sherrie Von Track Attack",
        "Douglas McChuglas",
        "Kenny the Track Snack",
        "End-to-End Eddie",
        "Blank Frank",
        "Lucky Loco",
        "The Connector",
        "Drawbar Debra",
        "Switchback Sue",
        "Station Master Stan",
        "Railroad Ron",
        "Crosstie Chrissy"
      ];

      // Store under both keys for compatibility
      s.aiNamePool = names;
      s.aiNames = names;

        if (force) delete s.aiSeatNames;
        writeMenuSettings(s);
    }

    function applyPlayerNamesToState() {
      const s = readMenuSettings() || {};
      const playerName = String(s.playerName || s.name || "Player");

      state.players?.forEach((p) => {
        if (p.id === 0) p.name = playerName;
      });

      const pool = Array.isArray(s.aiNamePool) && s.aiNamePool.length
        ? s.aiNamePool
        : (Array.isArray(s.aiNames) && s.aiNames.length ? s.aiNames : []);

      if (!pool.length || !Array.isArray(state.players)) return;

      // Keep AI names stable for the current saved game/session,
      // but don't force the same seat names every new game forever.
      let seatNames = Array.isArray(s.aiSeatNames) ? s.aiSeatNames.slice() : [];

      const needCount = Math.max(0, state.players.length - 1);

      if (seatNames.length < needCount) {
        const shuffled = pool.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        seatNames = shuffled.slice(0, needCount);

        // Fallback if pool is somehow shorter than AI count
        while (seatNames.length < needCount) {
          seatNames.push(pool[seatNames.length % pool.length]);
        }

        s.aiSeatNames = seatNames;
        writeMenuSettings(s);
      }

      state.players?.forEach((p) => {
        if (p.id !== 0) p.name = seatNames[p.id - 1] || pool[(p.id - 1) % pool.length];
      });
    }

    /* ---------- UI helpers ---------- */

    function canHumanPlayAny() {
      const legal = engine.getLegalMoves(0);
      return Array.isArray(legal) && legal.length > 0;
    }



    // =========================
  // BEGIN: Pending-double truthiness fix (options + pass + HUD tone)
  // =========================
  function canHumanPass() {
    if (state.currentPlayer !== 0) return false;

    if (state.pendingDouble != null) {
      const legal = engine.getLegalMoves(0);
      if (legal.length > 0) return false;
      return state.deck.length === 0 || state.turnHasDrawn;
    }

    if (state.turnHasPlayed) return true;

    const legal = engine.getLegalMoves(0);
    if (legal.length > 0) return false;

    return state.deck.length === 0 || state.turnHasDrawn;
  }

  // =========================
  // BEGIN: Options text (handles pending double messaging)
  // =========================
  function computeOptionsText() {
    if (state.matchOver) return `Match over.`;
    if (state.roundOver) return `Round over — waiting to start next round.`;

    if (roundSetupNotice) {
      if (state.currentPlayer !== 0) {
        return `${roundSetupNotice} Waiting for opponents… (P${state.currentPlayer})`;
      }
      return roundSetupNotice;
    }

    if (state.currentPlayer !== 0) return `Waiting for opponents… (P${state.currentPlayer})`;

    // Pending double: UI should always mention it, even when you have no moves.
    if (state.pendingDouble != null) {
      const legal = engine.getLegalMoves(0);

      if (legal.length > 0) return `A double needs to be satisfied.`;

      if (state.deck.length > 0 && !state.turnHasDrawn) {
        return `A double needs to be satisfied — No match. Draw.`;
      }

      return `A double needs to be satisfied — No match and no draw. You may Pass.`;
    }

    const legal = engine.getLegalMoves(0);
    if (legal.length > 0) return `You have playable tiles.`;
    if (state.deck.length > 0 && !state.turnHasDrawn) return `No playable tiles. Click Draw.`;
    return `No playable tiles and no draw. You may Pass.`;
  }
  // =========================
  // END: Options text (handles pending double messaging)
  // =========================

  function computeOptionsTone() {
    // Neutral when it's not the human's active decision point
    if (state.matchOver || state.roundOver) return "neutral";
    if (roundSetupNotice) return "warn";
    if (state.currentPlayer !== 0) return "neutral";

    try {
      const legal = engine.getLegalMoves(0) || [];

      if (state.pendingDouble != null) {
        if (legal.length > 0) return "good";
        if (state.deck.length > 0 && !state.turnHasDrawn) return "warn";
        return "bad";
      }

      if (legal.length > 0) return "good";
      if (state.deck.length > 0 && !state.turnHasDrawn) return "warn";
      return "bad";
    } catch {
      return "neutral";
    }
  }
  // =========================
  // END: Pending-double truthiness fix (options + pass + HUD tone)
  // =========================

    function setHudPillTone(el, tone) {
      if (!el) return;
      el.classList.remove("hud-pill--good", "hud-pill--warn", "hud-pill--bad", "hud-pill--neutral");
      const t = String(tone || "neutral");
      if (t === "good") el.classList.add("hud-pill--good");
      else if (t === "warn") el.classList.add("hud-pill--warn");
      else if (t === "bad") el.classList.add("hud-pill--bad");
      else el.classList.add("hud-pill--neutral");
    }

    function bumpHudPill(el) {
      if (!el) return;
      el.classList.remove("hud-pill--bump");
      // Force reflow so the animation can restart
      void el.offsetWidth;
      el.classList.add("hud-pill--bump");
    }
    // =========================
    // END: Scorebar "Your Options" tone + bump animation
    // =========================



    // =========================
    // BEGIN: Chaos Caboose toast (Chaos mode event cards)
    // =========================
    let __chaosToastEl = null;
    let __chaosToastLastId = null;
    let __chaosToastTO = null;

      function ensureChaosToast(){
      if (__chaosToastEl) return __chaosToastEl;

      // Style once
      if (!document.getElementById("d12ChaosToastStyle")){
        const st = document.createElement("style");
        st.id = "d12ChaosToastStyle";
        st.textContent = `
          #d12ChaosToast{
            position: fixed;
            left: 12px;
            right: 12px;
            top: calc(env(safe-area-inset-top, 0px) + 12px);
            z-index: 2147483647;
            display: none;
            pointer-events: none;
          }
          #d12ChaosToast .toast{
            pointer-events: auto;
            max-width: 760px;
            margin: 0 auto;
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.18);
            background: rgba(2, 6, 23, 0.92);
            box-shadow: 0 12px 40px rgba(0,0,0,0.45);
            padding: 12px 14px;
          }
          #d12ChaosToast .toast-head{
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 6px;
          }
          #d12ChaosToast .toast-title{
            font-weight: 800;
            letter-spacing: 0.2px;
            font-size: 14px;
            opacity: 0.95;
          }
          #d12ChaosToast .toast-close{
            border: 0;
            background: transparent;
            color: inherit;
            font-size: 18px;
            line-height: 1;
            cursor: pointer;
            opacity: 0.9;
          }
          #d12ChaosToast .toast-body{
            white-space: pre-wrap;
            font-size: 14px;
            opacity: 0.92;
            line-height: 1.25;
          }
          #d12ChaosToast .toast-actions{
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 10px;
          }
          #d12ChaosToast .toast-ok{
            border: 1px solid rgba(255,255,255,0.20);
            background: rgba(255,255,255,0.10);
            color: inherit;
            border-radius: 10px;
            padding: 8px 12px;
            cursor: pointer;
            font-weight: 700;
          }
          #d12ChaosToast .toast-ok:active{
            transform: translateY(1px);
          }
        `;
        document.head.appendChild(st);
      }

      const wrap = document.createElement("div");
      wrap.id = "d12ChaosToast";
      wrap.innerHTML = `
        <div class="toast" role="status" aria-live="polite">
          <div class="toast-head">
            <div class="toast-title" id="d12ChaosToastTitle">🚂 Incoming message from the Chaos Caboose!</div>
            <button class="toast-close" type="button" aria-label="Close">✕</button>
          </div>
          <div class="toast-body" id="d12ChaosToastBody"></div>
          <div class="toast-actions">
            <button class="toast-ok" type="button">Got it</button>
          </div>
        </div>
      `;

      document.body.appendChild(wrap);

      const closeBtn = wrap.querySelector(".toast-close");
      const okBtn = wrap.querySelector(".toast-ok");

      closeBtn?.addEventListener("click", hideChaosToast);
      okBtn?.addEventListener("click", hideChaosToast);

      __chaosToastEl = wrap;
      return __chaosToastEl;
    }

    function hideChaosToast(){
      if (__chaosToastTO){ clearTimeout(__chaosToastTO); __chaosToastTO = null; }
      if (__chaosToastEl) __chaosToastEl.style.display = "none";
    }

    function showChaosToast({ title, body, ms = 0 } = {}){
      const el = ensureChaosToast();
      if (!el) return;

      // Append last to win stacking fights
      try{ document.body.appendChild(el); }catch{}

      const t = el.querySelector("#d12ChaosToastTitle");
      const b = el.querySelector("#d12ChaosToastBody");
      if (t) t.textContent = title || "🚂 Incoming message from the Chaos Caboose!";
      if (b) b.textContent = body || "";

      el.style.display = "block";

      // Default: do NOT auto-hide (requires acknowledgement).
      // If ms > 0, we still support auto-hide as an option.
      if (__chaosToastTO){ clearTimeout(__chaosToastTO); __chaosToastTO = null; }
      const n = Number(ms);
      if (Number.isFinite(n) && n > 0){
        __chaosToastTO = setTimeout(hideChaosToast, Math.max(1200, n));
      }
    }

  function maybeShowChaosCabooseToast(){
      const ann = state?.chaos?.announce;
      if (!ann) return;

      // Prefer engine id for dedupe; fallback to a signature if id missing
      const id = String(ann.id ?? "");
      const sig = id || String(ann.body ?? ann.text ?? ann.title ?? "").slice(0, 80);
      if (sig && sig === __chaosToastLastId) return;
      __chaosToastLastId = sig;

      // Engine supplies full details in ann.body (card + rules + duration)
      const body = String(ann.body ?? ann.text ?? "").trim();

      showChaosToast({
        title: "🚂 Incoming message from the Chaos Caboose!",
        body: body || "(Chaos Caboose forgot to include the card text 🤷‍♂️)"
      });
    }
    // =========================
    // END: Chaos Caboose toast
    // =========================


    function renderScoreBarHTML() {
      return "";
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

    function getScoreboardRounds() {
      const roundsTotal = Number(state?.roundsTotal ?? 13);
      const maxPip = Number(state?.maxPip ?? 12);
      const hist = Array.isArray(state?.matchHistory) ? state.matchHistory : [];
      const byRound = new Map(hist.map((r) => [Number(r?.round ?? 0), r]));

      return Array.from({ length: roundsTotal }, (_, idx) => {
        const roundNum = idx + 1;
        const pip = maxPip - idx;
        return {
          roundNum,
          label: `${pip}|${pip}`,
          summary: byRound.get(roundNum) || null,
        };
      });
    }

    function buildScoreboardHTML() {
      const players = Array.isArray(state?.players) ? state.players : [];
      if (!players.length) {
        return `<div class="muted">No scoreboard data yet.</div>`;
      }

      const rounds = getScoreboardRounds();
      const histCount = (Array.isArray(state?.matchHistory) ? state.matchHistory.length : 0);
      const completeRounds = state?.roundOver ? Math.max(histCount, Number(state?.round ?? 0)) : histCount;
      const sortedTotals = [...players].sort((a, b) => Number(a?.score ?? 0) - Number(b?.score ?? 0));
      const leaderIds = new Set();
      if (sortedTotals.length) {
        const leadScore = Number(sortedTotals[0]?.score ?? 0);
        sortedTotals.forEach((p) => {
          if (Number(p?.score ?? 0) === leadScore) leaderIds.add(Number(p?.id ?? -1));
        });
      }

      const headerCells = players.map((p) => {
        const pid = Number(p?.id ?? -1);
        const isLeader = leaderIds.has(pid);
        return `
          <th class="scoreboard-name ${isLeader ? "is-leader" : ""}" scope="col">
            <span>${escapeHtml(p?.name || `P${pid}`)}</span>
          </th>`;
      }).join("");

      const bodyRows = rounds.map((r) => {
        const isPlayed = !!r.summary;
        const cells = players.map((p) => {
          const pid = Number(p?.id ?? -1);
          const add = r.summary?.roundAdds?.find((x) => Number(x?.id ?? x?.playerId ?? -1) === pid) || null;
          if (!add) return `<td class="scoreboard-cell scoreboard-cell--empty">—</td>`;
          const isWinner = Array.isArray(r.summary?.winners) && r.summary.winners.some((w) => Number(w) === pid);
          const added = Number(add?.added ?? add?.points ?? 0);
          return `
            <td class="scoreboard-cell ${isWinner ? "is-winner" : ""}">
              <span class="scoreboard-cell__value">${isWinner ? "★ " : ""}${added}</span>
            </td>`;
        }).join("");

        return `
          <tr class="${isPlayed ? "" : "is-future"}">
            <th class="scoreboard-round" scope="row">${escapeHtml(r.label)}</th>
            ${cells}
          </tr>`;
      }).join("");

      const totalCells = players.map((p) => {
        const pid = Number(p?.id ?? -1);
        const isLeader = leaderIds.has(pid);
        const score = Number(p?.score ?? 0);
        return `
          <td class="scoreboard-total ${isLeader ? "is-leader" : ""}">
            <span>${isLeader ? "🏆 " : ""}${score}</span>
          </td>`;
      }).join("");

      return `
        <div class="scoreboard-wrap">
          <div class="scoreboard-caption">
            Completed rounds: ${completeRounds}/${Number(state?.roundsTotal ?? 13)}
          </div>
          <table class="scoreboard-table" aria-label="Match scoreboard">
            <thead>
              <tr>
                <th class="scoreboard-corner" scope="col">Round</th>
                ${headerCells}
              </tr>
            </thead>
            <tbody>
              ${bodyRows}
            </tbody>
            <tfoot>
              <tr>
                <th class="scoreboard-round scoreboard-round--total" scope="row">Total</th>
                ${totalCells}
              </tr>
            </tfoot>
          </table>
          <div class="scoreboard-legend muted">★ = lowest score that round &nbsp; • &nbsp; 🏆 = current match leader</div>
        </div>`;
    }

    function refreshScoreboardModal() {
      if (!scoreboardBody) return;
      scoreboardBody.innerHTML = buildScoreboardHTML();
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
          if (state.pendingDouble == null && state.currentPlayer === pid) {
            state = engine.pass(pid);
          }
        } else {
          // No play moves
          if (state.deck.length > 0 && !state.turnHasDrawn) {
            state = engine.draw(pid);
            try { playSfx(SOUND.draw, { volume: 0.70 }); } catch {}
          } else {
            state = engine.pass(pid);
          }
        }

        applyPlayerNamesToState();
        paint();

        // Small AI “thinking” delay
        await sleep(Math.random() * 450 + 550);
      } catch (err) {
        const msg = String(err?.message || err);

        // ✅ IMPORTANT: If the engine ended the round/match during an AI step,
        // paint once so the stalemate/round-over overlay appears immediately.
        if (msg.includes("Round is over") || msg.includes("Match is over") || state.roundOver || state.matchOver) {
          try {
            applyPlayerNamesToState();
            paint();
          } catch {}
          return;
        }

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
          const move =
            (picked &&
              legal.some(
                (m) =>
                  m.tileId === picked.tileId &&
                  targetsEqual(m.target, picked.target)
              ))
              ? picked
              : legal[0];

          const prevState = state;
          state = engine.playTile(0, move.tileId, move.target);
          playSfx(SOUND.dominoPlay, { volume: 0.80 });
          onStateTransitionForSounds(prevState, state);

          if (state.pendingDouble == null && state.currentPlayer === 0) state = engine.pass(0);
        } else {
          if (state.deck.length > 0 && !state.turnHasDrawn) {
            state = engine.draw(0);
            // ✅ Draw SFX
            playSfx(SOUND.draw, { volume: 0.80 });
          } else {
            state = engine.pass(0);
          }
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

  // =========================
  // BEGIN: showRoundOverIfNeeded (use real player names in summary)
  // =========================
  function showRoundOverIfNeeded() {
    if (!state.roundOver) return;
    if (state.matchOver) return;
    if (isVisible(roundOverOverlay)) return;

    playRoundEndSoundIfNeeded();

    const sum = state.lastRoundSummary || null;

    // Replace "P0/P1/..." tokens with real player names (matches beta report)
    const replacePlayerIdsInText = (txt) => {
      const raw = String(txt ?? "");
      if (!raw) return raw;
      return raw.replace(/\bP(\d+)\b/g, (_, d) => {
        const pid = Number(d);
        if (Number.isFinite(pid)) {
          return state.players?.[pid]?.name ?? `P${d}`;
        }
        return `P${d}`;
      });
    };

    const lines = [];
    lines.push(replacePlayerIdsInText(sum?.reason) || "Round over.");
    lines.push("");

    // Engine summary uses { roundAdds: [{id, added, total}, ...] }
    const adds = Array.isArray(sum?.roundAdds) ? sum.roundAdds : [];
    if (adds.length) {
      lines.push("Scores this round (added → total):");
      adds.forEach((s) => {
        const pidRaw = (s.id ?? s.playerId ?? "?");
        const pidNum = Number(pidRaw);

        // Prefer real names (state.players is indexed by id in your codebase)
        const who = Number.isFinite(pidNum)
          ? (state.players?.[pidNum]?.name ?? `P${pidNum}`)
          : `P${pidRaw}`;

        const added = Number(s.added ?? s.points ?? 0);
        const total = Number(s.total ?? 0);

        lines.push(`${who}: +${added} → ${total}`);
      });
    } else {
      // Fallback if engine summary is missing
      lines.push(scoreboardText());
    }

    if (roundOverBody) roundOverBody.textContent = lines.join("\n");

    roundSeconds = 30;
    if (roundCountdown) roundCountdown.textContent = `${roundSeconds}s`;

    showOverlay(roundOverOverlay);

    // Fireworks on round win (P0)
    try {
      maybeFireworksForP0RoundWin(state);
    } catch {}

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
  // =========================
  // END: showRoundOverIfNeeded (use real player names in summary)
  // =========================

  function startNextRound() {
    if (!state.roundOver) return;
    stopAutoPlayWatchdog();
    autoPlayP0 = false;
    stopRoundCountdown();
    hideOverlay(roundOverOverlay);
    hideOverlay(scoreboardOverlay);

    state = engine.startNextRound();
    applyDifficultyToEngine();

    roundEndSoundPlayed = false;
    ensureBackgroundMusic();

    resetStableAiNames({ force: false });
    applyPlayerNamesToState();
    captureRoundSetupNotice(state);

    selectedTileId = null;
    gameOverShown = false;

    paint();
    ensureAI();

    try { awaitMaybeEnsureAI(); } catch {}
  }


  // =========================
  // BEGIN: Credits text builder
  // =========================
  function buildCreditsText() {
    const p0 = state?.players?.[0]?.name || "Player";
    const aiNames = (state?.players || [])
      .filter(p => (p?.id ?? -1) !== 0)
      .map(p => p?.name || `P${p?.id ?? "?"}`)
      .join(", ");

    const packName = (activePack && activePack.name) ? activePack.name : (dominoSkin || "default");
    const rulesName = (activeRules && activeRules.preset) ? activeRules.preset : "standard";
    const diffName = (aiDifficulty || "normal");
    const stamp = new Date().toLocaleString();

    const lines = [];
    lines.push("🎬  DOUBLE 12 EXPRESS  —  CREDITS");
    lines.push("");
    lines.push(`Lead Conductor: Ed Cook`);
    lines.push(`AI Troublemakers: Trip and Puppet`);
    lines.push(`Rules Lawyer: ${rulesName}`);
    lines.push(`Difficulty Dial: ${diffName}`);
    lines.push(`Art Department: Ed Cook`);
    lines.push("");
    lines.push("• A game by Ed Cook. Built with love, caffeine, and a pinch of madness.");
    lines.push("• Three Legged Dog and Company.");
    lines.push("• All code, music, images created by Ed Cook.");
    lines.push("• http://three-legged-dog-and-company.art");
    lines.push("");
    lines.push("No dominoes were harmed in the making of this match. Except that one time when the 12 double got a little too rowdy and had to be put in time-out. It’s fine now.");
    lines.push(`Timestamp: ${stamp}`);
    return lines.join("\n");
  }
  // =========================
  // END: Credits text builder
  // =========================

  // =========================
  // BEGIN: showGameOverIfNeeded (with fireworks on match win P0)
  // =========================
  function showGameOverIfNeeded() {
    if (!state.matchOver) return;
    if (gameOverShown) return;
    gameOverShown = true;

    recordHighScoreIfNeeded();
    playGameOverSoundIfNeeded(state);

    // Determine match winner (engine uses lowest score as winner)
    let winnerId = null;
    try {
      const sorted = (state.players || [])
        .map((p) => ({ id: p.id, score: Number(p.score) }))
        .sort((a, b) => a.score - b.score);
      winnerId = sorted.length ? sorted[0].id : null;
    } catch {}

    const lines = [];
    lines.push("Match over!");
    lines.push("");
    lines.push(scoreboardText());

    if (winnerId === 0) {
      lines.push("");
      lines.push("🎆 Winner: You (P0)! 🎆");
      try { launchFireworks({ preset: "match" }); } catch {}
    } else if (winnerId != null) {
      const wName = state.players?.[winnerId]?.name ?? `P${winnerId}`;
      lines.push("");
      lines.push(`Winner: ${wName}`);
    }

    if (gameOverBody) gameOverBody.textContent = lines.join("\n");
    try { if (creditsText) creditsText.textContent = buildCreditsText(); } catch {}
    showOverlay(gameOverOverlay);
  }
  // =========================
  // END: showGameOverIfNeeded (with fireworks on match win P0)
  // =========================


  /* ---------- High score capture ---------- */

  function recordHighScoreIfNeeded() {
  if (!state?.matchOver) return false;
  if (highScoreCaptured) return true;

  try {
    const sorted = (state.players || [])
      .map((p) => ({
        id: p.id,
        name: p.name || `P${p.id}`,
        score: Number(p.score ?? 0),
      }))
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
    return true;
  } catch (err) {
    console.warn("High score save failed:", err);
    return false;
  }
}

  /* ---------- Render ---------- */

  function paint() {
    syncOverlaysWithState();
    syncMenuDrivenSettings();
    applyPlayerNamesToState();

    if (state?.matchOver) recordHighScoreIfNeeded();

    // Preserve scroll positions of train rows
    const trainScroll = {};
    document.querySelectorAll(".train-tiles").forEach((el, i) => {
      trainScroll[i] = el.scrollLeft;
    });

    if (scoreChips) scoreChips.innerHTML = "";
    if (scoreBox) scoreBox.textContent = scoreboardText();
    refreshScoreboardModal();

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

    
    // =========================
    // BEGIN: Scorebar HUD (Boneyard + Your Options)
    // =========================
    if (sbBoneyard) sbBoneyard.textContent = `Boneyard: ${state.deck.length}`;

    if (sbOptions) {
      sbOptions.classList.remove("hidden");

      let nextText = "";
      let nextTone = "neutral";

      if (roundSetupNotice) {
        nextText = `Your Options: ${computeOptionsText()}`;
        nextTone = computeOptionsTone();
      } else if (noHints) {
        nextText = `Your Options: ${
          diff === "chaos"
            ? "Chaos Mode Selected — no hints given"
            : "Hard Mode Selected — no hints given"
        }`;
        nextTone = "neutral";
      } else {
        nextText = `Your Options: ${computeOptionsText()}`;
        nextTone = computeOptionsTone();
      }

      const prevText = sbOptions.dataset.lastText || "";
      const prevTone = sbOptions.dataset.lastTone || "";

      sbOptions.textContent = nextText;
      setHudPillTone(sbOptions, nextTone);

      if (nextText !== prevText || nextTone !== prevTone) {
        sbOptions.dataset.lastText = nextText;
        sbOptions.dataset.lastTone = nextTone;
        bumpHudPill(sbOptions);
      }
    }
    // =========================
    // END: Scorebar HUD (Boneyard + Your Options)
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
      } else if (noHints) {
        turnHint = "Your move";
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

    // Chaos mode: pop the Chaos Caboose toast when a new card triggers
    try { maybeShowChaosCabooseToast(); } catch {}

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
      boardTrainScroll,
      // Hand flip (double-tap / double-click)
      onToggleHandFlip: toggleHandFlip,
      isHandTileFlipped,
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

    // Restore scroll positions
    document.querySelectorAll(".train-tiles").forEach((el, i) => {
      if (trainScroll[i] !== undefined) {
        el.scrollLeft = trainScroll[i];
      }
    });

  }

  /* ---------- Events ---------- */

  newGameBtn?.addEventListener("click", async () => {
    if (isAnyModalOpen()) return;

    try {
      stopAutoPlayWatchdog();
      autoPlayP0 = false;

      state = engine.newGame();
      applyDifficultyToEngine();
      highScoreCaptured = false;

      unlockAudioOnce();
      onNewGameSoundStart();

      resetStableAiNames({ force: true });
      applyPlayerNamesToState();
      captureRoundSetupNotice(state);

      selectedTileId = null;
      gameOverShown = false;

      // Load pack and paint once ready
      dominoSkin = readDominoSkinSetting();
      await syncThemeSelectUI({ selectSkin: dominoSkin });
      await ensureActivePackLoaded(dominoSkin);

      paint();
      ensureAI();
    } catch (err) {
      console.error("NEW GAME CRASH:", err);
      if (statusBox) {
        statusBox.textContent = `NEW GAME CRASH: ${err?.message || String(err)}`;
      }
      try { paint(); } catch (_) {}
    }
  });

  // =========================
  // BEGIN: Draw button wiring (with SFX)
  // =========================
  drawBtn?.addEventListener("click", () => {
    if (state.matchOver || state.roundOver || isAnyModalOpen()) return;
    if (state.currentPlayer !== 0) return;

    try {
      clearRoundSetupNotice();
      const previousPlayerId = state.currentPlayer;
      state = engine.draw(0);

      // ✅ Play draw SFX
      try { playSfx(SOUND.draw, { volume: 0.80 }); } catch {}

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
  // =========================
  // END: Draw button wiring (with SFX)
  // =========================

  passBtn?.addEventListener("click", () => {
    if (state.matchOver || state.roundOver || isAnyModalOpen()) return;
    if (state.currentPlayer !== 0) return;

    try {
      clearRoundSetupNotice();
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
    hideOverlay(creditsOverlay);
    hideOverlay(scoreboardOverlay);
    state = engine.newGame();
    applyDifficultyToEngine();
    highScoreCaptured = false;
    applyPlayerNamesToState();
    captureRoundSetupNotice(state);

    unlockAudioOnce();
    onNewGameSoundStart();

    selectedTileId = null;
    gameOverShown = false;
    paint();
    ensureAI();
  });

  // =========================
  // BEGIN: Game Over → Credits
  // =========================
  gameOverCreditsBtn?.addEventListener("click", () => {
    // Fill text (safe even if already filled)
    try { if (creditsText) creditsText.textContent = buildCreditsText(); } catch {}
    hideOverlay(gameOverOverlay);
    showOverlay(creditsOverlay);
  });
  // =========================
  // END: Game Over → Credits
  // =========================

  gameOverCloseBtn?.addEventListener("click", () => {
    hideOverlay(gameOverOverlay);
    hideOverlay(creditsOverlay);
    hideOverlay(scoreboardOverlay);
    paint();
  });

  // =========================
  // BEGIN: Credits close wiring
  // =========================
  function closeCredits() {
    hideOverlay(creditsOverlay);
    // Return to Game Over screen if match is still over
    if (state?.matchOver) showOverlay(gameOverOverlay);
  }

  creditsCloseBtn?.addEventListener("click", closeCredits);
  creditsCloseX?.addEventListener("click", closeCredits);
  // =========================
  // END: Credits close wiring
  // =========================


  // Round over button
  roundNextBtn?.addEventListener("click", startNextRound);

  // Scoreboard modal
  function openScoreboard() {
    refreshScoreboardModal();
    showOverlay(scoreboardOverlay);
  }
  function closeScoreboard() { hideOverlay(scoreboardOverlay); }

  scoreboardBtn?.addEventListener("click", openScoreboard);
  scoreboardCloseBtn?.addEventListener("click", closeScoreboard);
  scoreboardCloseX?.addEventListener("click", closeScoreboard);
  scoreboardOverlay?.addEventListener("click", (e) => { if (e.target === scoreboardOverlay) closeScoreboard(); });

  // Top menu resume / quit flow
  function closeQuitOverlay(){ hideOverlay(quitOverlay); }
  function openQuitOverlay(){
    closeTopMenu();
    showOverlay(quitOverlay);
  }

  topMenuQuitBtn?.addEventListener("click", openQuitOverlay);
  quitResumeBtn?.addEventListener("click", closeQuitOverlay);
  quitCloseX?.addEventListener("click", closeQuitOverlay);
  quitOverlay?.addEventListener("click", (e) => { if (e.target === quitOverlay) closeQuitOverlay(); });

  quitHomeBtn?.addEventListener("click", () => {
    try { window.location.href = "index.html"; } catch {}
  });

  quitExitBtn?.addEventListener("click", async () => {
    try {
      const App = window.Capacitor?.Plugins?.App;
      if (App?.exitApp) {
        await App.exitApp();
        return;
      }
    } catch {}
    try { window.location.href = "index.html"; } catch {}
  });

  settingsResumeBtn?.addEventListener("click", () => hideOverlay(settingsOverlay));
  settingsCloseBtn?.addEventListener("click", () => hideOverlay(settingsOverlay));


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

  /* ---------- Instructions modal listeners ---------- */

  instructionsBtn?.addEventListener("click", () => showOverlay(instructionsOverlay));
  instructionsCloseBtn?.addEventListener("click", () => hideOverlay(instructionsOverlay));
  instructionsCloseX?.addEventListener("click", () => hideOverlay(instructionsOverlay));
  instructionsOverlay?.addEventListener("click", (e) => { if (e.target === instructionsOverlay) hideOverlay(instructionsOverlay); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && instructionsOverlay && !instructionsOverlay.classList.contains("hidden")) hideOverlay(instructionsOverlay);
  });

  /*---------- Rules modal listeners ---------- */

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
    captureRoundSetupNotice(state);

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
  // BEGIN: Fireworks (round + match presets) + one-shot latch + CSS var palette
  // =========================

  // One-shot latch so we don't try to fire fireworks every render tick
  let __fwLastRoundId = null;

  function maybeFireworksForP0RoundWin(state){
    const sum = state?.lastRoundSummary;
    if (!sum) return;

    const roundId =
      (typeof state?.roundIndex === "number") ? `r${state.roundIndex}` :
      (typeof state?.round === "number") ? `r${state.round}` :
      (typeof sum?.round === "number") ? `r${sum.round}` :
      (typeof sum?.roundNumber === "number") ? `r${sum.roundNumber}` :
      (sum?.id != null) ? `id:${sum.id}` :
      JSON.stringify(sum);

    if (roundId === __fwLastRoundId) return;

    const winners = sum?.winners || [];
    const p0Won =
      Array.isArray(winners) &&
      (winners.includes(0) || winners.includes("0"));

    if (p0Won){
      __fwLastRoundId = roundId;
      launchFireworks({ preset: "round" });
    }
  }

  function prefersReducedMotion(){
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function cssVar(name, fallback){
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function cssNumber(name, fallback){
    const v = cssVar(name, "");
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function getFxColors(){
    // Packs can override these in theme.css
    const c1 = cssVar("--fx-color-1", "#ffcc00");
    const c2 = cssVar("--fx-color-2", "#00d4ff");
    const c3 = cssVar("--fx-color-3", "#ff4fd8");
    const c4 = cssVar("--fx-color-4", "#7CFF6B");
    return [c1,c2,c3,c4].filter(Boolean);
  }

  // =========================
  // BEGIN: launchFireworks (visible colors; uses theme.css --fx-color-*)
  // =========================
  function launchFireworks() {
    // prevent stacking
    if (document.getElementById("fwOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "fwOverlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2147483647"; // above everything

    const c = document.createElement("canvas");
    overlay.appendChild(c);
    document.body.appendChild(overlay);

    const ctx = c.getContext("2d");
    const particles = [];
    const bursts = 7;
    const gravity = 0.06;

    function cssVar(name, fallback){
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    }
    const colors = [
      cssVar("--fx-color-1", "#ffcc00"),
      cssVar("--fx-color-2", "#00d4ff"),
      cssVar("--fx-color-3", "#ff4fd8"),
      cssVar("--fx-color-4", "#7CFF6B")
    ];

    function resize(){
      const dpr = window.devicePixelRatio || 1;
      c.width  = Math.floor(window.innerWidth * dpr);
      c.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    function burst() {
      const x = Math.random() * window.innerWidth * 0.8 + window.innerWidth * 0.1;
      const y = Math.random() * window.innerHeight * 0.35 + window.innerHeight * 0.1;
      const count = 80;

      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = Math.random() * 4.8 + 1.2;
        particles.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 95 + Math.random() * 55,
          r: 1.2 + Math.random() * 1.8,
          color: colors[(Math.random() * colors.length) | 0]
        });
      }
    }

    for (let i = 0; i < bursts; i++) setTimeout(burst, i * 180);

    let t = 0;
    function tick() {
      t++;

      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.globalCompositeOperation = "lighter";

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

        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 140));
        ctx.fillStyle = p.color;            // ✅ THIS is what you were missing
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (t < 240) requestAnimationFrame(tick);
      else overlay.remove();
    }

    window.addEventListener("resize", resize, { once: true });

    tick();
  }
  // =========================
  // END: launchFireworks (visible colors; uses theme.css --fx-color-*)
  // =========================

  // Boot 
  (async function boot() {
    // Wire PackStore overlay UI (if present)
    try{
      __packStoreUI = wirePackStoreUI({
        onInstalled: async () => { await refreshThemeSelectOptions(); },
        onUninstalled: async () => { await refreshThemeSelectOptions(); },
        onUse: async (key) => {
          // Use pack from PackStore UI list
          writeDominoSkinSetting(key);
          dominoSkin = String(key || "default").toLowerCase();
          await refreshThemeSelectOptions({ selectSkin: dominoSkin });
          await ensureActivePackLoaded(dominoSkin);
          rebuildAudioFromActivePack({ restartMusic: true });
          paint();
        },
      });
    }catch(e){
      console.warn("PackStore UI wiring failed:", e);
    }

    // Build theme dropdown (includes installed packs) and select saved value
    dominoSkin = readDominoSkinSetting() || "default";
    await refreshThemeSelectOptions({ selectSkin: dominoSkin });

    await ensureActivePackLoaded(dominoSkin);

    // Some browsers/extensions can “restore” form state after scripts run,
    // so we re-assert once on the next tick.
    setTimeout(() => {
      refreshThemeSelectOptions({ selectSkin: dominoSkin });
    }, 0);

    // Make the very first load honor the manifest instantly (music + sfx + playlist)
    rebuildAudioFromActivePack({ restartMusic: false });

    unlockAudioOnce();
    onNewGameSoundStart();

    try {
      paint();
      ensureAI();
    } catch (err) {
      console.error("BOOT CRASH:", err);
      if (statusBox) {
        statusBox.textContent = `BOOT CRASH: ${err?.message || String(err)}`;
      }
      throw err;
    }
  })();


  async function awaitMaybeEnsureAI() {
    // best-effort helper to keep AI moving after some overlay transitions
    await sleep(0);
    ensureAI();
  }
  // END: js/main.js
