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

/* ---------- DOM ---------- */

const boardArea = document.getElementById("boardArea");
const handArea = document.getElementById("handArea");
const statusBox = document.getElementById("statusBox");
const logBox = document.getElementById("logBox");
const optionsBox = document.getElementById("optionsBox");
const scoreBox = document.getElementById("scoreBox");
const boneyardLine = document.getElementById("boneyardLine");

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
    a.preload = "auto";

    const target = clamp01(volume) * p.sfxVolume;

    if (fadeInMs > 0) {
      a.volume = 0;
      a.play().catch(() => {});
      const start = performance.now();
      const tick = () => {
        const t = (performance.now() - start) / fadeInMs;
        a.volume = clamp01(t) * target;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } else {
      a.volume = target;
      a.play().catch(() => {});
    }
  } catch {
    // ignore
  }
}

// =========================
// BEGIN: Horn Room FX (spatial + distance + small reverb)
// =========================
function createTinyRoomImpulse(ctx, seconds = 0.35, decay = 2.2) {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const impulse = ctx.createBuffer(2, length, rate);

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      // exponentially decaying noise = tiny room
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return impulse;
}

let hornRoomConvolver = null;

function ensureHornRoomConvolver() {
  if (!audioCtx) return null;
  if (hornRoomConvolver) return hornRoomConvolver;

  try {
    const conv = audioCtx.createConvolver();
    conv.buffer = createTinyRoomImpulse(audioCtx, 0.32, 2.35);
    hornRoomConvolver = conv;
    return hornRoomConvolver;
  } catch {
    return null;
  }
}

/**
 * Room-like horn with distance simulation.
 *
 * distance: 0 (closest) .. 1 (farthest)
 * pan: -1..1
 *
 * What distance does:
 * - lowers dry volume
 * - reduces brightness (low-pass lower)
 * - increases wet (reverb) slightly
 * - reduces stereo width a touch
 */
function playHornRoom(
  src,
  {
    baseVolume = 0.95,
    pan = 0,
    distance = 0.35,   // 0 close, 1 far
    fadeInMs = 140,    // quick but not abrupt
  } = {}
) {
  const p = getAudioPrefs();
  if (!p.soundEnabled) return;
  if (!audioUnlocked) return;

  // Fallback: no WebAudio → regular SFX with fade
  if (!window.AudioContext && !window.webkitAudioContext) {
    playSfx(src, { volume: baseVolume, fadeInMs });
    return;
  }

  ensureAudioCtx();
  if (!audioCtx) {
    playSfx(src, { volume: baseVolume, fadeInMs });
    return;
  }

  // clamp helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  distance = clamp(Number(distance) || 0, 0, 1);
  pan = clamp(Number(pan) || 0, -1, 1);

  try {
    const a = new Audio(src);
    a.preload = "auto";
    a.crossOrigin = "anonymous";

    const source = audioCtx.createMediaElementSource(a);

    // --- distance shaping ---
    // Dry gain drops with distance
    const target = clamp(baseVolume, 0, 1) * p.sfxVolume;
    const dryTarget = target * (1 - 0.55 * distance);

    // Reverb mix increases slightly with distance
    const wetMix = 0.14 + (0.22 * distance);

    // Brightness decreases with distance
    const lpClose = 5200;
    const lpFar = 2200;
    const lpFreq = lpClose + (lpFar - lpClose) * distance;

    // Stereo width narrows with distance
    // (we just reduce pan amount a bit)
    const panScaled = pan * (1 - 0.35 * distance);

    // --- nodes ---
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = lpFreq;
    filter.Q.value = 0.75;

    const dryGain = audioCtx.createGain();
    const wetGain = audioCtx.createGain();

    const panner = (audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : null);
    if (panner) panner.pan.value = panScaled;

    // dry route: source -> filter -> dryGain -> panner -> destination
    source.connect(filter);
    filter.connect(dryGain);

    // wet route: filter -> convolver(room) -> wetGain -> panner -> destination
    const conv = ensureHornRoomConvolver();

    if (conv) {
      filter.connect(conv);
      conv.connect(wetGain);
      wetGain.gain.value = wetMix;
    } else {
      // if convolver fails, keep wet muted (still sounds fine)
      wetGain.gain.value = 0;
    }

    if (panner) {
      dryGain.connect(panner);
      wetGain.connect(panner);
      panner.connect(audioCtx.destination);
    } else {
      dryGain.connect(audioCtx.destination);
      wetGain.connect(audioCtx.destination);
    }

    // --- fast fade-in (no jump-scare) ---
    const now = audioCtx.currentTime;
    const rampSec = Math.max(0.06, (Number(fadeInMs) || 140) / 1000);

    dryGain.gain.cancelScheduledValues(now);
    dryGain.gain.setValueAtTime(0.0, now);
    dryGain.gain.linearRampToValueAtTime(Math.max(0.0001, dryTarget), now + rampSec);

    // optional: make wet appear just after dry for realism
    if (conv) {
      wetGain.gain.cancelScheduledValues(now);
      wetGain.gain.setValueAtTime(0.0, now);
      wetGain.gain.linearRampToValueAtTime(wetMix, now + rampSec + 0.05);
    }

    a.play().catch(() => {});
  } catch {
    playSfx(src, { volume: baseVolume, fadeInMs });
  }
}
// =========================
// END: Horn Room FX (spatial + distance + small reverb)
// =========================


// ---------- Music helpers (crossfade) ----------
function getActivePlayer() {
  ensureMusicPlayers();
  return musicActive === "A" ? musicA : musicB;
}
function getInactivePlayer() {
  ensureMusicPlayers();
  return musicActive === "A" ? musicB : musicA;
}

function stopMusic({ fadeMs = 220 } = {}) {
  ensureMusicPlayers();
  if (!musicA && !musicB) return;

  const p = getAudioPrefs();
  const A = musicA;
  const B = musicB;

  const fadeOut = (player) => {
    if (!player) return;
    try {
      const startVol = player.volume ?? p.musicVolume;
      const start = performance.now();
      const tick = () => {
        const t = (performance.now() - start) / fadeMs;
        const v = (1 - clamp01(t)) * startVol;
        player.volume = v;
        if (t < 1) requestAnimationFrame(tick);
        else {
          try { player.pause(); player.currentTime = 0; } catch {}
        }
      };
      requestAnimationFrame(tick);
    } catch {
      try { player.pause(); player.currentTime = 0; } catch {}
    }
  };

  fadeOut(A);
  fadeOut(B);
}

function playMusicCrossfade(src, { fadeMs = 900 } = {}) {
  const p = getAudioPrefs();
  if (!p.soundEnabled || !p.musicEnabled) return;
  if (!audioUnlocked) return;

  ensureMusicPlayers();

  // If we're mid-crossfade, cancel timers
  if (crossfadeTO) clearTimeout(crossfadeTO);
  isCrossfading = true;

  const from = getActivePlayer();
  const to = getInactivePlayer();

  try {
    // Prep target player
    to.src = src;
    to.currentTime = 0;
    to.volume = 0;

    to.play().catch(() => {});

    const start = performance.now();
    const fromStartVol = clamp01(from.volume ?? p.musicVolume);
    const toTargetVol = p.musicVolume;

    const tick = () => {
      const t = clamp01((performance.now() - start) / fadeMs);
      // equal-ish power curve (simple and nice)
      const a = Math.cos((t * Math.PI) / 2);
      const b = Math.sin((t * Math.PI) / 2);

      try { from.volume = fromStartVol * a; } catch {}
      try { to.volume = toTargetVol * b; } catch {}

      if (t < 1) requestAnimationFrame(tick);
      else {
        // swap active
        try { from.pause(); } catch {}
        try { from.currentTime = 0; } catch {}
        musicActive = (musicActive === "A") ? "B" : "A";
        isCrossfading = false;
      }
    };
    requestAnimationFrame(tick);

    // safety: clear crossfade flag even if something odd happens
    crossfadeTO = setTimeout(() => { isCrossfading = false; }, fadeMs + 200);
  } catch {
    // fallback: hard switch
    try {
      stopMusic({ fadeMs: 120 });
      const active = getActivePlayer();
      active.src = src;
      active.currentTime = 0;
      active.volume = p.musicVolume;
      active.play().catch(() => {});
    } catch {}
    isCrossfading = false;
  }
}

function playNextTheme({ fadeMs = 900 } = {}) {
  if (!SOUND.themes.length) return;
  const src = SOUND.themes[currentThemeIdx % SOUND.themes.length];
  currentThemeIdx = (currentThemeIdx + 1) % SOUND.themes.length;
  playMusicCrossfade(src, { fadeMs });
}

function ensureBackgroundMusic() {
  const p = getAudioPrefs();
  if (!p.soundEnabled || !p.musicEnabled) return;
  if (!audioUnlocked) return;

  ensureMusicPlayers();

  const active = getActivePlayer();
  // keep active volume synced to slider
  try { active.volume = p.musicVolume; } catch {}

  if (active.paused) playNextTheme({ fadeMs: 500 });
}

// Call this when you start a new match (or reload into gameplay)
function onNewGameSoundStart() {
  roundEndSoundPlayed = false;
  gameOverSoundPlayed = false;
  lastPendingDouble = null;

  const p = getAudioPrefs();
  if (!p.soundEnabled || !p.musicEnabled) return;
  if (!audioUnlocked) return;

  // Play intro once per page load, then roll into themes (crossfaded)
  if (!introHasPlayed) {
    introHasPlayed = true;
    stopMusic({ fadeMs: 180 });
    playMusicCrossfade(SOUND.intro, { fadeMs: 280 });

    // when intro ends, the ended handler will call playNextTheme via ensureBackgroundMusic()
    // but to be safe, we also schedule a gentle kick after intro duration is unknown:
    // (no-op if already playing)
    setTimeout(() => ensureBackgroundMusic(), 350);
  } else {
    ensureBackgroundMusic();
  }
}

// Detect “double needs to be satisfied” transition
function onStateTransitionForSounds(prevState, nextState) {
  const prevPD = prevState?.pendingDouble || null;
  const nextPD = nextState?.pendingDouble || null;

  if (!prevPD && nextPD) {
    // Engine now provides this reliably (0 = Express Line, 1..N = player trains)
    const trainIdx = Number.isFinite(Number(nextPD.trainIndex))
      ? Number(nextPD.trainIndex)
      : null;

    // Distance: 0 (hub) feels closest; player trains drift farther.
    // 0 -> ~0.12 (close), 1 -> ~0.26, 2 -> ~0.38 ... capped
    let distance = 0.35;
    if (trainIdx !== null) {
      distance = Math.min(0.78, 0.12 + 0.14 * trainIdx);
    }

    // Pan: hub centered. Player trains spread across stereo field by owner index.
    // P0 (trainIdx=1) slightly left, P1 (2) slightly right, etc.
    // If we can't determine, fall back to current player.
    let pan = (nextState?.currentPlayer === 0) ? 0.25 : -0.25;

    if (trainIdx !== null) {
      if (trainIdx === 0) {
        pan = 0; // hub centered
      } else {
        // trainIdx=1..N -> map to [-0.65..0.65] with alternating but balanced spacing
        const owner = trainIdx - 1; // P0=0, P1=1...
        const side = (owner % 2 === 0) ? -1 : 1; // P0 left, P1 right, P2 left...
        const rung = Math.floor(owner / 2);      // 0,0,1,1,2,2...
        const amt = Math.min(0.65, 0.28 + 0.12 * rung);
        pan = side * amt;
      }
    }

    // Horn: room-like + distance shaping + quick fade-in
    playHornRoom(SOUND.trainHorn, {
      baseVolume: 0.98,
      pan,
      distance,
      fadeInMs: 140,
    });
  }

  lastPendingDouble = nextPD;
}

// Decide winner/loser sound at match end
function playGameOverSoundIfNeeded() {
  if (gameOverSoundPlayed) return;

  const winner = state?.winner;
  if (winner === null || winner === undefined) return;

  gameOverSoundPlayed = true;

  // Pause background music for the end cue (quick fade)
  stopMusic({ fadeMs: 180 });

  const p0Won = winner === 0;
  // End cues: no need to crossfade in, just start clean
  const p = getAudioPrefs();
  if (!p.soundEnabled || !p.musicEnabled || !audioUnlocked) return;

  playMusicCrossfade(p0Won ? SOUND.gameWin : SOUND.gameLose, { fadeMs: 220 });
}

function playRoundEndSoundIfNeeded() {
  if (roundEndSoundPlayed) return;
  roundEndSoundPlayed = true;

  stopMusic({ fadeMs: 160 });

  const p = getAudioPrefs();
  if (!p.soundEnabled || !p.musicEnabled || !audioUnlocked) return;

  playMusicCrossfade(SOUND.roundEnd, { fadeMs: 200 });
}
// =========================
// END: Sound Manager (SFX + Music Playlist)
// =========================

/* ---------- Settings bridge ---------- */

const MENU_SETTINGS_KEY = "double12express.settings.v1";

function readMenuSettings() {
  try {
    const raw = localStorage.getItem(MENU_SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeMenuSettings(patch) {
  try {
    const cur = readMenuSettings() || {};
    const next = { ...cur, ...patch };
    localStorage.setItem(MENU_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

// =========================
// BEGIN: Sync Menu-Driven Audio Settings (hoisted, safe)
// =========================
function syncMenuDrivenSettings({ fadeMs = 160 } = {}) {
  // If settings helpers aren't ready yet, do nothing.
  if (typeof readMenuSettings !== "function") return;

  const s = readMenuSettings() || {};
  const soundEnabled = s.soundEnabled !== false;
  const musicEnabled = s.musicEnabled !== false;

  const musicVol = (typeof clamp01 === "function")
    ? clamp01(Number(s.musicVolume ?? 0.55))
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
// Paste this block directly AFTER the Sync Menu-Driven Audio Settings block.
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

  // Persist (main.js uses writeMenuSettings)
  writeMenuSettings?.(s);

  // Apply immediately (this also keeps crossfade/volume consistent)
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

// Click cycle + fancy ping + tooltip flash
gameAudioToggle?.addEventListener("click", () => {
  unlockAudioOnce?.();

  const nextMode = (getGameAudioMode() + 1) % 3;
  applyGameAudioMode(nextMode);
  updateGameAudioToggleUI();

  // Fancy feedback: ping ring + tooltip flash
  gameAudioToggle.classList.remove("ping");
  void gameAudioToggle.offsetWidth; // force reflow so ping retriggers
  gameAudioToggle.classList.add("ping");

  gameAudioToggle.classList.add("show-tip");
  clearTimeout(gameAudioToggle.__tipTO);
  gameAudioToggle.__tipTO = setTimeout(() => {
    gameAudioToggle.classList.remove("show-tip");
  }, 900);
});

// Hover tooltip show/hide
gameAudioToggle?.addEventListener("mouseenter", () => {
  gameAudioToggle.classList.add("show-tip");
});
gameAudioToggle?.addEventListener("mouseleave", () => {
  gameAudioToggle.classList.remove("show-tip");
});

// Initialize on load
updateGameAudioToggleUI();
// =========================
// END: In-Game Speaker Toggle (3-state, fancy)
// =========================

// sanitizeSkin is shared in settings.js (imported above)

function readDominoSkinSetting() {
  const menuSkin = readMenuSettings()?.dominoPack;
  const lastSkin = localStorage.getItem("mt_dominoSkin");
  return sanitizeSkin(menuSkin || lastSkin || "default");
}

function writeDominoSkinSetting(skin) {
  const s = sanitizeSkin(skin);
  try { localStorage.setItem("mt_dominoSkin", s); } catch {}
  writeMenuSettings({ dominoPack: s });
}

/* ---------- Player names ---------- */

const DEFAULT_P0_NAME = "Player";
// BEGIN: AI_NAME_POOL (deduped)
const AI_NAME_POOL = [
  "Diesel", "Caboose", "Switch", "Conductor", "Whistle",
  "Railjack", "Signal", "Turntable", "Sleeper", "Ballast",
  "Boxcar", "Hopper", "Tanker",
  "Pip Wizard", "Double Trouble", "Lucky 12",
  "Bone Yard Bill", "Sidecar Sam", "Express Eddie",
  "Pip-Pip Hooray", "Bone-yard Bandit", "Dots Entertainment",
  "Double or Nothing", "Pip-Squeak", "The Pip-Line",
  "Double Header", "Main Line Bone", "The Pip-Express", "Conductor Pip",
  "Wildcard", "Gremlin", "Chaos Engine", "No Mercy", "Fast Hands",
  "Byte Bandit", "Pixel Pete", "Neon Nova", "Domino Dan",
  "Trip", "Puppet", "Fergie", "Cooper", "Harper", "Dakota",
  "Sheena", "Booter", "Ed", "Kenny", "Targarean",
  "Freight Expectations", "Loco-Motive", "Thomas the Plank",
  "Caboose Loose", "Track Star", "Training Wheels",
];
// END: AI_NAME_POOL (deduped)

function getDifficultyEmoji(diff) {
  const d = String(diff || "").toLowerCase();
  if (d === "easy") return "😌";
  if (d === "normal") return "🙂";
  if (d === "hard") return "😈";
  if (d === "chaos") return "🤪";
  return "🤖";
}

function normalizeName(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function pickUniqueAiNames(needCount, takenLowerSet, poolOverride = null) {
  const pool = [...(poolOverride?.length ? poolOverride : AI_NAME_POOL)];

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const out = [];
  for (const name of pool) {
    if (out.length >= needCount) break;
    const k = name.toLowerCase();
    if (takenLowerSet.has(k)) continue;
    takenLowerSet.add(k);
    out.push(name);
  }

  while (out.length < needCount) out.push(`AI ${out.length + 1}`);
  return out;
}

// BEGIN: Stable AI names (persist across matches + reloads)
const AI_NAMES_KEY = "double12express.aiNames.v1";
let stableAiNames = null;

function loadAiNames() {
  try {
    const raw = localStorage.getItem(AI_NAMES_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.names)) return null;
    return data.names;
  } catch {
    return null;
  }
}

function saveAiNames(names) {
  try {
    localStorage.setItem(AI_NAMES_KEY, JSON.stringify({ names, ts: Date.now() }));
  } catch {
    // ignore
  }
}

function resetStableAiNames({ force = false } = {}) {
  const needed = Math.max(0, (state?.players?.length || 4) - 1);

  if (!force) {
    const persisted = loadAiNames();
    if (persisted && persisted.length === needed) {
      stableAiNames = persisted;
      return;
    }
  }

  const settings = readMenuSettings() || {};
  const p0Name = normalizeName(settings.playerName) || DEFAULT_P0_NAME;

  const taken = new Set([p0Name.toLowerCase()]);
  stableAiNames = pickUniqueAiNames(needed, taken);
  saveAiNames(stableAiNames);
}
// END: Stable AI names (persist across matches + reloads)

function applyPlayerNamesToState() {
  if (!state?.players?.length) return;

  const settings = readMenuSettings() || {};
  const p0Name = normalizeName(settings.playerName) || DEFAULT_P0_NAME;

  if (!stableAiNames || stableAiNames.length !== state.players.length - 1) {
    resetStableAiNames({ force: false });
  }

  state.players[0].name = p0Name;
  if (engine?.state?.players?.length) engine.state.players[0].name = p0Name;

  const emo = getDifficultyEmoji(typeof aiDifficulty === "undefined" ? "normal" : aiDifficulty);
  for (let i = 1; i < state.players.length; i++) {
    const nm = `${emo} ${stableAiNames[i - 1] || `AI ${i}`}`;
    state.players[i].name = nm;
    if (engine?.state?.players?.length) engine.state.players[i].name = nm;
  }
}

/* ---------- Rules ---------- */

const RULE_PRESETS = {
  standard: {
    startDoubleDescending: true,
    drawUntilStartDouble: true,
    fallbackHighestDouble: true,
    allowMultipleAfterSatisfy: false,
    doubleMustBeSatisfied: true,
    unsatisfiedDoubleEndsRound: true,
    mexAlwaysOpen: true,
    openTrainOnNoMove: true,
  },
  house: {
    startDoubleDescending: true,
    drawUntilStartDouble: true,
    fallbackHighestDouble: true,
    allowMultipleAfterSatisfy: true,
    doubleMustBeSatisfied: true,
    unsatisfiedDoubleEndsRound: true,
    mexAlwaysOpen: true,
    openTrainOnNoMove: true,
  },
  chaos: {
    startDoubleDescending: true,
    drawUntilStartDouble: true,
    fallbackHighestDouble: true,
    allowMultipleAfterSatisfy: true,
    doubleMustBeSatisfied: true,
    unsatisfiedDoubleEndsRound: true,
    mexAlwaysOpen: true,
    openTrainOnNoMove: true,
  },
};

let activeRules = structuredClone(RULE_PRESETS.standard);

function getSelectedPreset() {
  const el = document.querySelector('input[name="rules_preset"]:checked');
  return el ? el.value : "standard";
}

function syncToggleEnabledState() {
  const preset = getSelectedPreset();
  const isCustom = preset === "custom";
  rulesToggles?.classList.toggle("disabled", !isCustom);
}

function getCustomRulesFromToggles() {
  return {
    startDoubleDescending: document.getElementById("r_startDoubleDescending").checked,
    drawUntilStartDouble: document.getElementById("r_drawUntilStartDouble").checked,
    fallbackHighestDouble: document.getElementById("r_fallbackHighestDouble").checked,
    allowMultipleAfterSatisfy: document.getElementById("r_allowMultipleAfterSatisfy").checked,
    doubleMustBeSatisfied: document.getElementById("r_doubleMustBeSatisfied").checked,
    unsatisfiedDoubleEndsRound: document.getElementById("r_unsatisfiedDoubleEndsRound").checked,
    mexAlwaysOpen: document.getElementById("r_mexAlwaysOpen").checked,
    openTrainOnNoMove: document.getElementById("r_openTrainOnNoMove").checked,
  };
}

function applyPresetToToggles(presetKey) {
  const rules = RULE_PRESETS[presetKey] || RULE_PRESETS.standard;
  document.getElementById("r_startDoubleDescending").checked = !!rules.startDoubleDescending;
  document.getElementById("r_drawUntilStartDouble").checked = !!rules.drawUntilStartDouble;
  document.getElementById("r_fallbackHighestDouble").checked = !!rules.fallbackHighestDouble;
  document.getElementById("r_allowMultipleAfterSatisfy").checked = !!rules.allowMultipleAfterSatisfy;
  document.getElementById("r_doubleMustBeSatisfied").checked = !!rules.doubleMustBeSatisfied;
  document.getElementById("r_unsatisfiedDoubleEndsRound").checked = !!rules.unsatisfiedDoubleEndsRound;
  document.getElementById("r_mexAlwaysOpen").checked = !!rules.mexAlwaysOpen;
  document.getElementById("r_openTrainOnNoMove").checked = !!rules.openTrainOnNoMove;
}

function computeRulesFromModal() {
  const preset = getSelectedPreset();
  if (preset === "custom") return getCustomRulesFromToggles();
  return structuredClone(RULE_PRESETS[preset] || RULE_PRESETS.standard);
}

function openRules() {
  rulesOverlay?.classList.remove("hidden");
  syncToggleEnabledState();
  const preset = getSelectedPreset();
  if (preset !== "custom") applyPresetToToggles(preset);
}

function closeRules() {
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

/* Log filter state */
let logFilterMode = "all";
let logSearch = "";

/* UI Render options */
let renderMode = localStorage.getItem("mt_renderMode") || "pretty";
let dominoSkin = readDominoSkinSetting();
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
if (playerNameInput) {
  playerNameInput.disabled = true;
  playerNameInput.title = "Player name is set in the main menu Options.";
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/* ---------- Modal helpers ---------- */

function showOverlay(el) {
  if (!el) return;
  el.classList.remove("hidden");
  el.style.display = "flex";
}

function hideOverlay(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.style.display = "";
}

function isVisible(el) {
  return !!el && !el.classList.contains("hidden");
}

function isAnyModalOpen() {
  return isVisible(gameOverOverlay) || isVisible(roundOverOverlay) || isVisible(rulesOverlay);
}

/* ---------- UI helpers ---------- */

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

function scoreboardText() {
  const sorted = state.players
    .map((p) => ({ id: p.id, score: p.score, hand: p.hand.length }))
    .sort((a, b) => a.score - b.score);

  const lines = [];
  lines.push(`Round: ${state.round}/${state.roundsTotal}`);
  lines.push(state.matchOver ? "Match: OVER" : (state.roundOver ? "Match: paused (round over)" : "Match: active"));
  lines.push("");
  lines.push("Ranking (lowest wins):");
  sorted.forEach((p, i) => lines.push(`${i + 1}. P${p.id} — ${p.score} pts (hand ${p.hand})`));
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
// END: ensureAI (validated AI moves; prevents “waiting forever”)

// =========================
// BEGIN: awaitMaybeEnsureAI (single canonical)
// =========================
function awaitMaybeEnsureAI() {
  try {
    if (!engine || !state) return;
    if (state.matchOver || state.roundOver) return;
    if (typeof isAnyModalOpen === "function" && isAnyModalOpen()) return;
    if (typeof ensureAI === "function") ensureAI();
  } catch (e) {
    console.warn("awaitMaybeEnsureAI failed:", e);
  }
}
// =========================
// END: awaitMaybeEnsureAI (single canonical)
// =========================

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
  }, 600); // fast enough to feel responsive, slow enough to be cheap
}

function stopAiTurnWatchdog() {
  if (!aiTurnWatchdogId) return;
  clearInterval(aiTurnWatchdogId);
  aiTurnWatchdogId = null;
}

// Start automatically
startAiTurnWatchdog();
// =========================
// END: AI Turn Watchdog (prevents rare stalls)
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
        state = engine.playTile(0, move.tileId, move.target); // ✅ fixed (pid was undefined)
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

  const sum = state.lastRoundSummary;

  const lines = [];
  lines.push(sum?.reason || "Round over.");
  lines.push("");
  lines.push("Scores this round:");
  (sum?.scores || []).forEach((s) => lines.push(`P${s.playerId}: +${s.points}`));

  if (roundOverBody) roundOverBody.textContent = lines.join("\n");

  roundSeconds = 30;
  if (roundCountdown) roundCountdown.textContent = `${roundSeconds}s`;

  showOverlay(roundOverOverlay);

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
  syncMenuDrivenSettings();
  applyPlayerNamesToState();

  if (scoreBox) scoreBox.textContent = scoreboardText();
  if (optionsBox) optionsBox.textContent = computeOptionsText();

  const locked = state.matchOver || state.roundOver || isAnyModalOpen();
  const myTurn = state.currentPlayer === 0;

  if (drawBtn) {
    drawBtn.disabled = locked || !myTurn || state.deck.length === 0 || state.turnHasDrawn;
  }

  if (passBtn) {
    passBtn.disabled = locked || !myTurn || !canHumanPass();
  }

  if (boneyardLine) boneyardLine.textContent = `Boneyard: ${state.deck.length}`;

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
    maxPip: 12,
  });

  showGameOverIfNeeded();
  showRoundOverIfNeeded();
}

/* ---------- Events ---------- */

// Rules modal listeners
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

// In-game debug controls
aiDifficultySelect?.addEventListener("change", () => {
  aiDifficulty = aiDifficultySelect.value || "normal";

  resetStableAiNames({ force: true });
  applyPlayerNamesToState();

  logMsg(`AI difficulty -> ${aiDifficulty}`, { kind: "rules" });
  paint();
  ensureAI();
});

// BEGIN: Autoplay UI hook (disabled — mechanics retained)
/*
autoPlayToggle?.addEventListener("change", () => {
  const prev = autoPlayP0;
  autoPlayP0 = !!autoPlayToggle.checked;
  state.log?.push?.(`Auto P0 -> ${autoPlayP0 ? "ON" : "OFF"}`);
  if (autoPlayP0 && !prev) startAutoPlayWatchdog();
  if (!autoPlayP0 && prev) stopAutoPlayWatchdog();
  paint();
  ensureAI();
});
*/
// END: Autoplay UI hook (disabled — mechanics retained)

// Log controls
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

// Hand select (delegated)
handArea?.addEventListener("click", (e) => {
  const tileEl = e.target.closest("button.tile");
  if (!tileEl) return;
  if (tileEl.disabled) return;
  if (state.currentPlayer !== 0) return;
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;

  selectedTileId = tileEl.dataset.tileId;
  paint();
});

// Place tile (delegated)
boardArea?.addEventListener("click", (e) => {
  const dz = e.target.closest(".dropzone");
  if (!dz) return;

  if (state.currentPlayer !== 0) return;
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;

  if (!selectedTileId) {
    state.log?.push?.("Select a tile first.");
    paint();
    return;
  }

  const target = JSON.parse(dz.dataset.target || "{}");

  const legal = engine.getLegalMoves(0);
  const move = legal.find((m) => m.tileId === selectedTileId && targetsEqual(m.target, target));

  if (!move) {
    state.log?.push?.("That tile can't be played there.");
    paint();
    return;
  }

  const prevState = state;
  state = engine.playTile(0, move.tileId, move.target);
  playSfx(SOUND.dominoPlay, { volume: 0.90 });
  onStateTransitionForSounds(prevState, state);

  applyPlayerNamesToState();
  selectedTileId = null;

  paint();
  ensureAI();
});

// Buttons
newGameBtn?.addEventListener("click", () => {
  state = engine.newGame();
  highScoreCaptured = false;
  applyPlayerNamesToState();
  selectedTileId = null;
  gameOverShown = false;

  unlockAudioOnce();
  onNewGameSoundStart();

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

// Sync if menu/options changes localStorage
window.addEventListener("storage", (e) => {
  if (e.key === "mt_dominoSkin" || e.key === MENU_SETTINGS_KEY) {
    applyAudioSettingsFromMenu(readMenuSettings() || {});
    paint();
  }
});

/* ---------- Boot ---------- */

paint();
ensureAI();
// END: js/main.js
