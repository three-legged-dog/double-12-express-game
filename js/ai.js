/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/ai.js
import { GameEngine } from "./engine.js";

/**
 * Choose a move for the given player.
 *
 * Contract:
 * - Returns either { type: "PLAY", tileId, target } OR { type: "DRAW" }.
 * - If DRAW fails (boneyard empty), caller may fall back to PASS.
 *
 * The AI intentionally does NOT touch DOM and does NOT inspect rendering state.
 */
export function chooseMove(engine, playerId, difficulty = "normal") {
  const diff = String(difficulty || "normal").toLowerCase();
  const moves = engine.getLegalMoves(playerId);

  // No playable move from hand
  if (moves.length === 0) return { type: "DRAW" };

  // EASY: random legal PLAY (no strategy)
  if (diff === "easy") {
    const pick = moves[Math.floor(Math.random() * moves.length)];
    return { type: "PLAY", tileId: pick.tileId, target: pick.target };
  }

  // Helper: classify target
  const classifyTarget = (m) => {
    const isOwn = (m.target.kind === "PLAYER" && m.target.ownerId === playerId);
    const isMex = (m.target.kind === "MEX");
    const isOther = (!isOwn && !isMex);
    return { isOwn, isMex, isOther };
  };

  // EXPERT: best-available move using the deeper ranking below,
  // with an extra preference for aggressive pressure and keeping control.
  if (diff === "expert") {
    const scored = moves.map((m) => {
      const { isOwn, isMex, isOther } = classifyTarget(m);
      let s = 0;

      // Expert prioritizes pressuring others, then Mexican, then own.
      if (isOther) s += 1200;
      else if (isMex) s += 850;
      else if (isOwn) s += 700;

      // Prefer higher pip dumping.
      s += (m.tile.a + m.tile.b) * 10;

      // Strong preference for doubles when strategically legal.
      if (m.tile.a === m.tile.b) s += 220;

      // Slight preference for branching pressure on others.
      if (isOther && m.tile.a !== m.tile.b) s += 90;

      return { m, s };
    });

    scored.sort((a, b) => b.s - a.s);
    return { type: "PLAY", tileId: scored[0].m.tileId, target: scored[0].m.target };
  }

  // CHAOS: prefers doubles + messing with other trains, with a little randomness
  if (diff === "chaos") {
    const scored = moves.map((m) => {
      const { isOwn, isMex, isOther } = classifyTarget(m);
      let s = 0;

      // chaos likes other trains
      if (isOther) s += 900;
      else if (isMex) s += 500;
      else s += 200;

      // chaos LOVES doubles
      if (m.tile.a === m.tile.b) s += 600;

      // prefer higher pips to dump points
      s += (m.tile.a + m.tile.b) * 2;

      // sprinkle randomness ONCE (never inside sort comparator)
      s += Math.floor(Math.random() * 50);

      return { m, s };
    });

    scored.sort((a, b) => b.s - a.s);
    return { type: "PLAY", tileId: scored[0].m.tileId, target: scored[0].m.target };
  }

  // NORMAL / HARD: heuristic scoring (hard is more aggressive + values pip-dumping more)
  const scored = moves.map((m) => {
    const { isOwn, isMex, isOther } = classifyTarget(m);
    let score = 0;

    // Base priority
    if (isOwn) score += (diff === "hard" ? 700 : 1000);
    else if (isMex) score += 650;
    else score += (diff === "hard" ? 900 : 250); // hard plays others more aggressively

    // Prefer dumping high pip values
    score += (m.tile.a + m.tile.b) * (diff === "hard" ? 8 : 4);

    // Doubles: normal slightly avoids, hard uses strategically
    if (m.tile.a === m.tile.b) score += (diff === "hard" ? 120 : -20);

    // hard: if playing on others, extra pressure
    if (diff === "hard" && isOther) score += 250;

    return { m, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return { type: "PLAY", tileId: scored[0].m.tileId, target: scored[0].m.target };
}

/**
 * Optional helper for future tuning / debug UI.
 * Returns a ranked list of legal moves with scores for the chosen difficulty.
 */
export function rankMoves(engine, playerId, difficulty = "normal") {
  const diff = String(difficulty || "normal").toLowerCase();
  const moves = engine.getLegalMoves(playerId);

  const classifyTarget = (m) => {
    const isOwn = (m.target.kind === "PLAYER" && m.target.ownerId === playerId);
    const isMex = (m.target.kind === "MEX");
    const isOther = (!isOwn && !isMex);
    return { isOwn, isMex, isOther };
  };

  const ranked = moves.map((m) => {
    const { isOwn, isMex, isOther } = classifyTarget(m);
    let score = 0;
    let reason = [];

    if (diff === "expert") {
      if (isOther) { score += 1200; reason.push("pressure other train"); }
      else if (isMex) { score += 850; reason.push("mexican train"); }
      else if (isOwn) { score += 700; reason.push("own train"); }

      const dump = (m.tile.a + m.tile.b) * 10;
      score += dump; reason.push(`dump ${dump}`);

      if (m.tile.a === m.tile.b) { score += 220; reason.push("double bonus"); }
      if (isOther && m.tile.a !== m.tile.b) { score += 90; reason.push("pressure branch"); }
    } else if (diff === "chaos") {
      if (isOther) { score += 900; reason.push("chaos other"); }
      else if (isMex) { score += 500; reason.push("chaos mex"); }
      else { score += 200; reason.push("chaos own"); }

      if (m.tile.a === m.tile.b) { score += 600; reason.push("double chaos"); }
      const dump = (m.tile.a + m.tile.b) * 2;
      score += dump; reason.push(`dump ${dump}`);
    } else {
      if (isOwn) { score += (diff === "hard" ? 700 : 1000); reason.push("own train"); }
      else if (isMex) { score += 650; reason.push("mexican train"); }
      else { score += (diff === "hard" ? 900 : 250); reason.push("other train"); }

      const dump = (m.tile.a + m.tile.b) * (diff === "hard" ? 8 : 4);
      score += dump; reason.push(`dump ${dump}`);

      if (m.tile.a === m.tile.b) {
        const dbl = (diff === "hard" ? 120 : -20);
        score += dbl;
        reason.push(dbl >= 0 ? "double bonus" : "double caution");
      }

      if (diff === "hard" && isOther) {
        score += 250;
        reason.push("hard pressure");
      }
    }

    return {
      tileId: m.tileId,
      tile: m.tile,
      target: m.target,
      score,
      reason: reason.join(", ")
    };
  });

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
// END: js/ai.js
