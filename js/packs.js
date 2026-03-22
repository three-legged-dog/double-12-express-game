/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// js/packs.js

export const DEFAULT_PACK = {
  meta: {
    name: "Classic",
    version: "1.0.0",
    author: "Three Legged Dog and Company",
    description: "Built-in classic theme",
    tag: "default",
  },
  assets: {
    dominoSvgDir: "",
    backgroundImage: "",
    icon: "",
    thumb: "",
  },
  audio: {
    menuMusic: [],
    sfx: {},
  },
  ui: {
    cssVars: {},
  },
  rules: {},
};

export function mergeDefaults(pack = {}) {
  return {
    meta: { ...DEFAULT_PACK.meta, ...(pack.meta || {}) },
    assets: { ...DEFAULT_PACK.assets, ...(pack.assets || {}) },
    audio: {
      menuMusic: Array.isArray(pack?.audio?.menuMusic) ? pack.audio.menuMusic.slice() : [],
      sfx: { ...(pack?.audio?.sfx || {}) },
    },
    ui: { cssVars: { ...(pack?.ui?.cssVars || {}) } },
    rules: { ...(pack?.rules || {}) },
    __basePath: pack?.__basePath || "",
  };
}

function dirname(url) {
  return url.replace(/[^/]*$/, "");
}

function absolutize(base, rel) {
  if (!rel) return "";
  try {
    return new URL(rel, base).toString();
  } catch {
    return rel;
  }
}

export async function loadPack(manifestUrl) {
  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Pack manifest not found: ${manifestUrl}`);

  const json = await res.json();
  const merged = mergeDefaults(json);
  const base = dirname(manifestUrl);
  merged.__basePath = base;

  // Normalize commonly-used asset URLs to absolute
  if (merged.assets.dominoSvgDir) {
    merged.assets.dominoSvgDir = absolutize(base, merged.assets.dominoSvgDir);
  }
  if (merged.assets.backgroundImage) {
    merged.assets.backgroundImage = absolutize(base, merged.assets.backgroundImage);
  }
  if (merged.assets.icon) {
    merged.assets.icon = absolutize(base, merged.assets.icon);
  }
  if (merged.assets.thumb) {
    merged.assets.thumb = absolutize(base, merged.assets.thumb);
  }

  if (Array.isArray(merged.audio.menuMusic)) {
    merged.audio.menuMusic = merged.audio.menuMusic.map((u) => absolutize(base, u));
  }
  if (merged.audio.sfx && typeof merged.audio.sfx === "object") {
    for (const [k, v] of Object.entries(merged.audio.sfx)) {
      merged.audio.sfx[k] = absolutize(base, v);
    }
  }

  return merged;
}

export function applyPackUI(pack = DEFAULT_PACK) {
  const vars = pack?.ui?.cssVars || {};
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    if (value == null || value === "") continue;
    root.style.setProperty(key, String(value));
  }

  // Optional background image override for game screen
  if (pack?.assets?.backgroundImage) {
    root.style.setProperty("--pack-background-image", `url('${pack.assets.backgroundImage}')`);
    document.body.classList.add("pack-has-background");
  } else {
    root.style.removeProperty("--pack-background-image");
    document.body.classList.remove("pack-has-background");
  }
}

export function resolvePackBase(tag, pack) {
  return pack?.__basePath || `/packs/${tag}/`;
}
