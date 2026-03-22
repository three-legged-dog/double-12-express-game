/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// js/highscores.js
// Lightweight, storage-based high score board for Double 12 Express.

export const HIGH_SCORES_KEY = "double12express.highscores.v1";
const HIGH_SCORES_LIMIT = 20;

export function loadHighScores() {
  try {
    const raw = localStorage.getItem(HIGH_SCORES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHighScores(list) {
  try {
    const safe = Array.isArray(list) ? list : [];
    localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(safe.slice(0, HIGH_SCORES_LIMIT)));
  } catch {}
}

export function clearHighScores() {
  try {
    localStorage.removeItem(HIGH_SCORES_KEY);
  } catch {}
}

export function addHighScore(entry) {
  const current = loadHighScores();

  const safeEntry = {
    name: String(entry?.name || "Player").trim() || "Player",
    score: Number(entry?.score || 0),
    rounds: Number(entry?.rounds || 0),
    difficulty: String(entry?.difficulty || "normal"),
    date: entry?.date || new Date().toISOString(),
  };

  current.push(safeEntry);

  current.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score; // lower is better
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const trimmed = current.slice(0, HIGH_SCORES_LIMIT);
  saveHighScores(trimmed);
  return trimmed;
}
