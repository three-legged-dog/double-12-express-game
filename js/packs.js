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

function isAbsLikeUrl(s){
  if (!s) return false;
  const str = String(s);
  return (
    str.startsWith("/") ||
    str.startsWith("data:") ||
    str.startsWith("blob:") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(str)
  );
}

function basePathForPack(pack){
  const tag = (pack?.packId || DEFAULT_PACK.packId || "DEFAULT").toLowerCase();
  return pack?.__basePath || `/packs/${tag}/`;
}

function resolveWithBase(basePath, rel){
  if (!rel) return null;
  const s = String(rel);
  if (isAbsLikeUrl(s)) return s;
  return basePath + s.replace(/^\/+/, "");
}

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

  // Convenience: UI renderer can call pack.getTileUrl(lo, hi)
  // and it will respect dominoSet.tilePathPattern.
  try {
    pack.getTileUrl = (a, b) => tileUrl(pack, a, b);
  } catch {}

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
  const basePath = basePathForPack(activePack);

  // If someone supplies an absolute pattern, honor it.
  if (isAbsLikeUrl(pattern)) return pattern;

  return basePath +
    String(pattern)
      .replace("{AA}", AA)
      .replace("{BB}", BB)
      .replace("{PACK}", packTag)
      .replace(/^\/+/, "");
}

export function soundUrl(activePack, key) {
  const activeRel = activePack?.sounds?.[key];
  if (activeRel) {
    return resolveWithBase(basePathForPack(activePack), activeRel);
  }

  const defRel = DEFAULT_PACK?.sounds?.[key];
  if (defRel) {
    return resolveWithBase(basePathForPack(DEFAULT_PACK), defRel);
  }

  return null;
}

// END: Pack URL base + resolvers


export function applyPackUI(activePack){
  // =========================
  // BEGIN: Apply Pack UI (vars + background + optional CSS)
  // =========================

  // 1) CSS vars (clear old pack vars so they don't "stick")
  const root = document.documentElement;
  const vars = activePack?.ui?.cssVars || {};

  const lastRaw = root.dataset.packCssVars || "";
  const lastKeys = lastRaw ? lastRaw.split(",").filter(Boolean) : [];

  for (const k of lastKeys){
    if (!(k in vars)){
      try { root.style.removeProperty(k); } catch {}
    }
  }

  const newKeys = Object.keys(vars);
  root.dataset.packCssVars = newKeys.join(",");

  for (const [k,v] of Object.entries(vars)){
    try { root.style.setProperty(k, String(v)); } catch {}
  }

  // 2) Board background (prefer pack; else default; else let CSS handle)
  const board = document.getElementById("boardArea");
  const packBg = activePack?.ui?.boardBackground;
  const defBg = DEFAULT_PACK?.ui?.boardBackground;

  const bgRel = (packBg && String(packBg).trim()) ? packBg : ((defBg && String(defBg).trim()) ? defBg : null);
  const bgBase = (packBg && String(packBg).trim()) ? basePathForPack(activePack) : basePathForPack(DEFAULT_PACK);
  const bgUrl = bgRel ? resolveWithBase(bgBase, bgRel) : null;

  if (board){
    if (bgUrl){
      board.style.backgroundImage = `url("${bgUrl}")`;
      board.style.backgroundSize = "cover";
      board.style.backgroundPosition = "center";
    } else {
      board.style.backgroundImage = "";
    }
  }

  // 3) Theme CSS injection (one link, replaced per pack; falls back to default if set)
  const id = "packThemeCss";
  const existing = document.getElementById(id);

  const packCss = activePack?.ui?.themeCss;
  const defCss = DEFAULT_PACK?.ui?.themeCss;

  const cssRel = (packCss && String(packCss).trim()) ? packCss : ((defCss && String(defCss).trim()) ? defCss : null);
  const cssBase = (packCss && String(packCss).trim()) ? basePathForPack(activePack) : basePathForPack(DEFAULT_PACK);
  const cssUrl = cssRel ? resolveWithBase(cssBase, cssRel) : null;

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

  // =========================
  // END: Apply Pack UI
  // =========================
}

// END: js/packs.js
