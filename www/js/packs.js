/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// BEGIN: js/pack.js

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

// =========================
// BEGIN: Board background resolver (auto jpg/png + cache)
// =========================
const __boardBgCache = new Map();

async function __urlExists(url){
  if (!url) return false;
  const u = String(url);
  // Blob/Data URLs are already materialized (OPFS installs) — treat as existing.
  if (u.startsWith("blob:") || u.startsWith("data:")) return true;
  try{
    // Try HEAD first (fast). If server blocks it, fall back.
    const r = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (r.ok) return true;

    // Some static hosts disallow HEAD (405) or restrict it (403)
    if (r.status === 405 || r.status === 403){
      const r2 = await fetch(url, {
        method: "GET",
        headers: { "Range": "bytes=0-0" },
        cache: "no-store"
      });
      return r2.ok;
    }
    return false;
  } catch {
    try{
      const r2 = await fetch(url, {
        method: "GET",
        headers: { "Range": "bytes=0-0" },
        cache: "no-store"
      });
      return r2.ok;
    } catch {
      return false;
    }
  }
}

function __bgCandidates(rel){
  const s = rel ? String(rel).trim() : "";

  // If pack doesn't specify a background, don't probe defaults.
  // (Probing non-existent defaults causes noisy 404s in console.)
  if (!s) return [];

  // If manifest already resolved to an absolute-like URL (blob/data/http/https),
  // use it as-is (do NOT append .jpg/.png — blob URLs have no extensions).
  if (isAbsLikeUrl(s)) return [s];

  // If manifest provides a filename with extension, use it as-is.
  const hasExt = /\/?[^/]+\.[a-z0-9]+$/i.test(s);
  if (hasExt) return [s];

  // Extensionless -> try both
  return [`${s}.jpg`, `${s}.png`];
}
// =========================
// END: Board background resolver (auto jpg/png + cache)
// =========================

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

  // 2) Board background (auto-detect jpg/png; pack first, then default)
  const board = document.getElementById("boardArea");
  if (board){
    const packBase = basePathForPack(activePack);
    const defBase  = basePathForPack(DEFAULT_PACK);

    const packRel = activePack?.ui?.boardBackground;     // can be "background" OR "background.jpg" etc
    const defRel  = DEFAULT_PACK?.ui?.boardBackground;

    const packUrls = __bgCandidates(packRel)
      .map((rel)=> resolveWithBase(packBase, rel))
      .filter(Boolean);

    const defUrls = __bgCandidates(defRel)
      .map((rel)=> resolveWithBase(defBase, rel))
      .filter(Boolean);

    // Cache key ensures we don't re-probe repeatedly
    const cacheKey =
      `${packBase}|${String(packRel||"")}|${defBase}|${String(defRel||"")}`;

    // Token prevents race conditions if user switches packs fast
    const token = `${(activePack?.packId || "DEFAULT")}:${Date.now()}`;
    board.dataset.bgToken = token;

    const applyBg = (url)=>{
      if (board.dataset.bgToken !== token) return;
      if (url){
        board.style.backgroundImage = `url("${url}")`;
        board.style.backgroundSize = "cover";
        board.style.backgroundPosition = "center";
        board.style.backgroundRepeat = "no-repeat";
      } else {
        board.style.backgroundImage = "";
      }
    };

    // Use cached resolved url if we already found it (or cached null)
    if (__boardBgCache.has(cacheKey)){
      applyBg(__boardBgCache.get(cacheKey));
    } else {
      // Clear immediately so we don't show the previous pack's board
      applyBg(null);

      (async ()=>{
        for (const url of [...packUrls, ...defUrls]){
          if (await __urlExists(url)){
            __boardBgCache.set(cacheKey, url);
            applyBg(url);
            return;
          }
        }
        __boardBgCache.set(cacheKey, null);
        applyBg(null);
      })();
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
