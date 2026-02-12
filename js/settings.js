/*!
 * Double 12 Express - Shared Settings
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/settings.js

export const SETTINGS_KEY = "double12express.settings.v1";

export const DEFAULT_SETTINGS = {
  playerName: "Player",
  aiDifficulty: "normal",
  autoPlay: false,
  showLog: true,
  ruleset: "standard",
  dominoPack: "default"
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_SETTINGS), ...parsed };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function deepEqual(a, b) {
  // Good enough for our settings object (simple JSON)
  return JSON.stringify(a) === JSON.stringify(b);
}

export function sanitizeSkin(skin) {
  const s = String(skin || "").trim();
  if (!s) return "default";
  if (s.toLowerCase() === "default") return "default";
  return s;
}

// END: js/settings.js
