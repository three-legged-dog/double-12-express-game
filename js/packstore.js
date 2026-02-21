/*!
 * Double 12 Express - PackStore (in-app pack installs)
 *
 * Strategy (browser-friendly, no ZIP required):
 * - User selects an UNZIPPED pack folder via showDirectoryPicker().
 * - We copy it into OPFS (Origin Private File System): /packs/<packKey>/...
 * - We read manifest.json (or pack.json fallback) from OPFS.
 * - We materialize Blob URLs for UI assets + sounds, and pre-cache all tile SVG URLs
 *   so ui.js can keep using a synchronous pack.getTileUrl().
 */

// BEGIN: js/packstore.js

import { DEFAULT_PACK, mergeDefaults } from "./packs.js";

const OPFS_PACKS_DIR = "packs";

/** @type {Map<string, {key:string, packId:string, name:string, version:string, source:'opfs'}>} */
let _index = new Map();

/** Cache blob URLs per pack file (key:path -> blobUrl) */
const _blobUrlCache = new Map();

function _normKey(s){
  return String(s || "").trim().toLowerCase();
}

function _isSupported(){
  return !!(navigator.storage?.getDirectory && window.showDirectoryPicker);
}

async function _getOpfsRoot(){
  if (!navigator.storage?.getDirectory) {
    throw new Error("PackStore: OPFS not supported in this browser.");
  }
  return await navigator.storage.getDirectory();
}

async function _getOpfsPacksDir({ create = true } = {}){
  const root = await _getOpfsRoot();
  try{
    return await root.getDirectoryHandle(OPFS_PACKS_DIR, { create });
  }catch(err){
    if (!create) return null;
    throw err;
  }
}

async function _getDirHandleByPath(baseDir, relPath, { create = false } = {}){
  const parts = String(relPath || "").split("/").filter(Boolean);
  let dir = baseDir;
  for (const p of parts){
    dir = await dir.getDirectoryHandle(p, { create });
  }
  return dir;
}

async function _getFileHandleByPath(baseDir, relFilePath){
  const parts = String(relFilePath || "").split("/").filter(Boolean);
  if (!parts.length) throw new Error("PackStore: invalid file path");
  const fileName = parts.pop();
  const dir = parts.length ? await _getDirHandleByPath(baseDir, parts.join("/"), { create: false }) : baseDir;
  return await dir.getFileHandle(fileName, { create: false });
}

async function _readTextFromDir(dir, filename){
  const fh = await dir.getFileHandle(filename, { create: false });
  const f = await fh.getFile();
  return await f.text();
}

async function _readJsonFromDir(dir, filename){
  const txt = await _readTextFromDir(dir, filename);
  try{ return JSON.parse(txt); }
  catch{ throw new Error(`PackStore: ${filename} is not valid JSON.`); }
}

async function _tryReadManifest(dir){
  try{ return await _readJsonFromDir(dir, "manifest.json"); }catch{}
  try{ return await _readJsonFromDir(dir, "pack.json"); }catch{}
  return null;
}

function _validatePackId(packId){
  const id = String(packId || "").toUpperCase().trim();
  if (!id) throw new Error("PackStore: manifest missing packId.");
  if (!/^[A-Z0-9_]+$/.test(id)){
    throw new Error("PackStore: packId must match ^[A-Z0-9_]+$ (uppercase letters, numbers, underscores)." );
  }
  return id;
}

function _candidatesForBackground(rel){
  const s = rel ? String(rel).trim() : "";
  const hasExt = s && /\.[a-z0-9]+$/i.test(s);
  if (s){
    if (hasExt) return [s];
    return [`${s}.jpg`, `${s}.png`];
  }
  return [
    "background.jpg",
    "background.png",
    "board/background.jpg",
    "board/background.png",
  ];
}

function _isAbsLikeUrl(s){
  if (!s) return false;
  const str = String(s);
  return (
    str.startsWith("/") ||
    str.startsWith("data:") ||
    str.startsWith("blob:") ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(str)
  );
}

function _cacheKey(key, relPath){
  return `${key}::${String(relPath || "")}`;
}

async function _getBlobUrlForFile(packKey, relPath){
  if (!relPath) return null;
  if (_isAbsLikeUrl(relPath)) return String(relPath);

  const key = _normKey(packKey);
  const rel = String(relPath).replace(/^\/+/, "");
  const ck = _cacheKey(key, rel);
  if (_blobUrlCache.has(ck)) return _blobUrlCache.get(ck);

  const packsDir = await _getOpfsPacksDir({ create: false });
  if (!packsDir) return null;

  let packDir;
  try{ packDir = await packsDir.getDirectoryHandle(key, { create: false }); }
  catch{ return null; }

  try{
    const fh = await _getFileHandleByPath(packDir, rel);
    const f = await fh.getFile();
    const url = URL.createObjectURL(f);
    _blobUrlCache.set(ck, url);
    return url;
  }catch{
    _blobUrlCache.set(ck, null);
    return null;
  }
}

function _revokeCachedUrlsForPack(packKey){
  const key = _normKey(packKey);
  for (const [k, v] of _blobUrlCache.entries()){
    if (!k.startsWith(`${key}::`)) continue;
    if (typeof v === "string" && v.startsWith("blob:")){
      try{ URL.revokeObjectURL(v); }catch{}
    }
    _blobUrlCache.delete(k);
  }
}

async function _scanIndex(){
  _index = new Map();

  const packsDir = await _getOpfsPacksDir({ create: false });
  if (!packsDir) return _index;

  for await (const [name, handle] of packsDir.entries()){
    if (handle.kind !== "directory") continue;

    try{
      const manifest = await _tryReadManifest(handle);
      if (!manifest) continue;

      const packId = _validatePackId(manifest.packId);
      const key = _normKey(packId);

      // Ignore folders that don't match the packId (keeps things sane)
      if (_normKey(name) !== key) {
        // Still allow it if you want, but it's safer to keep 1:1
        continue;
      }

      _index.set(key, {
        key,
        packId,
        name: String(manifest.name || packId),
        version: String(manifest.version || "1.0.0"),
        source: "opfs",
      });
    }catch{
      // bad manifest; ignore
      continue;
    }
  }

  return _index;
}

async function _copyFile(srcFileHandle, destDirHandle, fileName){
  const file = await srcFileHandle.getFile();
  const destFileHandle = await destDirHandle.getFileHandle(fileName, { create: true });
  const writable = await destFileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

async function _copyDirRecursive(srcDirHandle, destDirHandle){
  for await (const [name, handle] of srcDirHandle.entries()){
    if (!name || name === ".DS_Store" || name === "Thumbs.db") continue;

    if (handle.kind === "file"){
      await _copyFile(handle, destDirHandle, name);
    }else if (handle.kind === "directory"){
      // Skip obviously irrelevant dirs
      const n = String(name).toLowerCase();
      if (n === "node_modules" || n === ".git") continue;

      const childDest = await destDirHandle.getDirectoryHandle(name, { create: true });
      await _copyDirRecursive(handle, childDest);
    }
  }
}

async function _pickPackRootFolder(){
  const dir = await window.showDirectoryPicker({ mode: "read" });

  // Preferred: user picked the pack root directly
  try{
    const m = await _tryReadManifest(dir);
    if (m) return dir;
  }catch{}

  // Convenience: if they picked a parent folder containing a single pack folder
  const childDirs = [];
  for await (const [name, handle] of dir.entries()){
    if (handle.kind === "directory") childDirs.push(handle);
  }
  if (childDirs.length === 1){
    try{
      const m2 = await _tryReadManifest(childDirs[0]);
      if (m2) return childDirs[0];
    }catch{}
  }

  throw new Error("PackStore: couldn't find manifest.json in that folder. Pick the pack folder that contains manifest.json.");
}

async function _materializeInstalledPack(packKey){
  const key = _normKey(packKey);
  const packsDir = await _getOpfsPacksDir({ create: false });
  if (!packsDir) throw new Error("PackStore: no installed packs directory.");
  const packDir = await packsDir.getDirectoryHandle(key, { create: false });

  const raw = await _tryReadManifest(packDir);
  if (!raw) throw new Error("PackStore: installed pack missing manifest.json (or pack.json).");

  const pack = mergeDefaults(DEFAULT_PACK, raw);
  pack.packId = _validatePackId(pack.packId);
  pack.__isInstalled = true;
  pack.__storeKey = key;

  // UI assets
  if (pack?.ui){
    // Theme CSS
    if (pack.ui.themeCss && !_isAbsLikeUrl(pack.ui.themeCss)){
      const cssUrl = await _getBlobUrlForFile(key, pack.ui.themeCss);
      pack.ui.themeCss = cssUrl || null;
    }

    // Board background (supports extensionless + fallback names)
    const bgRel = pack.ui.boardBackground;
    let bgUrl = null;
    for (const cand of _candidatesForBackground(bgRel)){
      bgUrl = await _getBlobUrlForFile(key, cand);
      if (bgUrl) break;
    }
    pack.ui.boardBackground = bgUrl;
  }

  // Sounds
  if (pack?.sounds && typeof pack.sounds === "object"){
    for (const [k, v] of Object.entries(pack.sounds)){
      if (typeof v === "string"){
        if (!_isAbsLikeUrl(v)){
          const u = await _getBlobUrlForFile(key, v);
          if (u) pack.sounds[k] = u;
        }
      } else if (Array.isArray(v)) {
        const out = [];
        for (const it of v){
          if (typeof it !== "string") continue;
          if (_isAbsLikeUrl(it)) out.push(it);
          else {
            const u = await _getBlobUrlForFile(key, it);
            if (u) out.push(u);
          }
        }
        pack.sounds[k] = out;
      }
    }
  }

  // Sprite sheet
  if (pack?.dominoSet?.spriteSheetPath && !_isAbsLikeUrl(pack.dominoSet.spriteSheetPath)){
    const su = await _getBlobUrlForFile(key, pack.dominoSet.spriteSheetPath);
    if (su) pack.dominoSet.spriteSheetPath = su;
  }

  // Tile URL cache (synchronous getTileUrl)
  const tileMap = new Map();
  const max = Number(pack?.dominoSet?.maxPip ?? 12);
  const pattern = String(pack?.dominoSet?.tilePathPattern || "tiles/D12_{AA}_{BB}_{PACK}.svg");
  const tag = String(pack.packId || "DEFAULT").toUpperCase();

  // We prebuild ALL pairs so getTileUrl can be sync.
  for (let a = 0; a <= max; a++){
    for (let b = a; b <= max; b++){
      const AA = String(a).padStart(2, "0");
      const BB = String(b).padStart(2, "0");
      const rel = pattern
        .replace("{AA}", AA)
        .replace("{BB}", BB)
        .replace("{PACK}", tag)
        .replace(/^\/+/, "");

      const u = await _getBlobUrlForFile(key, rel);
      if (u) tileMap.set(rel, u);
    }
  }

  pack.getTileUrl = (lo, hi) => {
    const aa = Math.min(Number(lo), Number(hi));
    const bb = Math.max(Number(lo), Number(hi));
    const AA = String(aa).padStart(2, "0");
    const BB = String(bb).padStart(2, "0");
    const rel = pattern
      .replace("{AA}", AA)
      .replace("{BB}", BB)
      .replace("{PACK}", tag)
      .replace(/^\/+/, "");
    return tileMap.get(rel) || null;
  };

  pack.__tileMap = tileMap;

  return pack;
}

// =========================
// Public API
// =========================

export const PackStore = {
  isSupported: _isSupported,

  /** Loads the installed pack index into memory. Call once at boot. */
  async init(){
    if (!_isSupported()) {
      _index = new Map();
      return _index;
    }
    return await _scanIndex();
  },

  /** Returns installed pack metadata (sorted by name). */
  list(){
    return Array.from(_index.values())
      .sort((a,b)=> String(a.name).localeCompare(String(b.name)));
  },

  has(packKey){
    return _index.has(_normKey(packKey));
  },

  /** Installs a pack by copying an unzipped folder into OPFS. */
  async installFromFolder(){
    if (!_isSupported()){
      throw new Error("PackStore: install requires a Chromium-based browser (OPFS + Folder Picker)." );
    }

    const srcRoot = await _pickPackRootFolder();
    const manifest = await _tryReadManifest(srcRoot);
    if (!manifest) throw new Error("PackStore: missing manifest.json (or pack.json)." );

    const packId = _validatePackId(manifest.packId);
    const key = _normKey(packId);

    const packsDir = await _getOpfsPacksDir({ create: true });

    // Overwrite if exists
    try{ await packsDir.removeEntry(key, { recursive: true }); }
    catch{}

    const dest = await packsDir.getDirectoryHandle(key, { create: true });
    await _copyDirRecursive(srcRoot, dest);

    // Clear old cached blob URLs (if reinstall)
    _revokeCachedUrlsForPack(key);

    // Re-scan and return meta
    await _scanIndex();
    const meta = _index.get(key) || {
      key,
      packId,
      name: String(manifest.name || packId),
      version: String(manifest.version || "1.0.0"),
      source: "opfs",
    };
    _index.set(key, meta);
    return meta;
  },

  /** Uninstalls a pack from OPFS. */
  async uninstall(packKey){
    const key = _normKey(packKey);
    const packsDir = await _getOpfsPacksDir({ create: false });
    if (!packsDir) return false;

    try{
      await packsDir.removeEntry(key, { recursive: true });
      _revokeCachedUrlsForPack(key);
      _index.delete(key);
      return true;
    }catch{
      return false;
    }
  },

  /** Loads an installed pack and returns a pack object ready for ui.js (sync getTileUrl). */
  async loadPack(packKey){
    return await _materializeInstalledPack(packKey);
  }
};

// =========================
// UI wiring (optional; uses IDs in game.html)
// =========================

export function wirePackStoreUI({
  onInstalled = null,
  onUse = null,
  onUninstalled = null,
} = {}){
  const overlay = document.getElementById("packStoreOverlay");
  if (!overlay) return;

  const closeX = document.getElementById("packStoreCloseX");
  const closeBtn = document.getElementById("packStoreCloseBtn");
  const installFolderBtn = document.getElementById("packStoreInstallFolderBtn");
  const refreshBtn = document.getElementById("packStoreRefreshBtn");
  const listEl = document.getElementById("packStoreList");
  const statusEl = document.getElementById("packStoreStatus");

  const setStatus = (msg) => {
    if (!statusEl) return;
    statusEl.textContent = msg ? String(msg) : "";
  };

  const open = async () => {
    overlay.classList.remove("hidden");
    await refresh();
  };

  const close = () => {
    overlay.classList.add("hidden");
    setStatus("");
  };

  async function refresh(){
    if (!listEl) return;
    setStatus("");

    if (!PackStore.isSupported()){
      listEl.innerHTML =
        `<div class="packstore-empty">` +
        `This browser can’t do in-app installs yet. Use Chrome/Edge on desktop, or install packs manually into <code>/packs/&lt;pack&gt;/</code>.` +
        `</div>`;
      return;
    }

    await PackStore.init();
    const packs = PackStore.list();
    if (!packs.length){
      listEl.innerHTML = `<div class="packstore-empty">No installed packs yet.</div>`;
      return;
    }

    listEl.innerHTML = packs.map(p => {
      const nm = escapeHtml(p.name);
      const id = escapeHtml(p.packId);
      const ver = escapeHtml(p.version);
      const key = escapeHtml(p.key);
      return `
        <div class="packstore-row" data-pack="${key}">
          <div class="packstore-meta">
            <div class="packstore-name">${nm}</div>
            <div class="packstore-sub">${id} • v${ver}</div>
          </div>
          <div class="packstore-row-actions">
            <button class="packstore-use" type="button">Use</button>
            <button class="packstore-trash" type="button">Uninstall</button>
          </div>
        </div>`;
    }).join("");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  closeX?.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
  refreshBtn?.addEventListener("click", () => refresh());

  installFolderBtn?.addEventListener("click", async () => {
    try{
      setStatus("Installing… pick the UNZIPPED pack folder that contains manifest.json");
      const meta = await PackStore.installFromFolder();
      setStatus(`Installed: ${meta.name} (${meta.packId})`);
      await refresh();
      if (typeof onInstalled === "function") await onInstalled(meta);
    }catch(err){
      setStatus(err?.message || String(err));
    }
  });

  listEl?.addEventListener("click", async (e) => {
    const row = e.target?.closest?.(".packstore-row");
    if (!row) return;
    const key = row.getAttribute("data-pack");

    if (e.target?.classList?.contains("packstore-use")){
      try{
        if (typeof onUse === "function") await onUse(key);
        close();
      }catch(err){
        setStatus(err?.message || String(err));
      }
    }

    if (e.target?.classList?.contains("packstore-trash")){
      const ok = confirm(`Uninstall pack “${key}”?`);
      if (!ok) return;
      try{
        await PackStore.uninstall(key);
        setStatus(`Uninstalled: ${key}`);
        await refresh();
        if (typeof onUninstalled === "function") await onUninstalled(key);
      }catch(err){
        setStatus(err?.message || String(err));
      }
    }
  });

  return { open, close, refresh };
}

// END: js/packstore.js
