/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/packs.js

export const DEFAULT_PACK = {
  packId: "DEFAULT",
  name: "Classic",
  version: "1.0.0",

  dominoSet: {
    maxPip: 12,
    // {PACK} lets the game inject packId automatically
    tilePathPattern: "tiles/D12_{AA}_{BB}_{PACK}.svg",
    canonicalOrder: "minmax",
    fileExt: "svg",
    hasSpriteSheet: false,
    spriteSheetPath: null
  },

  ui: {
    themeCss: null,
    boardBackground: null,
    cssVars: {}
  },

  sounds: {
    click: "sounds/default/click.mp3",
    draw: "sounds/default/draw.mp3",
    place: "sounds/default/place.mp3",
    roundWin: "sounds/default/round_win.mp3",
    roundLose: "sounds/default/round_lose.mp3"
  },

  meta: {
    author: "Three Legged Dog & Co",
    created: null
  }
};

function deepClone(obj){
  if (typeof structuredClone === "function") return structuredClone(obj);
  // Manifests are JSON-safe, so this is fine as fallback
  return JSON.parse(JSON.stringify(obj));
}

export function mergeDefaults(defaults, override){
  if (!override) return deepClone(defaults);

  const out = deepClone(defaults);

  for (const key in override){
    const val = override[key];
    if (val && typeof val === "object" && !Array.isArray(val)){
      out[key] = mergeDefaults(defaults[key] || {}, val);
    } else if (val !== undefined){
      out[key] = val;
    }
  }
  return out;
}

export function canonicalPair(a, b){
  return { aa: Math.min(a,b), bb: Math.max(a,b) };
}


// BEGIN: Pack URL base + resolvers

export async function loadPack(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Pack manifest fetch failed: ${url} (${res.status})`);
  }

  const loaded = await res.json();

  // Merge onto defaults (missing fields -> default)
  const pack = mergeDefaults(DEFAULT_PACK, loaded);

  // Normalize packId
  pack.packId = String(pack.packId || "DEFAULT").toUpperCase();

  // Base path = folder containing manifest.json (e.g. /packs/default/)
  const u = new URL(url, window.location.href);
  pack.__basePath = u.pathname.replace(/[^/]*$/, "");

  return pack;
}

export function tileUrl(activePack, a, b) {
  const aa = Math.min(a, b);
  const bb = Math.max(a, b);
  const AA = String(aa).padStart(2, "0");
  const BB = String(bb).padStart(2, "0");

  const pattern =
    activePack?.dominoSet?.tilePathPattern ||
    "tiles/D12_{AA}_{BB}_{PACK}.svg";

  const packTag = activePack?.packId || "DEFAULT";
  const basePath =
    activePack?.__basePath ||
    `/packs/${packTag.toLowerCase()}/`;

  return basePath +
    pattern
      .replace("{AA}", AA)
      .replace("{BB}", BB)
      .replace("{PACK}", packTag)
      .replace(/^\/+/, "");
}

export function soundUrl(activePack, key) {
  const rel =
    activePack?.sounds?.[key] ||
    DEFAULT_PACK?.sounds?.[key];

  if (!rel) return null;

  const packTag = activePack?.packId || "DEFAULT";
  const basePath =
    activePack?.__basePath ||
    `/packs/${packTag.toLowerCase()}/`;

  return basePath + String(rel).replace(/^\/+/, "");
}

// END: Pack URL base + resolvers


export function applyPackUI(activePack){
  // CSS vars
  const vars = activePack?.ui?.cssVars || {};
  for (const [k,v] of Object.entries(vars)){
    try { document.documentElement.style.setProperty(k, String(v)); } catch {}
  }

  // Board background
  const board = document.getElementById("boardArea");
  const bg = activePack?.ui?.boardBackground;
  if (board){
    if (bg){
      board.style.backgroundImage = `url("${bg}")`;
      board.style.backgroundSize = "cover";
      board.style.backgroundPosition = "center";
    } else {
      // default: let existing CSS win
      board.style.backgroundImage = "";
    }
  }

  // Theme CSS injection (one link, replaced per pack)
  const id = "packThemeCss";
  const existing = document.getElementById(id);

  const cssUrl = activePack?.ui?.themeCss;
  if (!cssUrl){
    existing?.remove();
    return;
  }

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = cssUrl;

  if (existing) existing.replaceWith(link);
  else document.head.appendChild(link);
}

// END: js/packs.js
