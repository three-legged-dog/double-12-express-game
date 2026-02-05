/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company 
 * All rights reserved.
 */

// BEGIN: js/main.js
import { GameEngine } from "./engine.js";
import { render } from "./ui.js";
import { chooseMove } from "./ai.js";

/* ---------- DOM ---------- */

const boardArea = document.getElementById("boardArea");
const handArea = document.getElementById("handArea");
const statusBox = document.getElementById("statusBox");
const logBox = document.getElementById("logBox");
const optionsBox = document.getElementById("optionsBox");
const scoreBox = document.getElementById("scoreBox");
const boneyardLine = document.getElementById("boneyardLine");

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
const dominoSkinSelect = document.getElementById("dominoSkinSelect");

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

/* ---------- Rules Modal wiring (DOM first!) ---------- */

const rulesBtn = document.getElementById("rulesBtn");
const rulesOverlay = document.getElementById("rulesOverlay");
const rulesCloseBtn = document.getElementById("rulesCloseBtn");
const rulesCloseX = document.getElementById("rulesCloseX");
const rulesApplyBtn = document.getElementById("rulesApplyBtn");
const rulesResetBtn = document.getElementById("rulesResetBtn");
const rulesToggles = document.getElementById("rulesToggles");

/* ---------- Rules -> Config wiring ---------- */

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
    autoPassAfterPlay: false,
    allowMultipleAfterSatisfy: true,
    doubleMustBeSatisfied: true,
    unsatisfiedDoubleEndsRound: true,
    mexAlwaysOpen: true,
    openTrainOnNoMove: true,
  }
};

// Used when starting a NEW match
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
  const rules = RULE_PRESETS[presetKey] || RULE_PRESETS.standard;
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
  return structuredClone(RULE_PRESETS[preset] || RULE_PRESETS.standard);
}

function openRules() {
  rulesOverlay?.classList.remove("hidden");
  syncToggleEnabledState();

  // If preset is not custom, ensure toggles reflect it (nice UX)
  const preset = getSelectedPreset();
  if (preset !== "custom") applyPresetToToggles(preset);
}

function closeRules() {
  rulesOverlay?.classList.add("hidden");
}

/* Rules modal listeners (single source of truth) */
rulesBtn?.addEventListener("click", openRules);
rulesCloseBtn?.addEventListener("click", closeRules);
rulesCloseX?.addEventListener("click", closeRules);

rulesOverlay?.addEventListener("click", (e) => {
  if (e.target === rulesOverlay) closeRules();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && rulesOverlay && !rulesOverlay.classList.contains("hidden")) closeRules();
});

document.querySelectorAll('input[name="rules_preset"]').forEach(r => {
  r.addEventListener("change", () => {
    const preset = getSelectedPreset();
    syncToggleEnabledState();
    if (preset !== "custom") applyPresetToToggles(preset);
  });
});

rulesApplyBtn?.addEventListener("click", () => {
  activeRules = computeRulesFromModal();

  // Apply immediately by rebuilding engine + restarting match
  engine = new GameEngine({ maxPip: 12, playerCount: 4, handSize: 15, rules: activeRules });
  state = engine.newGame();


  debugSnapshot("RULES APPLY - after newGame");

  selectedTileId = null;
  gameOverShown = false;
  resetSatisfiedFlagsForNewTurn(state.currentPlayer);

  closeRules();

  paint();
  debugSnapshot("RULES APPLY - after paint");

  // Let UI paint before AI potentially plays
  setTimeout(() => {
    ensureAI();
    debugSnapshot("RULES APPLY - after ensureAI");
  }, 0);

});


rulesResetBtn?.addEventListener("click", () => {
  document.querySelector('input[name="rules_preset"][value="standard"]').checked = true;
  applyPresetToToggles("standard");
  activeRules = structuredClone(RULE_PRESETS.standard);
  syncToggleEnabledState();
});

/* ---------- Engine ---------- */

let engine = new GameEngine({ maxPip: 12, playerCount: 4, handSize: 15, rules: activeRules });

let state = engine.newGame();
let selectedTileId = null;

/* AI */
let aiRunning = false;
let aiDifficulty = aiDifficultySelect?.value || "normal";

/* Auto-play for Player 0 */
let autoPlayP0 = !!autoPlayToggle?.checked;
let autoPlayRunning = false;
let autoPlayIntervalId = null;

/* Log filter state */
let logFilterMode = "all";
let logSearch = "";

// BEGIN: Menu settings bridge (domino pack -> in-game skin)
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

// UI Render options
let renderMode = localStorage.getItem("mt_renderMode") || (renderModeSelect?.value || "pretty");

// Priority: mt_dominoSkin -> menu dominoPack -> dropdown/default
let dominoSkin =
  localStorage.getItem("mt_dominoSkin") ||
  (readMenuSettings()?.dominoPack) ||
  (dominoSkinSelect?.value || "default");
// END: Menu settings bridge (domino pack -> in-game skin)

// Sync dropdowns to persisted values
if (renderModeSelect) renderModeSelect.value = renderMode;
if (dominoSkinSelect) dominoSkinSelect.value = dominoSkin;

/* Modals */
let gameOverShown = false;
let roundTimer = null;
let roundSeconds = 30;

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// DEV ONLY: debug snapshot helper (prints to browser console)
function debugSnapshot(label) {
  try {
    const hands = state?.players?.map(p => p.hand.length) || [];
    const cp = state?.currentPlayer;
    const round = state?.round;
    const ruleDraw = !!(activeRules?.drawUntilStartDouble || engine?.rules?.drawUntilStartDouble);
    console.log(`[${label}] hands:`, hands, "| currentPlayer:", cp, "| round:", round, "| drawUntilStartDouble:", ruleDraw);
  } catch (e) {
    console.log(`[${label}] debugSnapshot failed:`, e?.message || e);
  }
}

function isVisible(el) {
  if (!el) return false;
  return !el.classList.contains("hidden");
}

function isAnyModalOpen() {
  return isVisible(gameOverOverlay) || isVisible(roundOverOverlay) || isVisible(rulesOverlay);
}

/* ---------- Multiple-play tracking (main.js owns this because engine doesn't) ---------- */

// Human (P0) satisfied-a-double this turn?
let p0SatisfiedThisTurn = false;

// For AI players, keyed by player id
const aiSatisfiedThisTurn = new Map();

function resetSatisfiedFlagsForNewTurn(nextPlayerId) {
  p0SatisfiedThisTurn = false;
  aiSatisfiedThisTurn.clear();
  // Keep it simple: satisfaction is only meaningful for the active player this turn.
  // We re-evaluate when someone satisfies a double.
}

function markSatisfiedThisTurn(playerId) {
  if (playerId === 0) p0SatisfiedThisTurn = true;
  else aiSatisfiedThisTurn.set(playerId, true);
}

function didSatisfyThisTurn(playerId) {
  if (playerId === 0) return p0SatisfiedThisTurn;
  return !!aiSatisfiedThisTurn.get(playerId);
}

/* ---------- Helpers ---------- */

function canHumanPass() {
  if (state.currentPlayer !== 0) return false;

  const legal = engine.getLegalMoves(0);

  // If a double is pending, you must satisfy it (or draw if possible)
  if (state.pendingDouble) {
    if (legal.length > 0) return false;
    return state.deck.length === 0 || state.turnHasDrawn;
  }

  // NEW: If we satisfied a double this turn and rule allows extra plays,
  // passing is allowed even if you still have legal moves (extra plays are optional).
  if (activeRules.allowMultipleAfterSatisfy && didSatisfyThisTurn(0)) {
    return true;
  }

  // Normal rules: pass only if you have no legal moves and cannot (or already did) draw
  if (legal.length > 0) return false;
  return state.deck.length === 0 || state.turnHasDrawn;
}

function computeOptionsText() {
  if (state.matchOver) return `Match over.`;
  if (state.roundOver) return `Round over — waiting to start next round.`;
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

function canContinuePlaysThisTurn() {
  return (
    !!activeRules.allowMultipleAfterSatisfy &&
    !!state.doubleSatisfiedThisTurn &&
    !state.pendingDouble
  );
}

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

/* ---------- Round Over ---------- */

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
  resetSatisfiedFlagsForNewTurn(state.currentPlayer);

  paint();
  ensureAI();
}

/* ---------- Game Over ---------- */

function showGameOverIfNeeded() {
  if (!state.matchOver) return;
  if (gameOverShown) return;

  const scores = state.players
    .map(p => ({ id: p.id, score: p.score }))
    .sort((a, b) => a.score - b.score);

  const best = scores[0].score;
  const winners = scores.filter(s => s.score === best).map(s => `P${s.id}`).join(", ");

  const lines = [];
  lines.push(`Winner(s): ${winners}`);
  lines.push("");
  lines.push("Final Scores (lowest wins):");
  scores.forEach(s => lines.push(`P${s.id}: ${s.score}`));
  lines.push("");
  lines.push("Final Ranking:");
  scores.forEach((s, i) => lines.push(`${i + 1}. P${s.id} — ${s.score}`));

  if (gameOverBody) gameOverBody.textContent = lines.join("\n");
  showOverlay(gameOverOverlay);
  gameOverShown = true;
}

/* ---------- Paint ---------- */

function paint() {
  if (scoreBox) scoreBox.textContent = scoreboardText();
  if (optionsBox) optionsBox.textContent = computeOptionsText();

  const locked = state.matchOver || state.roundOver || isAnyModalOpen();
  if (passBtn) passBtn.disabled = locked ? true : !canHumanPass();
  if (drawBtn) drawBtn.disabled = locked;

  if (boneyardLine) boneyardLine.textContent = `Boneyard: ${state.deck.length}`;

      render(state, {
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
    maxPip: 12
  });

  showGameOverIfNeeded();
  showRoundOverIfNeeded();
}

/* ---------- Auto-play watchdog ---------- */

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

/* ---------- Auto-play P0 (continuous, but respects one-move-per-turn unless extra plays are allowed) ---------- */

async function runAutoPlayP0IfNeeded() {
  if (!autoPlayP0) return;
  if (autoPlayRunning) return;
  if (state.matchOver || state.roundOver) return;
  if (isAnyModalOpen()) return;
  if (state.currentPlayer !== 0) return;

  autoPlayRunning = true;

  try {
    await sleep(60);

    const tryPlayOne = () => {
      const moves = engine.getLegalMoves(0);
      if (moves.length === 0) return false;

      const d = chooseMove(engine, 0, aiDifficulty);
      const pick = (d?.type === "PLAY")
        ? d
        : { type: "PLAY", tileId: moves[0].tileId, target: moves[0].target };

      // Detect satisfaction: pendingDouble -> null after play (and play was on that train)
      const hadPending = !!state.pendingDouble;

      state = engine.playTile(0, pick.tileId, pick.target);
      selectedTileId = null;
      paint();

      // If we had a pending double and now it's cleared, we satisfied it this turn.
      if (hadPending && !state.pendingDouble) {
        markSatisfiedThisTurn(0);
      }

      return true;
    };

    // If pending double, must resolve: play if possible, else draw, else pass
    if (state.pendingDouble) {
      const legal = engine.getLegalMoves(0);
      if (legal.length > 0) {
        tryPlayOne();
        // If still pending, stop; rules force resolution chain
        if (state.pendingDouble) return;
      } else if (state.deck.length > 0 && !state.turnHasDrawn) {
        state = engine.draw(0);
        paint();
        return;
      } else {
        state = engine.pass(0);
        resetSatisfiedFlagsForNewTurn(state.currentPlayer);
        paint();
        return;
      }
    }

    // Normal play:
    // - Play once if we haven't played
    // - If allowMultipleAfterSatisfy and we satisfied a double this turn, keep playing while legal
    if (!state.turnHasPlayed) {
      const played = tryPlayOne();
      if (!played) {
        // try draw then pass
        if (state.deck.length > 0 && !state.turnHasDrawn) {
          state = engine.draw(0);
          paint();
          return;
        }
        state = engine.pass(0);
        resetSatisfiedFlagsForNewTurn(state.currentPlayer);
        paint();
        return;
      }

      // If we played a double, pendingDouble is now set — stop and let loop pick it up next tick
      if (state.pendingDouble) return;
    }

    // If we can keep playing after satisfying, do it (until no moves or a new double is played)
    if (activeRules.allowMultipleAfterSatisfy && didSatisfyThisTurn(0) && !state.pendingDouble) {
      while (true) {
        const moved = tryPlayOne();
        if (!moved) break;
        if (state.pendingDouble) break; // new double -> must satisfy chain
      }
      // After we run out of optional plays, we STILL should advance the game
    }

    // Auto-P0 should always keep the game moving forward:
    // If it's still P0's turn and no pending double, pass.
    if (!state.matchOver && !state.roundOver && !isAnyModalOpen() && state.currentPlayer === 0 && !state.pendingDouble) {
      try {
        state = engine.pass(0);
        resetSatisfiedFlagsForNewTurn(state.currentPlayer);
        paint();
      } catch {
        // If engine refuses pass, just stop; next tick can handle it.
      }
    }
  } catch (err) {
    state.log.push(`AUTO P0 ERROR: ${err?.message || err}`);
    paint();
  } finally {
    autoPlayRunning = false;
    if (autoPlayP0 && !state.matchOver && !state.roundOver && !isAnyModalOpen()) {
      ensureAI();
    }
  }
}

/* ---------- AI (opponents) ---------- */

function ensureAI() {
  if (state.matchOver || state.roundOver) return;
  if (isAnyModalOpen()) return;

  if (state.currentPlayer === 0 && autoPlayP0) {
    runAutoPlayP0IfNeeded();
    return;
  }

  if (state.currentPlayer === 0) return;
  if (aiRunning) return;

  runAITurnsIfNeeded();
}

async function runAITurnsIfNeeded() {
  if (state.matchOver || state.roundOver) return;
  if (aiRunning) return;
  aiRunning = true;

  try {
    while (
      state.currentPlayer !== 0 &&
      !state.matchOver &&
      !state.roundOver &&
      !isAnyModalOpen()
    ) {
      const aiId = state.currentPlayer;
      await sleep(120);

      const tryPlayOneAI = async () => {
        const legal = engine.getLegalMoves(aiId);
        if (legal.length === 0) return false;

        const d = chooseMove(engine, aiId, aiDifficulty);
        const pick = (d?.type === "PLAY")
          ? d
          : { type: "PLAY", tileId: legal[0].tileId, target: legal[0].target };

        state = engine.playTile(aiId, pick.tileId, pick.target);
        paint();
        await sleep(90);
        return true;
      };

      try {
        // If there is a pending double, the only legal plays are on that train.
        if (state.pendingDouble) {
          const moved = await tryPlayOneAI();
          if (moved) {
            // If still pending, AI’s turn is basically over (must wait for next player if it can't chain).
            if (state.pendingDouble) continue;

            // Double was satisfied by that play. Optional extra plays (house rule).
            if (activeRules.allowMultipleAfterSatisfy && state.doubleSatisfiedThisTurn) {
              while (!state.pendingDouble) {
                const extra = await tryPlayOneAI();
                if (!extra) break;
              }
            }

            // End AI turn so game progresses
            if (!state.pendingDouble && state.currentPlayer === aiId && !state.roundOver && !state.matchOver) {
              state = engine.pass(aiId);
              paint();
            }
            continue;
          }

          // No playable tile for pending double → draw once if possible, else pass
          if (state.deck.length > 0 && !state.turnHasDrawn) {
            state = engine.draw(aiId);
            paint();
            continue;
          }

          state = engine.pass(aiId);
          paint();
          continue;
        }

        // Normal (no pending double)
        const moved = await tryPlayOneAI();
        if (moved) {
          // If a new double was played, stop here; pendingDouble will force next actions
          if (state.pendingDouble) continue;

          // If this turn satisfied a prior pending double and rule allows, chain plays
          if (activeRules.allowMultipleAfterSatisfy && state.doubleSatisfiedThisTurn) {
            while (!state.pendingDouble) {
              const extra = await tryPlayOneAI();
              if (!extra) break;
            }
          }

          // End AI turn
          if (!state.pendingDouble && state.currentPlayer === aiId && !state.roundOver && !state.matchOver) {
            state = engine.pass(aiId);
            paint();
          }
          continue;
        }

        // No play → draw once if possible, else pass
        if (state.deck.length > 0 && !state.turnHasDrawn) {
          state = engine.draw(aiId);
          paint();
          continue;
        }

        state = engine.pass(aiId);
        paint();

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
  aiDifficulty = aiDifficultySelect.value;
  state.log.push(`AI difficulty set to: ${aiDifficulty}`);
  paint();
});

autoPlayToggle?.addEventListener("change", () => {
  autoPlayP0 = !!autoPlayToggle.checked;
  state.log.push(`Auto-Play P0: ${autoPlayP0 ? "ON" : "OFF"}`);
  paint();

  if (autoPlayP0) startAutoPlayWatchdog();
  else stopAutoPlayWatchdog();

  ensureAI();
});

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

renderModeSelect?.addEventListener("change", () => {
  renderMode = renderModeSelect.value;
  localStorage.setItem("mt_renderMode", renderMode);
  state.log.push(`UI renderMode -> ${renderMode}`);
  paint();
});

// BEGIN: dominoSkin change sync (game <-> menu)
dominoSkinSelect?.addEventListener("change", () => {
  dominoSkin = dominoSkinSelect.value;

  // existing behavior
  localStorage.setItem("mt_dominoSkin", dominoSkin);

  // keep splash/menu aligned
  writeMenuSettings({ dominoPack: dominoSkin });

  state.log.push(`UI dominoSkin -> ${dominoSkin}`);
  paint();
});
// END: dominoSkin change sync (game <-> menu)

document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "t") {
    renderMode = (renderMode === "pretty") ? "text" : "pretty";
    state.log.push(`UI renderMode -> ${renderMode}`);
    paint();
  }
});


/* Hand select */
handArea.addEventListener("click", (e) => {
  const tileEl = e.target.closest(".tile");
  if (!tileEl) return;
  if (tileEl.disabled) return; // ✅ respects ui.js disabled tiles

  if (state.currentPlayer !== 0) return;
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;

  selectedTileId = tileEl.dataset.tileId;
  paint();
});


/* Place tile */
boardArea.addEventListener("click", (e) => {
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

    // If we just cleared a pending double, mark satisfied-this-turn
    if (hadPending && !state.pendingDouble) {
      markSatisfiedThisTurn(0);
    }

    paint();

    // Auto-pass after play:
    // - Only if autoPassAfterPlay is ON
    // - Never if a double is still pending
    // - Never during the "extra plays allowed" window after satisfying a double
    const allowExtraWindow =
      activeRules.allowMultipleAfterSatisfy && didSatisfyThisTurn(0) && !state.pendingDouble;

    const shouldAutoPass =
      !!activeRules.autoPassAfterPlay &&
      !state.pendingDouble &&
      !state.roundOver &&
      !state.matchOver &&
      !allowExtraWindow;

    if (shouldAutoPass) {
      state = engine.pass(0);
      resetSatisfiedFlagsForNewTurn(state.currentPlayer);
      paint();
    }
  } catch (err) {
    alert(err.message);
  } finally {
    ensureAI();
  }
});

/* Draw */
drawBtn.addEventListener("click", () => {
  if (state.currentPlayer !== 0) return;
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;

  try {
    state = engine.draw(0);
    paint();
  } catch (err) {
    alert(err.message);
  } finally {
    ensureAI();
  }
});

/* Pass */
passBtn.addEventListener("click", () => {
  if (!canHumanPass()) return;
  if (state.matchOver || state.roundOver || isAnyModalOpen()) return;

  try {
    state = engine.pass(0);
    resetSatisfiedFlagsForNewTurn(state.currentPlayer);
    paint();
  } catch (err) {
    alert(err.message);
  } finally {
    ensureAI();
  }
});

/* New match */
newGameBtn.addEventListener("click", () => {
  engine = new GameEngine({ maxPip: 12, playerCount: 4, handSize: 15, rules: activeRules });
  state = engine.newGame();
  debugSnapshot("NEW GAME - after newGame");
  selectedTileId = null;
  gameOverShown = false;
  resetSatisfiedFlagsForNewTurn(state.currentPlayer);
  paint();
  debugSnapshot("NEW GAME - after paint");

  // Let UI paint before AI potentially plays
  setTimeout(() => {
    ensureAI();
    debugSnapshot("NEW GAME - after ensureAI");
  }, 0);

});

/* Round modal next */
roundNextBtn?.addEventListener("click", () => {
  advanceRound();
});

/* Game over modal */
gameOverNewGameBtn?.addEventListener("click", () => {
  stopRoundCountdown();
  hideOverlay(roundOverOverlay);
  hideOverlay(gameOverOverlay);
  gameOverShown = false;

  state = engine.newGame();
  debugSnapshot("GAME OVER -> NEW GAME - after newGame");
  selectedTileId = null;
  resetSatisfiedFlagsForNewTurn(state.currentPlayer);
  paint();
  debugSnapshot("GAME OVER -> NEW GAME - after paint");

  if (autoPlayP0) startAutoPlayWatchdog();
  setTimeout(() => {
    ensureAI();
    debugSnapshot("GAME OVER -> NEW GAME - after ensureAI");
  }, 0);
});

gameOverCloseBtn?.addEventListener("click", () => {
  hideOverlay(gameOverOverlay);
});

/* ---------- Start ---------- */
resetSatisfiedFlagsForNewTurn(state.currentPlayer);
debugSnapshot("INITIAL LOAD - after initial newGame");
paint();
if (autoPlayP0) startAutoPlayWatchdog();
setTimeout(() => {
  ensureAI();
  debugSnapshot("INITIAL LOAD - after ensureAI");
}, 0);

// END: js/main.js
