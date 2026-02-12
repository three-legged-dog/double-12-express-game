/*!
 * Double 12 Express - High Scores
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/highscores.js

export const HIGH_SCORES_KEY = "double12express.highscores.v1";
export const HIGH_SCORES_MAX = 50;

export function loadHighScores() {
  try {
    const raw = localStorage.getItem(HIGH_SCORES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveHighScores(scores) {
  try {
    localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(scores));
  } catch {
    // ignore
  }
}

export function clearHighScores() {
  try {
    localStorage.removeItem(HIGH_SCORES_KEY);
  } catch {
    // ignore
  }
}

function normalizeScoreEntry(e) {
  const ts = e?.ts ? String(e.ts) : new Date().toISOString();
  const playerName = String(e?.playerName ?? "Player");
  const playerScore = Number(e?.playerScore ?? 999999);
  const placement = Number(e?.placement ?? 99);

  return {
    ts,
    playerName,
    playerScore,
    placement,
    playerCount: Number(e?.playerCount ?? 4),
    roundsTotal: Number(e?.roundsTotal ?? 13),
    aiDifficulty: String(e?.aiDifficulty ?? "normal"),
    ruleset: String(e?.ruleset ?? "standard"),
    dominoPack: String(e?.dominoPack ?? "default"),
    winnerName: String(e?.winnerName ?? ""),
    winnerScore: Number(e?.winnerScore ?? 0),
  };
}

export function addHighScore(entry) {
  const scores = loadHighScores();
  scores.push(normalizeScoreEntry(entry));

  // Sort: best (lowest score), then best placement, then newest first
  scores.sort((a, b) => {
    if (a.playerScore !== b.playerScore) return a.playerScore - b.playerScore;
    if (a.placement !== b.placement) return a.placement - b.placement;
    return String(b.ts).localeCompare(String(a.ts));
  });

  const trimmed = scores.slice(0, HIGH_SCORES_MAX);
  saveHighScores(trimmed);
  return trimmed;
}

// END: js/highscores.js
