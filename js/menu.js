/*!
 * Copyright (c) 2026 Ed Cook - Three Legged Dog and Company
 * All rights reserved.
 */

// js/menu.js
// Home screen menu / options / scores wiring for Double 12 Express.

import { loadSettings, saveSettings, DEFAULT_SETTINGS, deepEqual, sanitizeSkin } from "./settings.js";
import { loadHighScores, clearHighScores } from "./highscores.js";
import { PackStore } from "./packstore.js";
import {
  isPremiumEntitled,
  initMonetization,
  buyPremiumUnlock,
  restorePremiumUnlock,
  openAdPrivacyOptions,
  openPrivacyPolicy,
} from "./monetization.js";

/* ---------- DOM ---------- */
const playBtn = document.getElementById("playBtn");
const optionsBtn = document.getElementById("optionsBtn");
const scoresBtn = document.getElementById("scoresBtn");

const optionsBackdrop = document.getElementById("optionsBackdrop");
const closeOptionsBtn = document.getElementById("closeOptions");
const cancelOptionsBtn = document.getElementById("cancelOptions");
const saveOptionsBtn = document.getElementById("saveOptions");

const scoresBackdrop = document.getElementById("scoresBackdrop");
const closeScoresBtn = document.getElementById("closeScores");
const clearScoresBtn = document.getElementById("clearScoresBtn");

const dominoSkinSelect = document.getElementById("dominoSkinSelect");
const aiDifficultySelect = document.getElementById("aiDifficultySelect");
const textSizeSelect = document.getElementById("textSizeSelect");
const playerNameInput = document.getElementById("playerNameInput");
const highContrastToggle = document.getElementById("highContrastToggle");
const reduceMotionToggle = document.getElementById("reduceMotionToggle");
const musicVolumeRange = document.getElementById("musicVolumeRange");
const sfxVolumeRange = document.getElementById("sfxVolumeRange");
const scoresList = document.getElementById("scoresList");

const premiumMenuCard = document.getElementById("premiumMenuCard");
const premiumMenuDesc = document.getElementById("premiumMenuDesc");
const premiumMenuStatus = document.getElementById("premiumMenuStatus");
const upgradePremiumBtn = document.getElementById("upgradePremiumBtn");
const restorePremiumBtn = document.getElementById("restorePremiumBtn");
const privacyBtn = document.getElementById("privacyBtn");
const themeGallery = document.getElementById("themeGallery");
const installPackBtn = document.getElementById("installPackBtn");
const packStoreBtn = document.getElementById("packStoreBtn");
const packInstallHint = document.getElementById("packInstallHint");

const rootEl = document.documentElement;
const bodyEl = document.body;

/* ---------- State ---------- */
let settings = sanitizeDraftForTier(loadSettings());
let draft = structuredClone(settings);
const packStore = new PackStore();
let installedPacksCache = [];

const BUILT_IN_THEMES = [
  {
    key: "classic",
    label: "Classic",
    premium: false,
    description: "The default station look.",
    thumb: "packs/default/preview.svg",
    packId: "DEFAULT",
  },
  {
    key: "irish",
    label: "Irish",
    premium: true,
    description: "Lucky green styling and Irish audio flair.",
    thumb: "packs/irish/thumbs/preview.png",
    packId: "IRISH",
  },
  {
    key: "neon",
    label: "Neon",
    premium: true,
    description: "Bright neon dominoes for night-owl conductors.",
    thumb: "packs/neon/thumbs/preview.png",
    packId: "NEON",
  },
];

/* ---------- Utils ---------- */
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function normalizeDifficulty(raw) {
  const v = String(raw || "medium").toLowerCase();
  if (["easy", "medium", "hard", "expert"].includes(v)) return v;
  return "medium";
}

function normalizeTextSize(raw) {
  const v = String(raw || "medium").toLowerCase();
  if (["small", "medium", "large"].includes(v)) return v;
  return "medium";
}

function normalizeTheme(raw) {
  const v = sanitizeSkin(raw || "classic");
  if (["classic", "irish", "neon"].includes(v)) return v;
  if (installedPacksCache.some((p) => p.key === v)) return v;
  return "classic";
}

function isPremiumTheme(themeKey) {
  return BUILT_IN_THEMES.some((t) => t.key === themeKey && t.premium);
}

function isThemeLocked(themeKey) {
  return isPremiumTheme(themeKey) && !isPremiumEntitled();
}

function isPackInstalled(themeKey) {
  return installedPacksCache.some((p) => p.key === themeKey);
}

function sanitizeDraftForTier(next) {
  const safe = {
    ...DEFAULT_SETTINGS,
    ...(next || {}),
  };

  safe.playerName = String(safe.playerName || "Player").trim().slice(0, 16) || "Player";
  safe.dominoSkin = normalizeTheme(safe.dominoSkin);
  safe.aiDifficulty = normalizeDifficulty(safe.aiDifficulty);
  safe.textSize = normalizeTextSize(safe.textSize);
  safe.highContrast = !!safe.highContrast;
  safe.reduceMotion = !!safe.reduceMotion;
  safe.musicVolume = clamp(safe.musicVolume, 0, 100);
  safe.sfxVolume = clamp(safe.sfxVolume, 0, 100);
  safe.mute = !!safe.mute;

  if (!isPremiumEntitled()) {
    if (isPremiumTheme(safe.dominoSkin)) safe.dominoSkin = "classic";
  }

  return safe;
}

function applyBodyUiClasses(nextSettings) {
  bodyEl.classList.remove(
    "text-small", "text-medium", "text-large",
    "high-contrast", "reduce-motion",
    "theme-classic", "theme-irish", "theme-neon"
  );

  bodyEl.classList.add(`text-${normalizeTextSize(nextSettings.textSize)}`);
  if (nextSettings.highContrast) bodyEl.classList.add("high-contrast");
  if (nextSettings.reduceMotion) bodyEl.classList.add("reduce-motion");

  const theme = normalizeTheme(nextSettings.dominoSkin);
  if (["classic", "irish", "neon"].includes(theme)) {
    bodyEl.classList.add(`theme-${theme}`);
  }
}

function openModal(backdrop) {
  if (!backdrop) return;
  backdrop.classList.add("open");
}

function closeModal(backdrop) {
  if (!backdrop) return;
  backdrop.classList.remove("open");
}

function closeAnyOpenModal() {
  closeModal(optionsBackdrop);
  closeModal(scoresBackdrop);
  closeMenuPrompt(false);
  closeInstallPackHelp(false);
  closePackStore(false);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAnyOpenModal();
});

let __menuPromptResolve = null;

function ensureMenuPromptModal() {
  let backdrop = document.getElementById("menuPromptBackdrop");
  if (backdrop) {
    try { document.body.appendChild(backdrop); } catch {}
    return {
      backdrop,
      title: document.getElementById("menuPromptTitle"),
      body: document.getElementById("menuPromptBody"),
      okBtn: document.getElementById("menuPromptOkBtn"),
      cancelBtn: document.getElementById("menuPromptCancelBtn"),
      closeBtn: document.getElementById("menuPromptCloseBtn"),
    };
  }

  backdrop = document.createElement("div");
  backdrop.id = "menuPromptBackdrop";
  backdrop.className = "backdrop";
  backdrop.style.zIndex = "2147483647";
  backdrop.innerHTML = `
    <div class="sheet" style="width:min(560px, 100%);">
      <button class="sheet-close" id="menuPromptCloseBtn" aria-label="Close">✕</button>
      <h2 id="menuPromptTitle">Notice</h2>
      <div id="menuPromptBody" class="help" style="white-space:pre-wrap;"></div>
      <div class="actions" style="justify-content:flex-end; margin-top:14px;">
        <button id="menuPromptCancelBtn" class="ghost-btn" type="button">Cancel</button>
        <button id="menuPromptOkBtn" class="solid-btn" type="button">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const closeBtn = backdrop.querySelector("#menuPromptCloseBtn");
  closeBtn?.addEventListener("click", () => closeMenuPrompt(false));

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeMenuPrompt(false);
  });

  return {
    backdrop,
    title: document.getElementById("menuPromptTitle"),
    body: document.getElementById("menuPromptBody"),
    okBtn: document.getElementById("menuPromptOkBtn"),
    cancelBtn: document.getElementById("menuPromptCancelBtn"),
    closeBtn: document.getElementById("menuPromptCloseBtn"),
  };
}

function closeMenuPrompt(result = false) {
  const ui = ensureMenuPromptModal();
  ui.backdrop.classList.remove("open");
  const resolve = __menuPromptResolve;
  __menuPromptResolve = null;
  if (resolve) resolve(!!result);
}

async function showMenuPrompt({ title = "Notice", message = "", okText = "OK", cancelText = "Cancel", showCancel = true } = {}) {
  const ui = ensureMenuPromptModal();
  ui.title.textContent = title;
  ui.body.textContent = String(message || "");
  ui.okBtn.textContent = okText;
  ui.cancelBtn.textContent = cancelText;
  ui.cancelBtn.style.display = showCancel ? "inline-flex" : "none";

  ui.okBtn.onclick = () => closeMenuPrompt(true);
  ui.cancelBtn.onclick = () => closeMenuPrompt(false);

  ui.backdrop.classList.add("open");

  return new Promise((resolve) => {
    __menuPromptResolve = resolve;
    setTimeout(() => {
      try { ui.okBtn.focus(); } catch {}
    }, 0);
  });
}

let __installPackHelpResolve = null;
function ensureInstallPackHelpModal() {
  let backdrop = document.getElementById("installPackHelpBackdrop");
  if (backdrop) {
    try { document.body.appendChild(backdrop); } catch {}
    return {
      backdrop,
      title: document.getElementById("installPackHelpTitle"),
      body: document.getElementById("installPackHelpBody"),
      okBtn: document.getElementById("installPackHelpOkBtn"),
      closeBtn: document.getElementById("installPackHelpCloseBtn"),
    };
  }

  backdrop = document.createElement("div");
  backdrop.id = "installPackHelpBackdrop";
  backdrop.className = "backdrop";
  backdrop.style.zIndex = "2147483647";
  backdrop.innerHTML = `
    <div class="sheet" style="width:min(620px, 100%);">
      <button class="sheet-close" id="installPackHelpCloseBtn" aria-label="Close">✕</button>
      <h2 id="installPackHelpTitle">Install Theme Pack</h2>
      <div id="installPackHelpBody" class="help" style="white-space:pre-wrap;"></div>
      <div class="actions" style="justify-content:flex-end; margin-top:14px;">
        <button id="installPackHelpOkBtn" class="solid-btn" type="button">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const closeBtn = backdrop.querySelector("#installPackHelpCloseBtn");
  closeBtn?.addEventListener("click", () => closeInstallPackHelp(false));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeInstallPackHelp(false);
  });

  return {
    backdrop,
    title: document.getElementById("installPackHelpTitle"),
    body: document.getElementById("installPackHelpBody"),
    okBtn: document.getElementById("installPackHelpOkBtn"),
    closeBtn: document.getElementById("installPackHelpCloseBtn"),
  };
}

function closeInstallPackHelp(result = false) {
  const ui = ensureInstallPackHelpModal();
  ui.backdrop.classList.remove("open");
  const resolve = __installPackHelpResolve;
  __installPackHelpResolve = null;
  if (resolve) resolve(!!result);
}

async function showInstallPackHelp() {
  const ui = ensureInstallPackHelpModal();
  ui.body.innerHTML = [
    "Use this to install a <strong>.zip</strong> theme pack into the browser.",
    "",
    "What works best:",
    "• a zip that contains a pack manifest (manifest.json or pack.json)",
    "• the pack’s tiles, sounds, and background files inside the zip",
    "• Chrome / Edge desktop for the smoothest install flow",
    "",
    "Built-in themes like Classic, Irish, and Neon do not need installing.",
    "You only need this for extra downloadable theme packs.",
  ].join("<br>");

  ui.okBtn.onclick = () => closeInstallPackHelp(true);
  ui.backdrop.classList.add("open");

  return new Promise((resolve) => {
    __installPackHelpResolve = resolve;
    setTimeout(() => {
      try { ui.okBtn.focus(); } catch {}
    }, 0);
  });
}

let __packStoreResolve = null;
function ensurePackStoreModal() {
  let backdrop = document.getElementById("packStoreBackdrop");
  if (backdrop) {
    try { document.body.appendChild(backdrop); } catch {}
    return {
      backdrop,
      title: document.getElementById("packStoreTitle"),
      body: document.getElementById("packStoreBody"),
      closeBtn: document.getElementById("packStoreCloseBtn"),
    };
  }

  backdrop = document.createElement("div");
  backdrop.id = "packStoreBackdrop";
  backdrop.className = "backdrop";
  backdrop.style.zIndex = "2147483647";
  backdrop.innerHTML = `
    <div class="sheet" style="width:min(760px, 100%); max-height:min(86vh, 100%); overflow:auto;">
      <button class="sheet-close" id="packStoreCloseBtn" aria-label="Close">✕</button>
      <h2 id="packStoreTitle">Theme Store</h2>
      <div id="packStoreBody"></div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const closeBtn = backdrop.querySelector("#packStoreCloseBtn");
  closeBtn?.addEventListener("click", () => closePackStore(false));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closePackStore(false);
  });

  return {
    backdrop,
    title: document.getElementById("packStoreTitle"),
    body: document.getElementById("packStoreBody"),
    closeBtn: document.getElementById("packStoreCloseBtn"),
  };
}

function closePackStore(result = false) {
  const ui = ensurePackStoreModal();
  ui.backdrop.classList.remove("open");
  const resolve = __packStoreResolve;
  __packStoreResolve = null;
  if (resolve) resolve(!!result);
}

async function refreshInstalledPacksCache() {
  try {
    installedPacksCache = await packStore.listInstalled();
  } catch {
    installedPacksCache = [];
  }
  return installedPacksCache;
}

function buildInstalledPackCards() {
  if (!installedPacksCache.length) {
    return `<div class="help">No extra theme packs installed yet.</div>`;
  }

  return installedPacksCache.map((p) => `
    <div class="theme-card">
      <div class="theme-card__body">
        <div class="theme-card__name">${escapeHtml(p.name || p.key)}</div>
        <div class="theme-card__meta">Installed pack • ${escapeHtml(p.version || "1.0.0")}</div>
        <div class="theme-card__actions">
          <button class="btn-small primary" data-pack-apply="${escapeAttr(p.key)}" type="button">Use Theme</button>
          <button class="btn-small" data-pack-remove="${escapeAttr(p.key)}" type="button">Remove</button>
        </div>
      </div>
    </div>
  `).join("");
}

async function showPackStore() {
  const ui = ensurePackStoreModal();
  await refreshInstalledPacksCache();

  ui.body.innerHTML = `
    <div class="help" style="margin-bottom:12px;">
      Install extra zip theme packs, or manage packs already installed in this browser.
    </div>

    <div class="actions" style="justify-content:flex-start; margin:0 0 14px 0;">
      <button id="packStoreInstallNowBtn" class="solid-btn" type="button">Install Zip Theme Pack</button>
      <button id="packStorePrivacyBtn" class="ghost-btn" type="button">Privacy</button>
    </div>

    <div class="menu-section" style="margin-top:0;">
      <div class="menu-section-title">Installed Theme Packs</div>
      <div id="packStoreInstalledList" class="theme-gallery">${buildInstalledPackCards()}</div>
    </div>
  `;

  ui.body.querySelector("#packStoreInstallNowBtn")?.addEventListener("click", async () => {
    if (!isPremiumEntitled()) {
      await showMenuPrompt({
        title: "Premium Required",
        message: "Installing extra zip theme packs is a Premium feature.",
        okText: "OK",
        showCancel: false,
      });
      return;
    }

    try {
      packInstallHint.textContent = "Selecting zip theme pack…";
      const rec = await packStore.pickAndInstallZip();
      if (rec) {
        packInstallHint.textContent = `Installed theme pack: ${rec.name}`;
        draft.dominoSkin = rec.key;
        await refreshInstalledPacksCache();
        syncUIFromDraft();
        await renderThemeGallery();
        await showPackStore();
      } else {
        packInstallHint.textContent = "Theme pack install canceled.";
      }
    } catch (err) {
      console.error(err);
      packInstallHint.textContent = err?.message || "Failed to install theme pack.";
      await showMenuPrompt({
        title: "Install Theme Pack",
        message: packInstallHint.textContent,
        okText: "OK",
        showCancel: false,
      });
    }
  });

  ui.body.querySelector("#packStorePrivacyBtn")?.addEventListener("click", () => {
    void openAdPrivacyOptions();
  });

  ui.body.querySelectorAll("[data-pack-apply]").forEach((btn) => {
    btn.addEventListener("click", () => {
      draft.dominoSkin = btn.getAttribute("data-pack-apply") || "classic";
      syncUIFromDraft();
      void renderThemeGallery();
      closePackStore(true);
    });
  });

  ui.body.querySelectorAll("[data-pack-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.getAttribute("data-pack-remove") || "";
      const ok = await showMenuPrompt({
        title: "Remove Theme Pack",
        message: `Remove the installed theme pack “${key}” from this browser?`,
        okText: "Remove",
        cancelText: "Cancel",
        showCancel: true,
      });
      if (!ok) return;

      await packStore.uninstall(key);
      if (draft.dominoSkin === key) draft.dominoSkin = "classic";
      syncUIFromDraft();
      await renderThemeGallery();
      await showPackStore();
    });
  });

  ui.backdrop.classList.add("open");
  return new Promise((resolve) => {
    __packStoreResolve = resolve;
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s) { return escapeHtml(s); }

function syncUIFromDraft() {
  if (playerNameInput) playerNameInput.value = draft.playerName || "Player";
  if (dominoSkinSelect) dominoSkinSelect.value = normalizeTheme(draft.dominoSkin);
  if (aiDifficultySelect) aiDifficultySelect.value = normalizeDifficulty(draft.aiDifficulty);
  if (textSizeSelect) textSizeSelect.value = normalizeTextSize(draft.textSize);
  if (highContrastToggle) highContrastToggle.checked = !!draft.highContrast;
  if (reduceMotionToggle) reduceMotionToggle.checked = !!draft.reduceMotion;
  if (musicVolumeRange) musicVolumeRange.value = String(clamp(draft.musicVolume, 0, 100));
  if (sfxVolumeRange) sfxVolumeRange.value = String(clamp(draft.sfxVolume, 0, 100));
}

function readDraftFromUI() {
  draft = sanitizeDraftForTier({
    ...draft,
    playerName: playerNameInput?.value,
    dominoSkin: dominoSkinSelect?.value,
    aiDifficulty: aiDifficultySelect?.value,
    textSize: textSizeSelect?.value,
    highContrast: !!highContrastToggle?.checked,
    reduceMotion: !!reduceMotionToggle?.checked,
    musicVolume: Number(musicVolumeRange?.value || 0),
    sfxVolume: Number(sfxVolumeRange?.value || 0),
    mute: !!draft.mute,
  });
  return draft;
}

function applySettings(nextSettings) {
  settings = sanitizeDraftForTier(nextSettings);
  saveSettings(settings);
  applyBodyUiClasses(settings);
}

function renderHighScores() {
  if (!scoresList) return;
  const scores = loadHighScores();
  if (!scores.length) {
    scoresList.innerHTML = `<div class="help">No high scores yet. Go make some brag-worthy mistakes.</div>`;
    return;
  }

  scoresList.innerHTML = scores.map((s, idx) => `
    <div class="score-card">
      <div>
        <div><strong>#${idx + 1} ${escapeHtml(s.name || "Player")}</strong></div>
        <div class="inline-note">${escapeHtml(s.difficulty || "medium")} • ${escapeHtml(s.date ? new Date(s.date).toLocaleDateString() : "")}</div>
      </div>
      <div><strong>${Number(s.score || 0)}</strong></div>
    </div>
  `).join("");
}

async function renderThemeGallery() {
  if (!themeGallery) return;
  await refreshInstalledPacksCache();

  const installedCards = installedPacksCache.map((p) => ({
    key: p.key,
    label: p.name || p.key,
    premium: false,
    description: `Installed pack • ${p.version || "1.0.0"}`,
    thumb: p.manifest?.assets?.thumb || p.manifest?.assets?.icon || "",
    packId: (p.manifest?.meta?.tag || p.key || "PACK").toUpperCase(),
    installed: true,
  }));

  const cards = [...BUILT_IN_THEMES, ...installedCards];

  themeGallery.innerHTML = cards.map((t) => {
    const active = draft.dominoSkin === t.key;
    const locked = isThemeLocked(t.key);
    return `
      <div class="theme-card ${active ? "is-active" : ""} ${locked ? "is-locked" : ""}">
        <div class="theme-card__thumb">
          ${t.thumb ? `<img src="${escapeAttr(t.thumb)}" alt="${escapeAttr(t.label)} preview">` : `<div class="help">No preview</div>`}
        </div>
        <div class="theme-card__body">
          <div class="theme-card__name">${escapeHtml(t.label)}</div>
          <div class="theme-card__meta">${escapeHtml(t.description)}</div>
          <div class="theme-card__status">${active ? "Currently selected" : (locked ? "Locked — Premium" : (t.installed ? "Installed pack" : "Built-in"))}</div>
          <div class="theme-card__actions">
            <button class="btn-small ${locked ? "" : "primary"}" data-theme-action="${escapeAttr(t.key)}" type="button">${locked ? "Preview" : (active ? "Selected" : "Use Theme")}</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  themeGallery.querySelectorAll("[data-theme-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const themeKey = btn.getAttribute("data-theme-action") || "classic";
      if (isThemeLocked(themeKey)) {
        const goBuy = await showMenuPrompt({
          title: "Premium Theme",
          message: `${themeKey.charAt(0).toUpperCase() + themeKey.slice(1)} is a Premium theme. Upgrade to unlock it and remove ads.`,
          okText: "Upgrade to Premium",
          cancelText: "Cancel",
          showCancel: true,
        });
        if (goBuy) {
          closeModal(optionsBackdrop);
          try {
            await buyPremiumUnlock();
          } catch (err) {
            await showMenuPrompt({
              title: "Premium Unlock",
              message: String(err?.message || err || "Google Play purchase was not completed."),
              okText: "OK",
              showCancel: false,
            });
          }
          await refreshPremiumMenuCta();
          await renderThemeGallery();
        }
        return;
      }

      draft.dominoSkin = themeKey;
      syncUIFromDraft();
      await renderThemeGallery();
    });
  });
}

async function refreshPremiumMenuCta() {
  if (!premiumMenuCard) return;

  const owned = isPremiumEntitled();
  premiumMenuDesc.textContent = owned
    ? "Premium unlocked. Ads are removed and all built-in themes are available."
    : "Remove ads and unlock all built-in themes.";

  premiumMenuStatus.textContent = owned
    ? "Premium is active on this device."
    : "Free tier: Classic theme only. Premium themes and zip installs are locked.";

  if (upgradePremiumBtn) upgradePremiumBtn.textContent = owned ? "Premium Active" : "Upgrade to Premium";
  if (upgradePremiumBtn) upgradePremiumBtn.disabled = owned;

  if (installPackBtn) installPackBtn.disabled = !owned;
  if (packInstallHint) {
    packInstallHint.textContent = owned
      ? "Install zip theme packs or browse installed packs."
      : "Theme Store works best with Premium. Built-in themes can still be previewed.";
  }
}

function goToGame() {
  window.location.href = "game.html";
}

/* ---------- Wire buttons ---------- */
playBtn?.addEventListener("click", goToGame);

optionsBtn?.addEventListener("click", async () => {
  settings = sanitizeDraftForTier(loadSettings());
  draft = structuredClone(settings);
  syncUIFromDraft();
  openModal(optionsBackdrop);
  await refreshPremiumMenuCta();
  await renderThemeGallery();
});

scoresBtn?.addEventListener("click", () => {
  renderHighScores();
  openModal(scoresBackdrop);
});

closeOptionsBtn?.addEventListener("click", () => closeModal(optionsBackdrop));
cancelOptionsBtn?.addEventListener("click", () => closeModal(optionsBackdrop));
closeScoresBtn?.addEventListener("click", () => closeModal(scoresBackdrop));

optionsBackdrop?.addEventListener("click", (e) => {
  if (e.target === optionsBackdrop) closeModal(optionsBackdrop);
});

scoresBackdrop?.addEventListener("click", (e) => {
  if (e.target === scoresBackdrop) closeModal(scoresBackdrop);
});

saveOptionsBtn?.addEventListener("click", async () => {
  const next = readDraftFromUI();
  const safe = sanitizeDraftForTier(next);
  const changed = !deepEqual(settings, safe);
  applySettings(safe);
  closeModal(optionsBackdrop);

  if (changed) {
    // Settings are picked up on next game launch.
  }
});

clearScoresBtn?.addEventListener("click", async () => {
  const ok = await showMenuPrompt({
    title: "Clear High Scores",
    message: "Delete the stored high score list on this device?",
    okText: "Delete",
    cancelText: "Cancel",
    showCancel: true,
  });
  if (!ok) return;
  clearHighScores();
  renderHighScores();
});

upgradePremiumBtn?.addEventListener("click", async () => {
  try {
    closeModal(optionsBackdrop);
    await buyPremiumUnlock();
  } catch (err) {
    await showMenuPrompt({
      title: "Premium Unlock",
      message: String(err?.message || err || "Google Play purchase was not completed."),
      okText: "OK",
      showCancel: false,
    });
  } finally {
    await refreshPremiumMenuCta();
    await renderThemeGallery();
  }
});

restorePremiumBtn?.addEventListener("click", async () => {
  try {
    const restored = await restorePremiumUnlock();
    await refreshPremiumMenuCta();
    await renderThemeGallery();
    premiumMenuStatus.textContent = restored
      ? "Purchase restored. Premium is active on this device."
      : "No premium purchase was found to restore on this device.";
  } catch (err) {
    await showMenuPrompt({
      title: "Restore Purchase",
      message: String(err?.message || err || "Unable to restore purchases right now."),
      okText: "OK",
      showCancel: false,
    });
  }
});

privacyBtn?.addEventListener("click", async () => {
  try {
    await openAdPrivacyOptions();
  } catch {
    openPrivacyPolicy();
  }
});

installPackBtn?.addEventListener("click", async () => {
  if (!isPremiumEntitled()) {
    await showMenuPrompt({
      title: "Premium Required",
      message: "Installing extra zip theme packs is a Premium feature.",
      okText: "OK",
      showCancel: false,
    });
    return;
  }

  const understood = await showInstallPackHelp();
  if (!understood) return;

  try {
    packInstallHint.textContent = "Selecting zip theme pack…";
    const rec = await packStore.pickAndInstallZip();
    if (rec) {
      packInstallHint.textContent = `Installed theme pack: ${rec.name}`;
      draft.dominoSkin = rec.key;
      syncUIFromDraft();
      await renderThemeGallery();
    } else {
      packInstallHint.textContent = "Theme pack install canceled.";
    }
  } catch (err) {
    console.error(err);
    packInstallHint.textContent = err?.message || "Failed to install theme pack.";
    await showMenuPrompt({
      title: "Install Theme Pack",
      message: packInstallHint.textContent,
      okText: "OK",
      showCancel: false,
    });
  }
});

packStoreBtn?.addEventListener("click", () => {
  void showPackStore();
});

window.addEventListener("premium-status-changed", async () => {
  await refreshPremiumMenuCta();
  draft = sanitizeDraftForTier({ ...draft });
  syncUIFromDraft();
  await renderThemeGallery();
});

/* ---------- Boot ---------- */
(async function bootMenu() {
  settings = sanitizeDraftForTier(loadSettings());
  draft = structuredClone(settings);
  applySettings(settings);
  syncUIFromDraft();
  await initMonetization({ showBanner: false }).catch((err) => {
    console.warn("Monetization init failed:", err);
  });
  await refreshPremiumMenuCta();
  await refreshInstalledPacksCache();
})();
