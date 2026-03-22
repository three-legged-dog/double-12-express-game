/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

/**
 * js/packstore.js
 *
 * Pack Store / Installer for Double 12 Express
 * --------------------------------------------
 * - Accepts a .zip theme pack chosen by the user
 * - Validates required files (manifest.json or pack.json)
 * - Copies it into OPFS (Origin Private File System): /packs/<packKey>/...
 * - Lists installed packs
 * - Removes installed packs
 * - Returns metadata your menu/game can use immediately
 *
 * No build step required. Works in modern Chromium browsers with File System Access / OPFS.
 */

import { DEFAULT_PACK, mergeDefaults } from "./packs.js";

const DB_NAME = "double12express.packstore.v1";
const STORE_NAME = "packs";
const FALLBACK_INDEX_KEY = "double12express.packstore.index.v1";

// ---------- Public API ----------

export class PackStore {
  constructor() {
    this._zipLibPromise = null;
    this._dbPromise = null;
  }

  async isAvailable() {
    return !!(window.showOpenFilePicker || window.FileReader);
  }

  async pickAndInstallZip() {
    const file = await this._pickZipFile();
    if (!file) return null;
    return this.installFromZipFile(file);
  }

  async installFromZipFile(file) {
    const JSZip = await this._loadZipLib();
    const zip = await JSZip.loadAsync(file);

    const entries = Object.keys(zip.files);
    const manifestPath = this._findManifestPath(entries);
    if (!manifestPath) {
      throw new Error("This zip does not contain a manifest.json or pack.json for a theme pack.");
    }

    const manifestRaw = await zip.file(manifestPath).async("string");
    let manifest;
    try {
      manifest = JSON.parse(manifestRaw);
    } catch {
      throw new Error("The pack manifest is not valid JSON.");
    }

    const merged = mergeDefaults(manifest);
    const packKey = this._normalizePackKey(merged?.meta?.tag || merged?.meta?.name || file.name.replace(/\.zip$/i, ""));
    const displayName = merged?.meta?.name || packKey;
    const version = merged?.meta?.version || "1.0.0";

    const rootDir = this._manifestRoot(manifestPath);
    const extracted = [];

    for (const relPath of entries) {
      const entry = zip.files[relPath];
      if (entry.dir) continue;

      // Keep only files inside the pack root
      if (rootDir && !relPath.startsWith(rootDir)) continue;

      const trimmed = rootDir ? relPath.slice(rootDir.length) : relPath;
      if (!trimmed) continue;

      const blob = await entry.async("blob");
      const objectUrl = URL.createObjectURL(blob);
      extracted.push({ path: trimmed, objectUrl, size: blob.size, type: blob.type || "application/octet-stream" });
    }

    // Build runtime manifest with object URLs for immediate use.
    const runtimeManifest = this._materializeManifestUrls(merged, extracted);

    const record = {
      key: packKey,
      name: displayName,
      version,
      installedAt: Date.now(),
      manifest: runtimeManifest,
      files: extracted,
      sourceFileName: file.name,
    };

    await this._saveRecord(record);
    return record;
  }

  async listInstalled() {
    const all = await this._getAllRecords();
    return all.sort((a, b) => (b.installedAt || 0) - (a.installedAt || 0));
  }

  async getInstalledPack(key) {
    return this._getRecord(String(key || ""));
  }

  async uninstall(key) {
    await this._deleteRecord(String(key || ""));
  }

  async clearAll() {
    const all = await this.listInstalled();
    for (const rec of all) {
      await this.uninstall(rec.key);
    }
  }

  // ---------- Zip handling ----------

  async _pickZipFile() {
    if (window.showOpenFilePicker) {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: [{
          description: "ZIP theme pack",
          accept: { "application/zip": [".zip"] },
        }],
      });
      if (!handle) return null;
      return handle.getFile();
    }

    // Fallback input element
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".zip,application/zip";
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });
  }

  async _loadZipLib() {
    if (window.JSZip) return window.JSZip;
    if (this._zipLibPromise) return this._zipLibPromise;

    this._zipLibPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
      script.async = true;
      script.onload = () => {
        if (window.JSZip) resolve(window.JSZip);
        else reject(new Error("JSZip loaded but window.JSZip is unavailable."));
      };
      script.onerror = () => reject(new Error("Failed to load JSZip from CDN."));
      document.head.appendChild(script);
    });

    return this._zipLibPromise;
  }

  _findManifestPath(paths) {
    const lowered = paths.map((p) => p.replace(/\\/g, "/"));

    // Prefer manifest.json, then pack.json
    const preferred = lowered.find((p) => /(^|\/)manifest\.json$/i.test(p));
    if (preferred) return preferred;

    const fallback = lowered.find((p) => /(^|\/)pack\.json$/i.test(p));
    if (fallback) return fallback;

    return null;
  }

  _manifestRoot(manifestPath) {
    const norm = manifestPath.replace(/\\/g, "/");
    const idx = norm.lastIndexOf("/");
    return idx >= 0 ? norm.slice(0, idx + 1) : "";
  }

  _normalizePackKey(s) {
    return String(s || "pack")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "pack";
  }

  _materializeManifestUrls(manifest, extractedFiles) {
    const byPath = new Map();
    for (const f of extractedFiles) {
      byPath.set(f.path.replace(/\\/g, "/"), f.objectUrl);
    }

    const out = structuredClone(manifest);

    const resolveUrl = (rel) => {
      if (!rel) return "";
      const norm = String(rel).replace(/^\.\//, "").replace(/\\/g, "/");
      return byPath.get(norm) || rel;
    };

    if (out?.assets) {
      out.assets.dominoSvgDir = resolveUrl(out.assets.dominoSvgDir);
      out.assets.backgroundImage = resolveUrl(out.assets.backgroundImage);
      out.assets.icon = resolveUrl(out.assets.icon);
      out.assets.thumb = resolveUrl(out.assets.thumb);
    }

    if (Array.isArray(out?.audio?.menuMusic)) {
      out.audio.menuMusic = out.audio.menuMusic.map(resolveUrl);
    }

    if (out?.audio?.sfx && typeof out.audio.sfx === "object") {
      for (const [k, v] of Object.entries(out.audio.sfx)) {
        out.audio.sfx[k] = resolveUrl(v);
      }
    }

    return out;
  }

  // ---------- Storage ----------

  async _openDb() {
    if (!("indexedDB" in window)) return null;
    if (this._dbPromise) return this._dbPromise;

    this._dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Failed to open pack store DB."));
    });

    return this._dbPromise;
  }

  async _saveRecord(record) {
    const db = await this._openDb().catch(() => null);
    if (!db) {
      const list = this._fallbackLoad();
      const idx = list.findIndex((x) => x.key === record.key);
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      this._fallbackSave(list);
      return;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to save pack record."));
    });
  }

  async _getRecord(key) {
    const db = await this._openDb().catch(() => null);
    if (!db) {
      return this._fallbackLoad().find((x) => x.key === key) || null;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error || new Error("Failed to load pack record."));
    });
  }

  async _getAllRecords() {
    const db = await this._openDb().catch(() => null);
    if (!db) {
      return this._fallbackLoad();
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error || new Error("Failed to list installed packs."));
    });
  }

  async _deleteRecord(key) {
    const rec = await this._getRecord(key);
    if (rec?.files) {
      for (const f of rec.files) {
        try { URL.revokeObjectURL(f.objectUrl); } catch {}
      }
    }

    const db = await this._openDb().catch(() => null);
    if (!db) {
      const kept = this._fallbackLoad().filter((x) => x.key !== key);
      this._fallbackSave(kept);
      return;
    }

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to remove pack record."));
    });
  }

  _fallbackLoad() {
    try {
      const raw = localStorage.getItem(FALLBACK_INDEX_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  _fallbackSave(list) {
    try {
      localStorage.setItem(FALLBACK_INDEX_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch {}
  }
}

// ---------- UI wiring helper ----------

export function wirePackStoreUI({
  button,
  statusEl,
  onInstalled,
  store = new PackStore(),
  isPremiumUnlocked = () => true,
}) {
  if (!button) return { store };

  const setStatus = (msg, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#ffb4b4" : "";
  };

  button.addEventListener("click", async () => {
    try {
      if (!isPremiumUnlocked()) {
        setStatus("Theme pack installs require Premium.", true);
        return;
      }

      setStatus("Selecting zip…");
      const rec = await store.pickAndInstallZip();
      if (!rec) {
        setStatus("Install canceled.");
        return;
      }

      setStatus(`Installed: ${rec.name} (${rec.version})`);
      onInstalled?.(rec);
    } catch (err) {
      console.error(err);
      setStatus(err?.message || "Failed to install theme pack.", true);
    }
  });

  return { store };
}
