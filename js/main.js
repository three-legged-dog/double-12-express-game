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
import {
  initMonetization,
  showBannerIfEligible,
  hideAllAds,
  maybeShowInterstitial,
  isPremiumEntitled,
  buyPremiumUnlock,
  restorePremiumUnlock,
  openAdPrivacyOptions,
} from "./monetization.js";

// =========================
// BEGIN: Native StatusBar (Capacitor)
// =========================
function initNativeStatusBar(){
  try{
    const Cap = window.Capacitor;
    const StatusBar = Cap?.Plugins?.StatusBar;
    const Style = Cap?.Plugins?.StatusBarStyle || Cap?.StatusBarStyle;
    if (!Cap?.isNativePlatform?.() || !StatusBar) return;

    // CSS hook for safe-area/statusbar guard
    try{ document.body.classList.add("native-app"); } catch {}

    // Make status bar orange and visible over splash/top area
    try{ StatusBar.setOverlaysWebView({ overlay: true }); } catch {}
    try{ StatusBar.setBackgroundColor({ color: "#F59D00" }); } catch {}
    try{ StatusBar.setStyle({ style: Style?.Dark || "DARK" }); } catch {}
    try{ StatusBar.show(); } catch {}
  }catch{}
}
// =========================
// END: Native StatusBar (Capacitor)
// =========================

/* ---------- DOM ---------- */
const boardArea = document.getElementById("boardArea");
const handArea = document.getElementById("handArea");
const statusBox = document.getElementById("statusBox");
const optionsBox = document.getElementById("optionsBox");
const scoreBox = document.getElementById("scoreBox");
const scoreChips = document.getElementById("scoreChips");
const boneyardLine = document.getElementById("boneyardLine");

const newGameBtn = document.getElementById("newGameBtn");
const drawBtn = document.getElementById("drawBtn");
const passBtn = document.getElementById("passBtn");
const menuBtn = document.getElementById("menuBtn");
const resumeBtn = document.getElementById("resumeBtn");
const backHomeBtn = document.getElementById("backHomeBtn");

const topMenuOverlay = document.getElementById("topMenuOverlay");
const topMenuBackdrop = document.getElementById("topMenuBackdrop");
const topMenuSheet = document.getElementById("topMenuSheet");
const closeTopMenuBtn = document.getElementById("closeTopMenuBtn");

/* Controls in top menu */
const aiDifficultySelect = document.getElementById("aiDifficultySelect");
const textSizeSelect = document.getElementById("textSizeSelect");
const dominoSkinSelect = document.getElementById("dominoSkinSelect");
const musicVolumeRange = document.getElementById("musicVolumeRange");
const sfxVolumeRange = document.getElementById("sfxVolumeRange");
const muteToggle = document.getElementById("muteToggle");
const highContrastToggle = document.getElementById("highContrastToggle");
const reduceMotionToggle = document.getElementById("reduceMotionToggle");

/* Premium controls */
const premiumGameCard = document.getElementById("premiumGameCard");
const premiumGameDesc = document.getElementById("premiumGameDesc");
const premiumGameStatus = document.getElementById("premiumGameStatus");
const upgradePremiumBtn = document.getElementById("upgradePremiumBtn");
const restorePremiumBtn = document.getElementById("restorePremiumBtn");
const privacyBtn = document.getElementById("privacyBtn");
const themeGallery = document.getElementById("themeGallery");
const packStoreBtn = document.getElementById("packStoreBtn");
const installPackBtn = document.getElementById("installPackBtn");

/* Instructions */
const instructionsBtn = document.getElementById("instructionsBtn");
const instructionsOverlay = document.getElementById("instructionsOverlay");
const instructionsCloseBtn = document.getElementById("instructionsCloseBtn");
const instructionsCloseX = document.getElementById("instructionsCloseX");

/* Game Over modal */
const gameOverOverlay = document.getElementById("gameOverOverlay");
const gameOverBody = document.getElementById("gameOverBody");
const gameOverNewGameBtn = document.getElementById("gameOverNewGameBtn");
const gameOverCloseBtn = document.getElementById("gameOverCloseBtn");
const gameCloseX = document.getElementById("gameCloseX");

/* Round Over modal */
const roundOverOverlay = document.getElementById("roundOverOverlay");
const roundOverBody = document.getElementById("roundOverBody");
const roundNextBtn = document.getElementById("roundNextBtn");
const roundCountdown = document.getElementById("roundCountdown");
const roundCloseX = document.getElementById("roundCloseX");

/* Rules modal */
const rulesOverlay = document.getElementById("rulesOverlay");
const rulesCloseBtn = document.getElementById("rulesCloseBtn");
const rulesCloseX = document.getElementById("rulesCloseX");
const rulesApplyBtn = document.getElementById("rulesApplyBtn");
const rulesResetBtn = document.getElementById("rulesResetBtn");
const rulesToggles = document.getElementById("rulesToggles");

/* ---------- Settings / Theme State ---------- */
const SETTINGS_KEY = "double12express.settings.v1";
const PACK_KEY = "double12express.activePack.v1";
const PLAYER_NAME_KEY = "double12express.playerName.v1";
const MUSIC_VOL_KEY = "double12express.musicVolume.v1";
const SFX_VOL_KEY = "double12express.sfxVolume.v1";
const MUTE_KEY = "double12express.mute.v1";
const TEXT_SIZE_KEY = "double12express.textSize.v1";
const CONTRAST_KEY = "double12express.highContrast.v1";
const REDUCE_MOTION_KEY = "double12express.reduceMotion.v1";
const AI_DIFF_KEY = "double12express.aiDifficulty.v1";

const DEFAULT_SETTINGS = {
  playerName: "Player",
  dominoSkin: "classic",
  aiDifficulty: "medium",
  textSize: "medium",
  highContrast: false,
  reduceMotion: false,
  musicVolume: 70,
  sfxVolume: 80,
  mute: false,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function saveSettings(next) {
  const safe = { ...DEFAULT_SETTINGS, ...(next || {}) };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(safe)); } catch {}
  return safe;
}

let settings = loadSettings();
let playerName = String(settings.playerName || "Player");
let aiDifficulty = String(settings.aiDifficulty || "medium");
let dominoSkin = sanitizeSkin(settings.dominoSkin || "classic");
let textSize = String(settings.textSize || "medium");
let highContrast = !!settings.highContrast;
let reduceMotion = !!settings.reduceMotion;
let musicVolume = Number(settings.musicVolume ?? 70);
let sfxVolume = Number(settings.sfxVolume ?? 80);
let muteAudio = !!settings.mute;

function persistSettings() {
  settings = saveSettings({
    playerName,
    dominoSkin,
    aiDifficulty,
    textSize,
    highContrast,
    reduceMotion,
    musicVolume,
    sfxVolume,
    mute: muteAudio,
  });
}

function applyGlobalUiClasses() {
  document.body.classList.remove("text-small", "text-medium", "text-large", "high-contrast", "reduce-motion", "theme-classic", "theme-irish", "theme-neon");
  document.body.classList.add(`text-${textSize}`);
  if (highContrast) document.body.classList.add("high-contrast");
  if (reduceMotion) document.body.classList.add("reduce-motion");
  if (["classic", "irish", "neon"].includes(dominoSkin)) document.body.classList.add(`theme-${dominoSkin}`);
}

/* ---------- Audio ---------- */
let activePack = DEFAULT_PACK;
let menuMusic = null;
let menuMusicPlaylist = [];
let menuMusicIndex = 0;
const audioCache = new Map();

function audioEnabled() {
  return !muteAudio;
}

function setAudioVolume(el, volPercent) {
  if (!el) return;
  const v = Math.max(0, Math.min(1, Number(volPercent || 0) / 100));
  try { el.volume = v; } catch {}
}

function getPackSfxUrl(name) {
  return activePack?.audio?.sfx?.[name] || "";
}

function getBuiltinSfxFallback(name) {
  const map = {
    place: "sounds/place.mp3",
    draw: "sounds/draw.mp3",
    pass: "sounds/pass.mp3",
    horn: "sounds/horn.mp3",
    win: "sounds/win.mp3",
    lose: "sounds/lose.mp3",
    intro: "sounds/intro.mp3",
    theme1: "sounds/theme1.mp3",
    theme2: "sounds/theme2.mp3",
  };
  return map[name] || "";
}

function resolveSfxUrl(name) {
  const packUrl = getPackSfxUrl(name);
  if (packUrl) return packUrl;
  return getBuiltinSfxFallback(name);
}

function playSfx(name) {
  if (!audioEnabled()) return;
  const url = resolveSfxUrl(name);
  if (!url) return;
  try {
    const a = new Audio(url);
    setAudioVolume(a, sfxVolume);
    a.play().catch(() => {});
  } catch {}
}

function stopMenuMusic() {
  try {
    if (menuMusic) {
      menuMusic.pause();
      menuMusic.src = "";
    }
  } catch {}
  menuMusic = null;
}

function rebuildAudioFromActivePack({ restartMusic = false } = {}) {
  menuMusicPlaylist = Array.isArray(activePack?.audio?.menuMusic) ? activePack.audio.menuMusic.slice() : [];
  if (!menuMusicPlaylist.length) {
    menuMusicPlaylist = ["sounds/theme1.mp3", "sounds/theme2.mp3"].filter(Boolean);
  }
  menuMusicIndex = 0;

  if (restartMusic) {
    stopMenuMusic();
    maybeStartMenuMusic();
  }
}

function maybeStartMenuMusic() {
  if (!audioEnabled()) return;
  if (menuMusic || !menuMusicPlaylist.length) return;
  try {
    menuMusic = new Audio(menuMusicPlaylist[menuMusicIndex] || menuMusicPlaylist[0]);
    menuMusic.loop = menuMusicPlaylist.length <= 1;
    setAudioVolume(menuMusic, musicVolume);
    menuMusic.addEventListener("ended", () => {
      if (menuMusicPlaylist.length > 1) {
        menuMusicIndex = (menuMusicIndex + 1) % menuMusicPlaylist.length;
        stopMenuMusic();
        maybeStartMenuMusic();
      }
    });
    menuMusic.play().catch(() => {
      stopMenuMusic();
    });
  } catch {}
}

function updateGameAudioToggleUI() {
  if (muteToggle) muteToggle.checked = !!muteAudio;
  if (musicVolumeRange) musicVolumeRange.value = String(musicVolume);
  if (sfxVolumeRange) sfxVolumeRange.value = String(sfxVolume);
}

function unlockAudioOnce() {
  maybeStartMenuMusic();
}
window.addEventListener("pointerdown", unlockAudioOnce, { once: true });
window.addEventListener("keydown", unlockAudioOnce, { once: true });

// =========================
// BEGIN: Suppress Samsung long-press copy/callout UI
// =========================
function shouldAllowNativeLongPress(target) {
  return !!target?.closest?.(
    'input, textarea, select, option, [contenteditable="true"]'
  );
}

document.addEventListener("contextmenu", (e) => {
  if (shouldAllowNativeLongPress(e.target)) return;
  e.preventDefault();
}, { capture: true });

document.addEventListener("selectstart", (e) => {
  if (shouldAllowNativeLongPress(e.target)) return;
  e.preventDefault();
}, { capture: true });
// =========================
// END: Suppress Samsung long-press copy/callout UI
// =========================

/* ---------- Prompts ---------- */
let __confirmResolve = null;
let confirmOverlay = null;
let confirmTitle = null;
let confirmBody = null;
let confirmOkBtn = null;
let confirmCancelBtn = null;
let confirmCloseBtn = null;

function ensureGamePromptModal() {
  if (confirmOverlay) return;
  confirmOverlay = document.createElement("div");
  confirmOverlay.id = "confirmOverlay";
  confirmOverlay.className = "overlay hidden";
  confirmOverlay.innerHTML = `
    <div class="modal" style="width:min(560px,100%);">
      <div class="modal-head">
        <h2 id="confirmTitle">Notice</h2>
        <button id="confirmCloseBtn" class="icon-btn" aria-label="Close">✕</button>
      </div>
      <div id="confirmBody" class="modal-body" style="white-space:pre-wrap;"></div>
      <div class="modal-actions">
        <button id="confirmCancelBtn" class="ghost-btn" type="button">Cancel</button>
        <button id="confirmOkBtn" class="solid-btn" type="button">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmOverlay);
  confirmTitle = document.getElementById("confirmTitle");
  confirmBody = document.getElementById("confirmBody");
  confirmOkBtn = document.getElementById("confirmOkBtn");
  confirmCancelBtn = document.getElementById("confirmCancelBtn");
  confirmCloseBtn = document.getElementById("confirmCloseBtn");

  confirmCloseBtn.onclick = () => closeGamePrompt(false);
  confirmOverlay.onclick = (e) => {
    if (e.target === confirmOverlay) closeGamePrompt(false);
  };
}

function closeGamePrompt(result = false) {
  if (!confirmOverlay) return;
  hideOverlay(confirmOverlay);
  const resolve = __confirmResolve;
  __confirmResolve = null;
  if (resolve) resolve(!!result);
}

async function showGamePrompt({ title = "Notice", message = "", okText = "OK", cancelText = "Cancel", showCancel = true } = {}) {
  ensureGamePromptModal();
  confirmTitle.textContent = title;
  confirmBody.textContent = String(message || "");
  confirmOkBtn.textContent = okText;
  confirmCancelBtn.textContent = cancelText;
  confirmCancelBtn.style.display = showCancel ? "inline-flex" : "none";

  confirmOkBtn.onclick = () => closeGamePrompt(true);
  confirmCancelBtn.onclick = () => closeGamePrompt(false);

  try {
    confirmOverlay.style.zIndex = "2147483647";
    document.body.appendChild(confirmOverlay);
  } catch {}
  showOverlay(confirmOverlay);

  window.setTimeout(() => {
    try { confirmOkBtn.focus(); } catch {}
  }, 0);

  return new Promise((resolve) => {
    __confirmResolve = resolve;
  });
}

async function showGameAlert(title, message) {
  return showGamePrompt({ title, message, okText: "OK", showCancel: false });
}

/* ---------- Premium shell ---------- */
const PREMIUM_STORE_NAME = "Double 12 Express Premium";
const PREMIUM_MESSAGE = "Premium removes ads and unlocks all built-in themes and premium rules.";

function isPremiumUnlockedLocal() {
  return isPremiumEntitled();
}

function isPremiumRulesPresetValue(v) {
  return String(v || "") === "premium";
}

async function refreshPremiumShellUi() {
  const owned = isPremiumUnlockedLocal();

  if (premiumGameCard) premiumGameCard.style.display = "";
  if (premiumGameDesc) {
    premiumGameDesc.textContent = owned
      ? "Premium unlocked. Ads are removed and all built-in themes are available."
      : "Remove ads and unlock all built-in themes.";
  }
  if (premiumGameStatus) {
    premiumGameStatus.textContent = owned
      ? "Premium is active on this device."
      : "Free tier: Classic theme only. Premium themes and premium rules are locked.";
  }
  if (upgradePremiumBtn) {
    upgradePremiumBtn.textContent = owned ? "Premium Active" : "Upgrade to Premium";
    upgradePremiumBtn.disabled = owned;
  }
  if (installPackBtn) installPackBtn.disabled = !owned;

  if (owned) {
    await hideAllAds();
  } else {
    await showBannerIfEligible();
  }

  // Coerce locked selections back to free-safe options.
  if (!owned) {
    if (["irish", "neon"].includes(dominoSkin)) dominoSkin = "classic";
    if (isPremiumRulesPresetValue(getSelectedPreset())) {
      const standard = document.querySelector('input[name="rules_preset"][value="standard"]');
      if (standard) standard.checked = true;
    }
  }

  syncMenuDrivenSettings();
  await renderThemeGallery();
}

async function launchPremiumPurchase(featureLabel = "Premium features") {
  if (isPremiumUnlockedLocal()) {
    await refreshPremiumShellUi();
    return true;
  }

  try {
    try { closeTopMenu(); } catch {}
    try { hideOverlay(settingsOverlay); } catch {}

    const result = await buyPremiumUnlock();
    const ownedNow = isPremiumUnlockedLocal();

    await refreshPremiumShellUi();

    const success =
      ownedNow ||
      result === true ||
      result?.ok === true ||
      result?.purchased === true ||
      result?.owned === true ||
      result?.status === "purchased" ||
      result?.status === "owned";

    if (!success) {
      await showGameAlert(
        "Premium Unlock",
        "The Google Play purchase flow did not open or did not complete. Billing may not be available in this build or environment."
      );
      return false;
    }

    return true;
  } catch (err) {
    const msg = String(err?.message || err || "Google Play purchase was not completed.");
    await showGameAlert("Premium Unlock", msg);
    return false;
  }
}

async function showPremiumUpsell(featureLabel = "that feature") {
  const goBuy = await showGamePrompt({
    title: PREMIUM_STORE_NAME,
    message:
      `${PREMIUM_MESSAGE}\n\n` +
      `Feature: ${featureLabel}\n\n` +
      `Tap OK to open the Google Play purchase flow now, or Cancel to keep playing.`,
    okText: "Open Google Play",
    cancelText: "Cancel",
    showCancel: true,
  });

  if (goBuy) {
    closeTopMenu();
    hideOverlay(settingsOverlay);
    void launchPremiumPurchase(featureLabel);
  }
}

function coerceFreeTierDifficulty(v) {
  const s = String(v || "medium").toLowerCase();
  return ["easy", "medium", "hard", "expert"].includes(s) ? s : "medium";
}

/* ---------- Rules Modal wiring ---------- */
const RULE_PRESETS = {
  standard: {
    startDoubleDescending: true,
    drawUntilStartDouble: true,
    fallbackHighestDouble: true,
    autoPassAfterPlay: true,
    allowMultipleAfterSatisfy: false,
    doubleMustBeSatisfied: true,
    unsatisfiedDoubleEndsRound: true,
    mexAlwaysOpen: true,
    openTrainOnNoMove: true,
  },
  beginner: {
    startDoubleDescending: true,
    drawUntilStartDouble: true,
    fallbackHighestDouble: true,
    autoPassAfterPlay: true,
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
    autoPassAfterPlay: true,
    allowMultipleAfterSatisfy: false,
    doubleMustBeSatisfied: true,
    unsatisfiedDoubleEndsRound: true,
    mexAlwaysOpen: true,
    openTrainOnNoMove: true,
  },
  premium: {
    startDoubleDescending: true,
    drawUntilStartDouble: true,
    fallbackHighestDouble: true,
    autoPassAfterPlay: false,
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
    autoPassAfterPlay: document.getElementById("r_autoPassAfterPlay").checked,
    allowMultipleAfterSatisfy: document.getElementById("r_allowMultipleAfterSatisfy").checked,
    doubleMustBeSatisfied: document.getElementById("r_doubleMustBeSatisfied").checked,
    unsatisfiedDoubleEndsRound: document.getElementById("r_unsatisfiedDoubleEndsRound").checked,
    mexAlwaysOpen: document.getElementById("r_mexAlwaysOpen").checked,
    openTrainOnNoMove: document.getElementById("r_openTrainOnNoMove").checked,
  };
}

function applyPresetToToggles(presetKey) {
  const rules = structuredClone(RULE_PRESETS[presetKey] || RULE_PRESETS.standard);
  document.getElementById("r_startDoubleDescending").checked = !!rules.startDoubleDescending;
  document.getElementById("r_drawUntilStartDouble").checked = !!rules.drawUntilStartDouble;
  document.getElementById("r_fallbackHighestDouble").checked = !!rules.fallbackHighestDouble;
  document.getElementById("r_autoPassAfterPlay").checked = !!rules.autoPassAfterPlay;
  document.getElementById("r_allowMultipleAfterSatisfy").checked = !!rules.allowMultipleAfterSatisfy;
  document.getElementById("r_doubleMustBeSatisfied").checked = !!rules.doubleMustBeSatisfied;
  document.getElementById("r_unsatisfiedDoubleEndsRound").checked = !!rules.unsatisfiedDoubleEndsRound;
  document.getElementById("r_mexAlwaysOpen").checked = !!rules.mexAlwaysOpen;
  document.getElementById("r_openTrainOnNoMove").checked = !!rules.openTrainOnNoMove;
}

function computeRulesFromModal() {
  const preset = getSelectedPreset();
  if (preset === "custom") return getCustomRulesFromToggles();
  if (preset === "premium" && !isPremiumUnlockedLocal()) {
    return structuredClone(RULE_PRESETS.standard);
  }
  return structuredClone(RULE_PRESETS[preset] || RULE_PRESETS.standard);
}

function closeRules() {
  hideOverlay(rulesOverlay);
}

function openRules() {
  showOverlay(rulesOverlay);
  syncToggleEnabledState();
  const preset = getSelectedPreset();
  if (preset !== "custom") applyPresetToToggles(preset);
}

/* ---------- Engine ---------- */
let engine = new GameEngine({ maxPip: 12, playerCount: 4, handSize: 15, rules: activeRules });
let state = engine.newGame();
let selectedTileId = null;

/* AI */
let aiRunning = false;
let autoPlayP0 = false;
let autoPlayRunning = false;
let autoPlayIntervalId = null;

/* Log filter state */
let logFilterMode = "all";
let logSearch = "";
let renderMode = "pretty";

/* Modals / state */
let gameOverShown = false;
let roundTimer = null;
let roundSeconds = 30;
const packStore = new PackStore();
let installedPacksCache = [];
let suppressSettingsSync = false;

let p0SatisfiedThisTurn = false;
const aiSatisfiedThisTurn = new Map();

/* ---------- Helpers ---------- */
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

function isVisible(el) {
  if (!el) return false;
  return !el.classList.contains("hidden");
}

function isAnyModalOpen() {
  return isVisible(gameOverOverlay) || isVisible(roundOverOverlay) || isVisible(rulesOverlay) || isVisible(topMenuOverlay) || isVisible(instructionsOverlay) || isVisible(confirmOverlay);
}

function showOverlay(el) {
  if (!el) return;
  el.classList.remove("hidden");
  el.setAttribute("aria-hidden", "false");
}
function hideOverlay(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.setAttribute("aria-hidden", "true");
}

function openTopMenu() {
  showOverlay(topMenuOverlay);
}
function closeTopMenu() {
  hideOverlay(topMenuOverlay);
}

const settingsOverlay = topMenuOverlay;

function resetSatisfiedFlagsForNewTurn() {
  p0SatisfiedThisTurn = false;
  aiSatisfiedThisTurn.clear();
}
function markSatisfiedThisTurn(playerId) {
  if (playerId === 0) p0SatisfiedThisTurn = true;
  else aiSatisfiedThisTurn.set(playerId, true);
}
function didSatisfyThisTurn(playerId) {
  if (playerId === 0) return p0SatisfiedThisTurn;
  return !!aiSatisfiedThisTurn.get(playerId);
}

function setPlayerNameOnState() {
  try {
    if (state?.players?.[0]) state.players[0].name = playerName || "Player";
  } catch {}
}

function currentSkinFolder() {
  if (["classic", "irish", "neon"].includes(dominoSkin)) return dominoSkin;
  return dominoSkin || "classic";
}

function persistTheme() {
  persistSettings();
  try { localStorage.setItem(PACK_KEY, dominoSkin); } catch {}
}

function loadPersistedTheme() {
  try {
    const raw = localStorage.getItem(PACK_KEY);
    if (raw) dominoSkin = sanitizeSkin(raw);
  } catch {}
}

function applyPlayerNamesToState() {
  try {
    if (state?.players?.[0]) {
      state.players[0].displayName = playerName || "Player";
    }
    for (let i = 1; i < (state?.players?.length || 0); i++) {
      if (!state.players[i].displayName) state.players[i].displayName = `P${i}`;
    }
  } catch {}
}

function canHumanPass() {
  if (state.currentPlayer !== 0) return false;

  const legal = engine.getLegalMoves(0);
  if (state.pendingDouble) {
    if (legal.length > 0) return false;
    return state.deck.length === 0 || state.turnHasDrawn;
  }
  if (activeRules.allowMultipleAfterSatisfy && didSatisfyThisTurn(0)) return true;
  if (legal.length > 0) return false;
  return state.deck.length === 0 || state.turnHasDrawn;
}

function computeOptionsText() {
  if (state.matchOver) return "Match over.";
  if (state.roundOver) return "Round over — waiting to start next round.";
  if (state.currentPlayer !== 0) return `Waiting for opponents… (P${state.currentPlayer})`;
  if (state.pendingDouble) {
    const legal = engine.getLegalMoves(0);
    if (legal.length > 0) return `A double must be satisfied on ${state.pendingDouble.trainKey}.`;
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
    .map(p => ({ id: p.id, score: p.score, hand: p.hand.length }))
    .sort((a, b) => a.score - b.score);

  const lines = [];
  lines.push(`Round: ${state.round}/${state.roundsTotal}`);
  lines.push(state.matchOver ? "Match: OVER" : (state.roundOver ? "Match: paused (round over)" : "Match: active"));
  lines.push("");
  lines.push("Ranking (lowest wins):");
  sorted.forEach((p, i) => lines.push(`${i + 1}. P${p.id} — ${p.score} pts (hand ${p.hand})`));
  return lines.join("\n");
}

function syncMenuDrivenSettings() {
  if (suppressSettingsSync) return;
  if (aiDifficultySelect) aiDifficultySelect.value = aiDifficulty;
  if (textSizeSelect) textSizeSelect.value = textSize;
  if (dominoSkinSelect) dominoSkinSelect.value = dominoSkin;
  if (musicVolumeRange) musicVolumeRange.value = String(musicVolume);
  if (sfxVolumeRange) sfxVolumeRange.value = String(sfxVolume);
  if (muteToggle) muteToggle.checked = !!muteAudio;
  if (highContrastToggle) highContrastToggle.checked = !!highContrast;
  if (reduceMotionToggle) reduceMotionToggle.checked = !!reduceMotion;
  applyGlobalUiClasses();
}

function applyMenuDrivenSettings() {
  suppressSettingsSync = true;
  try {
    aiDifficulty = coerceFreeTierDifficulty(aiDifficultySelect?.value || aiDifficulty);
    textSize = String(textSizeSelect?.value || textSize || "medium");
    let nextSkin = sanitizeSkin(dominoSkinSelect?.value || dominoSkin);
    if (!isPremiumUnlockedLocal() && ["irish", "neon"].includes(nextSkin)) {
      nextSkin = "classic";
      if (dominoSkinSelect) dominoSkinSelect.value = nextSkin;
    }
    dominoSkin = nextSkin;
    musicVolume = Number(musicVolumeRange?.value || musicVolume || 70);
    sfxVolume = Number(sfxVolumeRange?.value || sfxVolume || 80);
    muteAudio = !!muteToggle?.checked;
    highContrast = !!highContrastToggle?.checked;
    reduceMotion = !!reduceMotionToggle?.checked;
    applyGlobalUiClasses();
    updateGameAudioToggleUI();
    persistTheme();
    rebuildAudioFromActivePack({ restartMusic: false });
  } finally {
    suppressSettingsSync = false;
  }
}

async function refreshInstalledPacksCache() {
  try { installedPacksCache = await packStore.listInstalled(); }
  catch { installedPacksCache = []; }
  return installedPacksCache;
}

function isThemeLocked(themeKey) {
  return ["irish", "neon"].includes(themeKey) && !isPremiumUnlockedLocal();
}

async function renderThemeGallery() {
  if (!themeGallery) return;
  await refreshInstalledPacksCache();
  const cards = [
    { key: "classic", label: "Classic", premium: false, description: "The default station look.", thumb: "packs/default/preview.svg" },
    { key: "irish", label: "Irish", premium: true, description: "Lucky green styling and Irish audio flair.", thumb: "packs/irish/thumbs/preview.png" },
    { key: "neon", label: "Neon", premium: true, description: "Bright neon dominoes for night-owl conductors.", thumb: "packs/neon/thumbs/preview.png" },
    ...installedPacksCache.map((p) => ({
      key: p.key,
      label: p.name || p.key,
      premium: false,
      description: `Installed pack • ${p.version || "1.0.0"}`,
      thumb: p.manifest?.assets?.thumb || p.manifest?.assets?.icon || "",
      installed: true,
    })),
  ];

  themeGallery.innerHTML = cards.map((t) => {
    const active = dominoSkin === t.key;
    const locked = isThemeLocked(t.key);
    return `
      <div class="theme-card ${active ? "is-active" : ""} ${locked ? "is-locked" : ""}">
        <div class="theme-card__thumb">
          ${t.thumb ? `<img src="${t.thumb}" alt="${t.label} preview">` : `<div class="help-text">No preview</div>`}
        </div>
        <div class="theme-card__body">
          <div class="theme-card__name">${t.label}</div>
          <div class="theme-card__meta">${t.description}</div>
          <div class="theme-card__status">${active ? "Currently selected" : (locked ? "Locked — Premium" : (t.installed ? "Installed pack" : "Built-in"))}</div>
          <div class="theme-card__actions">
            <button class="btn-small ${locked ? "" : "primary"}" data-theme-action="${t.key}" type="button">${locked ? "Preview" : (active ? "Selected" : "Use Theme")}</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  themeGallery.querySelectorAll("[data-theme-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.getAttribute("data-theme-action") || "classic";
      if (isThemeLocked(key)) {
        await showPremiumUpsell(`${key.charAt(0).toUpperCase() + key.slice(1)} theme`);
        return;
      }
      dominoSkin = sanitizeSkin(key);
      syncMenuDrivenSettings();
      persistTheme();
      try {
        if (["classic", "irish", "neon"].includes(dominoSkin)) {
          activePack = await loadBuiltInPackForSkin(dominoSkin);
        } else {
          const rec = installedPacksCache.find((p) => p.key === dominoSkin);
          activePack = mergeDefaults(rec?.manifest || DEFAULT_PACK);
        }
      } catch {
        activePack = DEFAULT_PACK;
      }
      applyPackUI(activePack);
      rebuildAudioFromActivePack({ restartMusic: false });
      await renderThemeGallery();
      paint();
    });
  });
}

async function ensureGamePremiumCta() {
  if (!upgradePremiumBtn || !restorePremiumBtn) return;

  upgradePremiumBtn.onclick = null;
  restorePremiumBtn.onclick = null;
  privacyBtn.onclick = null;

  upgradePremiumBtn.addEventListener("click", () => {
    closeTopMenu();
    hideOverlay(settingsOverlay);
    void launchPremiumPurchase("Premium features");
  });

  restorePremiumBtn.addEventListener("click", async () => {
    closeTopMenu();
    hideOverlay(settingsOverlay);
    try {
      const restored = await restorePremiumUnlock();
      await refreshPremiumShellUi();
      if (!restored) {
        await showGameAlert("Restore Purchase", "No premium purchase was found to restore on this device.");
      }
    } catch (err) {
      await showGameAlert("Restore Purchase", String(err?.message || err || "Unable to restore purchases right now."));
    }
  });

  privacyBtn?.addEventListener("click", () => { void openAdPrivacyOptions(); });
  packStoreBtn?.addEventListener("click", () => { void showGameAlert("Theme Store", "Theme Store opens from the in-game menu and supports installed zip packs on supported browsers."); });
  installPackBtn?.addEventListener("click", async () => {
    if (!isPremiumUnlockedLocal()) {
      await showPremiumUpsell("zip theme pack installs");
      return;
    }
    try {
      const rec = await packStore.pickAndInstallZip();
      if (rec) {
        dominoSkin = sanitizeSkin(rec.key);
        persistTheme();
        await refreshInstalledPacksCache();
        activePack = mergeDefaults(rec.manifest || DEFAULT_PACK);
        applyPackUI(activePack);
        rebuildAudioFromActivePack({ restartMusic: false });
        await renderThemeGallery();
        paint();
      }
    } catch (err) {
      await showGameAlert("Install Theme Pack", String(err?.message || err || "Failed to install theme pack."));
    }
  });
}

/* ---------- Pack loading ---------- */
function normalizeSkinFolderForAssets(raw) {
  const v = sanitizeSkin(raw || "classic").toLowerCase();
  if (v === "classic") return "default";
  return v;
}

async function loadBuiltInPackForSkin(skin) {
  const folder = normalizeSkinFolderForAssets(skin);
  try {
    const manifestUrl = `packs/${folder}/manifest.json`;
    return await loadPack(manifestUrl);
  } catch (err) {
    console.warn("[pack] manifest load failed, trying pack.json", err);
    try {
      return await loadPack(`packs/${folder}/pack.json`);
    } catch (err2) {
      console.warn("[pack] pack.json load failed, using default", err2);
      return DEFAULT_PACK;
    }
  }
}

/* ---------- Round/Game over ---------- */
function stopRoundCountdown() {
  if (roundTimer) {
    clearInterval(roundTimer);
    roundTimer = null;
  }
}

function showRoundOverIfNeeded() {
  if (!state.roundOver || state.matchOver || isVisible(roundOverOverlay)) return;
  const sum = state.lastRoundSummary;
  const lines = [];
  lines.push(sum?.reason || "Round over.");
  lines.push("");
  if (sum?.winners?.length) {
    lines.push(`Winner(s): ${sum.winners.map(id => `P${id}`).join(", ")}`);
    lines.push("");
  }
  if (sum?.roundAdds?.length) {
    lines.push("Points added this round:");
    const addsSorted = [...sum.roundAdds].sort((a, b) => a.added - b.added);
    addsSorted.forEach(r => lines.push(`P${r.id}: +${r.added} (total ${r.total})`));
    lines.push("");
  }
  if (sum?.ranking?.length) {
    lines.push("Current ranking (lowest wins):");
    sum.ranking.forEach((r, idx) => lines.push(`${idx + 1}. P${r.id} — ${r.score}`));
  }
  if (roundOverBody) roundOverBody.textContent = lines.join("\n");
  showOverlay(roundOverOverlay);

  stopRoundCountdown();
  roundSeconds = 30;
  if (roundCountdown) roundCountdown.textContent = `Next round starts in ${roundSeconds}s`;
  roundTimer = setInterval(() => {
    roundSeconds--;
    if (roundCountdown) roundCountdown.textContent = `Next round starts in ${roundSeconds}s`;
    if (roundSeconds <= 0) {
      stopRoundCountdown();
      advanceRound();
    }
  }, 1000);
}

function advanceRound() {
  stopRoundCountdown();
  hideOverlay(roundOverOverlay);
  state = engine.startNextRound();
  selectedTileId = null;
  resetSatisfiedFlagsForNewTurn();
  paint();
  ensureAI();
}

function showGameOverIfNeeded() {
  if (!state.matchOver || gameOverShown) return;
  const scores = state.players.map(p => ({ id: p.id, score: p.score })).sort((a, b) => a.score - b.score);
  const best = scores[0].score;
  const winners = scores.filter(s => s.score === best).map(s => `P${s.id}`).join(", ");
  const lines = [];
  lines.push(`Winner(s): ${winners}`);
  lines.push("");
  lines.push("Final Scores (lowest wins):");
  scores.forEach(s => lines.push(`P${s.id}: ${s.score}`));
  if (gameOverBody) gameOverBody.textContent = lines.join("\n");
  showOverlay(gameOverOverlay);
  gameOverShown = true;
}

/* ---------- Paint ---------- */
function paint() {
  applyPlayerNamesToState();
  setPlayerNameOnState();
  if (scoreBox) scoreBox.textContent = scoreboardText();
  if (optionsBox) optionsBox.textContent = computeOptionsText();

  const locked = state.matchOver || state.roundOver || (isAnyModalOpen() && !isVisible(topMenuOverlay));
  if (passBtn) passBtn.disabled = locked ? true : !canHumanPass();
  if (drawBtn) drawBtn.disabled = locked;
  if (boneyardLine) boneyardLine.textContent = `Boneyard: ${state.deck.length}`;

  render(state, {
    boardArea,
    handArea,
    statusBox,
    optionsBox,
    scoreBox,
    scoreChips,
    boneyardLine,
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

/* ---------- AI / autoplay ---------- */
function startAutoPlayWatchdog() {
  stopAutoPlayWatchdog();
  autoPlayIntervalId = setInterval(() => {
    if (!autoPlayP0) return;
    if (state.matchOver || state.roundOver) return;
    if (isAnyModalOpen()) return;
    if (state.currentPlayer === 0) runAutoPlayP0IfNeeded();
    else ensureAI();
  }, 250);
}
function stopAutoPlayWatchdog() {
  if (autoPlayIntervalId) {
    clearInterval(autoPlayIntervalId);
    autoPlayIntervalId = null;
  }
}

async function runAutoPlayP0IfNeeded() {
  if (!autoPlayP0 || autoPlayRunning || state.matchOver || state.roundOver || isAnyModalOpen() || state.currentPlayer !== 0) return;
  autoPlayRunning = true;
  try {
    await sleep(60);
    const tryPlayOne = () => {
      const moves = engine.getLegalMoves(0);
      if (moves.length === 0) return false;
      const d = chooseMove(engine, 0, aiDifficulty);
      const pick = (d?.type === "PLAY") ? d : { type: "PLAY", tileId: moves[0].tileId, target: moves[0].target };
      const hadPending = !!state.pendingDouble;
      state = engine.playTile(0, pick.tileId, pick.target);
      selectedTileId = null;
      paint();
      playSfx("place");
      if (hadPending && !state.pendingDouble) markSatisfiedThisTurn(0);
      return true;
    };

    if (state.pendingDouble) {
      const legal = engine.getLegalMoves(0);
      if (legal.length > 0) {
        tryPlayOne();
        if (state.pendingDouble) return;
      } else if (state.deck.length > 0 && !state.turnHasDrawn) {
        state = engine.draw(0); playSfx("draw"); paint(); return;
      } else {
        state = engine.pass(0); playSfx("pass"); resetSatisfiedFlagsForNewTurn(); paint(); return;
      }
    }

    if (!state.turnHasPlayed) {
      const played = tryPlayOne();
      if (!played) {
        if (state.deck.length > 0 && !state.turnHasDrawn) { state = engine.draw(0); playSfx("draw"); paint(); return; }
        state = engine.pass(0); playSfx("pass"); resetSatisfiedFlagsForNewTurn(); paint(); return;
      }
      if (state.pendingDouble) return;
    }

    if (activeRules.allowMultipleAfterSatisfy && didSatisfyThisTurn(0) && !state.pendingDouble) {
      while (true) {
        const moved = tryPlayOne();
        if (!moved || state.pendingDouble) break;
      }
    }

    if (!state.matchOver && !state.roundOver && !isAnyModalOpen() && state.currentPlayer === 0 && !state.pendingDouble) {
      try { state = engine.pass(0); playSfx("pass"); resetSatisfiedFlagsForNewTurn(); paint(); } catch {}
    }
  } catch (err) {
    state.log.push(`AUTO P0 ERROR: ${err?.message || err}`);
    paint();
  } finally {
    autoPlayRunning = false;
    if (autoPlayP0 && !state.matchOver && !state.roundOver && !isAnyModalOpen()) ensureAI();
  }
}

function ensureAI() {
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;
  if (state.currentPlayer === 0 && autoPlayP0) { runAutoPlayP0IfNeeded(); return; }
  if (state.currentPlayer === 0 || aiRunning) return;
  runAITurnsIfNeeded();
}

async function runAITurnsIfNeeded() {
  if (state.matchOver || state.roundOver || aiRunning) return;
  aiRunning = true;
  try {
    while (state.currentPlayer !== 0 && !state.matchOver && !state.roundOver && !isAnyModalOpen()) {
      const aiId = state.currentPlayer;
      await sleep(120);

      const tryPlayOneAI = async () => {
        const legal = engine.getLegalMoves(aiId);
        if (legal.length === 0) return false;
        const d = chooseMove(engine, aiId, aiDifficulty);
        const pick = (d?.type === "PLAY") ? d : { type: "PLAY", tileId: legal[0].tileId, target: legal[0].target };
        state = engine.playTile(aiId, pick.tileId, pick.target);
        paint(); playSfx("place");
        await sleep(90);
        return true;
      };

      try {
        if (state.pendingDouble) {
          const moved = await tryPlayOneAI();
          if (moved) {
            if (state.pendingDouble) continue;
            if (activeRules.allowMultipleAfterSatisfy && state.doubleSatisfiedThisTurn) {
              while (!state.pendingDouble) {
                const extra = await tryPlayOneAI();
                if (!extra) break;
              }
            }
            if (!state.pendingDouble && state.currentPlayer === aiId && !state.roundOver && !state.matchOver) {
              state = engine.pass(aiId); playSfx("pass"); paint();
            }
            continue;
          }
          if (state.deck.length > 0 && !state.turnHasDrawn) { state = engine.draw(aiId); playSfx("draw"); paint(); continue; }
          state = engine.pass(aiId); playSfx("pass"); paint(); continue;
        }

        const moved = await tryPlayOneAI();
        if (moved) {
          if (state.pendingDouble) continue;
          if (activeRules.allowMultipleAfterSatisfy && state.doubleSatisfiedThisTurn) {
            while (!state.pendingDouble) {
              const extra = await tryPlayOneAI();
              if (!extra) break;
            }
          }
          if (!state.pendingDouble && state.currentPlayer === aiId && !state.roundOver && !state.matchOver) {
            state = engine.pass(aiId); playSfx("pass"); paint();
          }
          continue;
        }
        if (state.deck.length > 0 && !state.turnHasDrawn) { state = engine.draw(aiId); playSfx("draw"); paint(); continue; }
        state = engine.pass(aiId); playSfx("pass"); paint();
      } catch (err) {
        state.log.push(`AI ERROR on P${aiId}: ${err?.message || err}`);
        try { state = engine.pass(aiId); } catch {}
        paint();
      }
    }
  } finally {
    aiRunning = false;
    if (autoPlayP0) ensureAI();
  }
}

/* ---------- Events ---------- */
aiDifficultySelect?.addEventListener("change", () => {
  aiDifficulty = coerceFreeTierDifficulty(aiDifficultySelect.value);
  persistSettings();
  paint();
});
textSizeSelect?.addEventListener("change", () => {
  textSize = String(textSizeSelect.value || "medium");
  applyGlobalUiClasses();
  persistSettings();
  paint();
});
dominoSkinSelect?.addEventListener("change", async () => {
  const next = sanitizeSkin(dominoSkinSelect.value || "classic");
  if (isThemeLocked(next)) {
    dominoSkinSelect.value = dominoSkin;
    await showPremiumUpsell(`${next} theme`);
    return;
  }
  dominoSkin = next;
  persistTheme();
  try {
    if (["classic", "irish", "neon"].includes(dominoSkin)) activePack = await loadBuiltInPackForSkin(dominoSkin);
    else {
      await refreshInstalledPacksCache();
      const rec = installedPacksCache.find((p) => p.key === dominoSkin);
      activePack = mergeDefaults(rec?.manifest || DEFAULT_PACK);
    }
  } catch { activePack = DEFAULT_PACK; }
  applyPackUI(activePack);
  rebuildAudioFromActivePack({ restartMusic: false });
  await renderThemeGallery();
  paint();
});
musicVolumeRange?.addEventListener("input", () => {
  musicVolume = Number(musicVolumeRange.value || 70);
  if (menuMusic) setAudioVolume(menuMusic, musicVolume);
  persistSettings();
});
sfxVolumeRange?.addEventListener("input", () => {
  sfxVolume = Number(sfxVolumeRange.value || 80);
  persistSettings();
});
muteToggle?.addEventListener("change", () => {
  muteAudio = !!muteToggle.checked;
  persistSettings();
  if (muteAudio) stopMenuMusic(); else maybeStartMenuMusic();
});
highContrastToggle?.addEventListener("change", () => {
  highContrast = !!highContrastToggle.checked;
  applyGlobalUiClasses();
  persistSettings();
});
reduceMotionToggle?.addEventListener("change", () => {
  reduceMotion = !!reduceMotionToggle.checked;
  applyGlobalUiClasses();
  persistSettings();
});

menuBtn?.addEventListener("click", () => openTopMenu());
resumeBtn?.addEventListener("click", () => closeTopMenu());
closeTopMenuBtn?.addEventListener("click", () => closeTopMenu());
topMenuBackdrop?.addEventListener("click", () => closeTopMenu());
backHomeBtn?.addEventListener("click", async () => {
  const ok = await showGamePrompt({
    title: "Back to Home",
    message: "Leave the current match and return to the home screen?",
    okText: "Leave Match",
    cancelText: "Stay Here",
    showCancel: true,
  });
  if (ok) window.location.href = "index.html";
});

instructionsBtn?.addEventListener("click", () => showOverlay(instructionsOverlay));
instructionsCloseBtn?.addEventListener("click", () => hideOverlay(instructionsOverlay));
instructionsCloseX?.addEventListener("click", () => hideOverlay(instructionsOverlay));
instructionsOverlay?.addEventListener("click", (e) => { if (e.target === instructionsOverlay) hideOverlay(instructionsOverlay); });

newGameBtn?.addEventListener("click", async () => {
  const ok = await showGamePrompt({
    title: "New Game",
    message: "Start a fresh match now? Current progress for this match will be lost.",
    okText: "Start New Game",
    cancelText: "Cancel",
    showCancel: true,
  });
  if (!ok) return;
  engine = new GameEngine({ maxPip: 12, playerCount: 4, handSize: 15, rules: activeRules });
  state = engine.newGame();
  selectedTileId = null;
  gameOverShown = false;
  resetSatisfiedFlagsForNewTurn();
  closeTopMenu();
  paint();
  ensureAI();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (isVisible(instructionsOverlay)) hideOverlay(instructionsOverlay);
    else if (isVisible(rulesOverlay)) closeRules();
    else if (isVisible(topMenuOverlay)) closeTopMenu();
  }
});

rulesCloseBtn?.addEventListener("click", closeRules);
rulesCloseX?.addEventListener("click", closeRules);
rulesOverlay?.addEventListener("click", (e) => {
  if (e.target === rulesOverlay) closeRules();
});

document.querySelectorAll('input[name="rules_preset"]').forEach(r => {
  r.addEventListener("change", async () => {
    const preset = getSelectedPreset();
    if (preset === "premium" && !isPremiumUnlockedLocal()) {
      const fallback = document.querySelector('input[name="rules_preset"][value="standard"]');
      if (fallback) fallback.checked = true;
      syncToggleEnabledState();
      await showPremiumUpsell("Premium Rules preset");
      applyPresetToToggles("standard");
      return;
    }
    syncToggleEnabledState();
    if (preset !== "custom") applyPresetToToggles(preset);
  });
});

const premiumRuleRows = Array.from(document.querySelectorAll('.premium-lockable[data-premium-feature]'));
premiumRuleRows.forEach((row) => {
  row.addEventListener("click", async (e) => {
    const feature = row.getAttribute("data-premium-feature") || "Premium feature";
    if (!row.classList.contains("is-locked")) return;
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.closest("input"))) e.preventDefault();
    await showPremiumUpsell(feature);
  }, true);
});

rulesApplyBtn?.addEventListener("click", () => {
  activeRules = computeRulesFromModal();
  engine = new GameEngine({ maxPip: 12, playerCount: 4, handSize: 15, rules: activeRules });
  state = engine.newGame();
  selectedTileId = null;
  gameOverShown = false;
  resetSatisfiedFlagsForNewTurn();
  closeRules();
  paint();
  ensureAI();
});

rulesResetBtn?.addEventListener("click", () => {
  const standard = document.querySelector('input[name="rules_preset"][value="standard"]');
  if (standard) standard.checked = true;
  applyPresetToToggles("standard");
  activeRules = structuredClone(RULE_PRESETS.standard);
  syncToggleEnabledState();
});

logFilterSelect?.addEventListener("change", () => { logFilterMode = logFilterSelect.value; paint(); });
logSearchInput?.addEventListener("input", () => { logSearch = logSearchInput.value || ""; paint(); });
logClearBtn?.addEventListener("click", () => {
  logFilterMode = "all";
  logSearch = "";
  if (logFilterSelect) logFilterSelect.value = "all";
  if (logSearchInput) logSearchInput.value = "";
  paint();
});

handArea?.addEventListener("click", (e) => {
  const tileEl = e.target.closest(".tile");
  if (!tileEl || tileEl.disabled) return;
  if (state.currentPlayer !== 0) return;
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;
  selectedTileId = tileEl.dataset.tileId;
  paint();
});

boardArea?.addEventListener("click", (e) => {
  const dz = e.target.closest(".dropzone");
  if (!dz) return;
  if (state.currentPlayer !== 0) return;
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;
  if (!selectedTileId) return alert("Select a tile first.");
  const target = JSON.parse(dz.dataset.target);
  try {
    const hadPending = !!state.pendingDouble;
    state = engine.playTile(0, selectedTileId, target);
    selectedTileId = null;
    if (hadPending && !state.pendingDouble) markSatisfiedThisTurn(0);
    playSfx("place");
    paint();

    const allowExtraWindow = activeRules.allowMultipleAfterSatisfy && didSatisfyThisTurn(0) && !state.pendingDouble;
    const shouldAutoPass = !!activeRules.autoPassAfterPlay && !state.pendingDouble && !state.roundOver && !state.matchOver && !allowExtraWindow;
    if (shouldAutoPass) {
      state = engine.pass(0);
      playSfx("pass");
      resetSatisfiedFlagsForNewTurn();
      paint();
    }
  } catch (err) {
    alert(err.message);
  } finally {
    ensureAI();
  }
});

drawBtn?.addEventListener("click", () => {
  if (state.currentPlayer !== 0 || state.matchOver || state.roundOver || isAnyModalOpen()) return;
  try {
    state = engine.draw(0);
    playSfx("draw");
    paint();
  } catch (err) { alert(err.message); }
  finally { ensureAI(); }
});

passBtn?.addEventListener("click", () => {
  if (!canHumanPass()) return;
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;
  try {
    state = engine.pass(0);
    playSfx("pass");
    resetSatisfiedFlagsForNewTurn();
    paint();
  } catch (err) { alert(err.message); }
  finally { ensureAI(); }
});

roundNextBtn?.addEventListener("click", advanceRound);
roundCloseX?.addEventListener("click", advanceRound);

gameOverNewGameBtn?.addEventListener("click", () => {
  stopRoundCountdown();
  hideOverlay(roundOverOverlay);
  hideOverlay(gameOverOverlay);
  gameOverShown = false;
  engine = new GameEngine({ maxPip: 12, playerCount: 4, handSize: 15, rules: activeRules });
  state = engine.newGame();
  selectedTileId = null;
  resetSatisfiedFlagsForNewTurn();
  paint();
  ensureAI();
});

gameOverCloseBtn?.addEventListener("click", () => hideOverlay(gameOverOverlay));
gameCloseX?.addEventListener("click", () => hideOverlay(gameOverOverlay));

window.addEventListener("premium-status-changed", () => { void refreshPremiumShellUi(); });

/* ---------- Boot ---------- */
(async function boot() {
  initNativeStatusBar();
  loadPersistedTheme();
  settings = loadSettings();
  playerName = String(settings.playerName || playerName || "Player");
  aiDifficulty = String(settings.aiDifficulty || aiDifficulty || "medium");
  dominoSkin = sanitizeSkin(settings.dominoSkin || dominoSkin || "classic");
  textSize = String(settings.textSize || textSize || "medium");
  highContrast = !!settings.highContrast;
  reduceMotion = !!settings.reduceMotion;
  musicVolume = Number(settings.musicVolume ?? musicVolume ?? 70);
  sfxVolume = Number(settings.sfxVolume ?? sfxVolume ?? 80);
  muteAudio = !!settings.mute;

  syncMenuDrivenSettings();
  setPlayerNameOnState();

  try {
    if (["classic", "irish", "neon"].includes(dominoSkin)) {
      activePack = await loadBuiltInPackForSkin(dominoSkin);
    } else {
      await refreshInstalledPacksCache();
      const rec = installedPacksCache.find((p) => p.key === dominoSkin);
      activePack = mergeDefaults(rec?.manifest || DEFAULT_PACK);
    }
  } catch {
    activePack = DEFAULT_PACK;
  }
  applyPackUI(activePack);
  rebuildAudioFromActivePack({ restartMusic: false });
  await refreshPremiumShellUi();
  await ensureGamePremiumCta();

  applyPresetToToggles("standard");
  syncToggleEnabledState();

  try {
    paint();
    ensureAI();
  } catch (err) {
    console.error("BOOT CRASH:", err);
    if (statusBox) statusBox.textContent = `BOOT CRASH: ${err?.message || String(err)}`;
    throw err;
  }
})();

async function awaitMaybeEnsureAI() {
  await sleep(0);
  ensureAI();
}
// END: js/main.js
