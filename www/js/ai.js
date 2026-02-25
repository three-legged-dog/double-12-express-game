/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company 
 * All rights reserved.
 */

// js/ai.js

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
