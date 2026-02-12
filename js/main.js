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
const logFilterSelect = document.getElementById("logFilterSelect");
const logSearchInput = document.getElementById("logSearchInput");
const logClearBtn = document.getElementById("logClearBtn");
const renderModeSelect = document.getElementById("renderModeSelect");

// IMPORTANT: keep this defined even if the element is removed from game.html
// (it will just be null, and our later "if (dominoSkinSelect)" checks will safely skip)
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

// sanitizeSkin is shared in settings.js (imported above)

function readDominoSkinSetting() {
  // Menu first, then mt_dominoSkin, then default
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
  // Train vibes
  "Diesel", "Caboose", "Switch", "Conductor", "Whistle",
  "Railjack", "Signal", "Turntable", "Sleeper", "Ballast",
  "Boxcar", "Hopper", "Tanker",

  // Domino vibes
  "Pip Wizard", "Double Trouble", "Lucky 12",
  "Bone Yard Bill", "Sidecar Sam", "Express Eddie",
  "Pip-Pip Hooray", "Bone-yard Bandit", "Dots Entertainment",
  "Double or Nothing", "Pip-Squeak", "The Pip-Line",
  "Double Header", "Main Line Bone", "The Pip-Express", "Conductor Pip",

  // Chaos / personality
  "Wildcard", "Gremlin", "Chaos Engine", "No Mercy", "Fast Hands",

  // Fun techy
  "Byte Bandit", "Pixel Pete", "Neon Nova", "Domino Dan",

  // 3LD & friends
  "Trip", "Puppet", "Fergie", "Cooper", "Harper", "Dakota",
  "Sheena", "Booter", "Ed", "Kenny", "Targarean",

  // Puns
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

  // Fisher–Yates shuffle
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
  stableAiNames = pickUniqueAiNames(needed, taken); // uses your AI_NAME_POOL
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

  // Player 0
  state.players[0].name = p0Name;
  if (engine?.state?.players?.length) engine.state.players[0].name = p0Name;

  // AI players (stable + emoji by difficulty)
  const emo = getDifficultyEmoji(typeof aiDifficulty === "undefined" ? "normal" : aiDifficulty);
  for (let i = 1; i < state.players.length; i++) {
    const nm = `${emo} ${stableAiNames[i - 1] || `AI ${i}`}`;
    state.players[i].name = nm;
    if (engine?.state?.players?.length) engine.state.players[i].name = nm;
  }
}


/* ---------- Rules ---------- */
/* NOTE: engine.js DEFAULT_RULES does NOT include autoPassAfterPlay.
   We keep it out here to avoid “phantom toggles”. */

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

// Debug: expose state/engine in DevTools without polluting game logic
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

/* ---------- Responsive sizing (small board + responsive) ---------- */

/* NOTE: Tile sizing is controlled by styles.css (no JS overrides). */

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

  // If a double is pending, passing is only allowed if:
  // - you have no legal satisfy move
  // - and you cannot draw anymore (deck empty OR already drew)
  if (state.pendingDouble) {
    const legal = engine.getLegalMoves(0);
    if (legal.length > 0) return false;
    return state.deck.length === 0 || state.turnHasDrawn;
  }

  // ✅ Core fix: after you have played your one allowed tile, you must be able to end your turn.
  if (state.turnHasPlayed) return true;

  // Otherwise, you can only pass if you have no legal moves AND you can't draw.
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

function syncMenuDrivenSettings() {
  dominoSkin = readDominoSkinSetting();
  writeDominoSkinSetting(dominoSkin);
}

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

  while (state.currentPlayer !== 0 && !state.matchOver && !state.roundOver && !isAnyModalOpen()) {
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

        state = engine.playTile(pid, move.tileId, move.target);

        // End turn ONLY if it's still that player's turn
        if (!state.pendingDouble && state.currentPlayer === pid) {
          state = engine.pass(pid);
        }
      } else {
        if (state.deck.length > 0 && !state.turnHasDrawn) state = engine.draw(pid);
        else state = engine.pass(pid);
      }

      applyPlayerNamesToState();
      paint();

      await sleep(Math.random() * 450 + 550);
    } catch (err) {
      const msg = String(err?.message || err);

      // benign boundaries
      if (msg.includes("Round is over") || state.roundOver || state.matchOver) return;

      console.error("AI loop error:", err);

      // critical: do not get stuck on “Waiting…”
      // try again next tick
      setTimeout(() => { aiRunning = false; ensureAI(); }, 0);
      return;
    } finally {
      aiRunning = false;
    }
  }
}
// END: ensureAI (validated AI moves; prevents “waiting forever”)


function awaitMaybeEnsureAI() {
  if (state.roundOver || state.matchOver) return Promise.resolve();
  return ensureAI();
}



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
      const move = chooseMove(engine, 0, aiDifficulty) || legal[0];
      state = engine.playTile(0, move.tileId, move.target);
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
        // stop autoplay gracefully at boundaries
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
  // Prevent double-fire (timer + click)
  if (!state.roundOver) return;
  stopAutoPlayWatchdog();
  autoPlayP0 = false;
  stopRoundCountdown();
  hideOverlay(roundOverOverlay);

  state = engine.startNextRound();

  // ✅ keep names stable when round state refreshes
  resetStableAiNames({ force: false });
  applyPlayerNamesToState();

  selectedTileId = null;
  gameOverShown = false;

  paint();
  ensureAI();


  // Kick AI immediately if next player is AI
  try { awaitMaybeEnsureAI(); } catch {}
}


function showGameOverIfNeeded() {
  if (!state.matchOver) return;
  if (gameOverShown) return;
  gameOverShown = true;
  recordHighScoreIfNeeded();

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
    // don't block game over modal if something goes wrong
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
    // Only enable if passing is actually legal (prevents "why won't it let me??" moments)
    passBtn.disabled = locked || !myTurn || !canHumanPass();
  }

  if (boneyardLine) boneyardLine.textContent = `Boneyard: ${state.deck.length}`;

  render(state, {
    engine, // ✅ critical
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

  highScoreCaptured = false;
  // ✅ load persisted AI names (don’t reshuffle)
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

  // New difficulty = new “cast” (your request)
  resetStableAiNames({ force: true });
  applyPlayerNamesToState();

  logMsg(`AI difficulty -> ${aiDifficulty}`, { kind: "rules" });
  paint();
  ensureAI();
});


autoPlayToggle?.addEventListener("change", () => {
  const prev = autoPlayP0;
  autoPlayP0 = !!autoPlayToggle.checked;
  state.log?.push?.(`Auto P0 -> ${autoPlayP0 ? "ON" : "OFF"}`);
  if (autoPlayP0 && !prev) startAutoPlayWatchdog();
  if (!autoPlayP0 && prev) stopAutoPlayWatchdog();
  paint();
  ensureAI();
});

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

  selectedTileId = tileEl.dataset.tileId; // string id
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

  state = engine.playTile(0, move.tileId, move.target);
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
  paint();
  ensureAI();
});

drawBtn?.addEventListener("click", () => {
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;
  if (state.currentPlayer !== 0) return;

  try {
    // Capture who is playing before the action
    const previousPlayerId = state.currentPlayer;
    
    state = engine.draw(0);

    // If the state.currentPlayer changed, the Engine already auto-passed for us.
    if (state.currentPlayer !== previousPlayerId) {
      logMsg("Drawn tile not playable. Auto-passed.", { kind: "pass" });
    } else {
      // If we are still the current player, it means we have a move.
      // We do NOT need to manually pass here.
      logMsg("Drawn tile is playable!", { kind: "draw" });
    }

    applyPlayerNamesToState();
    paint();
    ensureAI(); // This will now run correctly because no error was thrown
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
  if (e.key === "mt_dominoSkin" || e.key === MENU_SETTINGS_KEY) paint();
});

/* ---------- Boot ---------- */

paint();
ensureAI();
// END: js/main.js