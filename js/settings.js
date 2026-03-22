/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// js/settings.js
// Persistent settings for menu + game screen.

export const SETTINGS_KEY = "double12express.settings.v1";

export const DEFAULT_SETTINGS = {
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

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_SETTINGS, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(next) {
  const safe = { ...DEFAULT_SETTINGS, ...(next || {}) };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(safe));
  } catch {}
  return safe;
}

export function deepEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

// Maps legacy / user-facing values to real pack folders.
export function sanitizeSkin(skin) {
  const raw = String(skin || "classic").trim().toLowerCase();
  if (raw === "default") return "classic";
  return raw;
}
