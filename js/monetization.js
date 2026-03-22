// BEGIN: js/monetization.js
const PREMIUM_UNLOCK_KEY = "double12express.premium_unlock.local.v1";
const PREMIUM_PRODUCT_ID = "premium_unlock";

// Live AdMob IDs for release builds.
const ADMOB_APP_ID_PLACEHOLDER = "ca-app-pub-5663256213409070~6045826994";
const LIVE_BANNER_AD_UNIT_ID = "ca-app-pub-5663256213409070/7937493168";
const LIVE_INTERSTITIAL_AD_UNIT_ID = "ca-app-pub-5663256213409070/7570661655";

// Safe Google test IDs while you wire everything up.
const TEST_BANNER_AD_UNIT_ID = "ca-app-pub-3940256099942544/9214589741";
const TEST_INTERSTITIAL_AD_UNIT_ID = "ca-app-pub-3940256099942544/1033173712";

// IMPORTANT: flip this to false before your production release with live ad units.
const ADS_TEST_MODE = true;

const PRIVACY_POLICY_URL = "https://www.three-legged-dog-and-company.art/privacy-policy-double-12-express.html";
const INTERSTITIAL_COOLDOWN_MS = 120000;

let billingInitPromise = null;
let adsInitPromise = null;
let lastInterstitialAt = 0;

function setBannerInset(px = 0) {
  const h = Math.max(0, Number(px) || 0);
  document.documentElement.style.setProperty("--ad-banner-height", `${h}px`);
  document.body.classList.toggle("has-bottom-banner", h > 0);
}

async function wireBannerSizing() {
  const AdMob = getAdMob();
  if (!AdMob?.addListener) return;

  try {
    await AdMob.addListener("bannerAdSizeChanged", (size) => {
      setBannerInset(size?.height || 60);
    });
  } catch (err) {
    console.warn("[ads] bannerAdSizeChanged listener failed:", err);
  }
}

function isNativeCapacitor() {
  try {
    return !!window.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

function getAdMob() {
  return window.Capacitor?.Plugins?.AdMob || null;
}

function getStoreNamespace() {
  return window.CdvPurchase || null;
}

function getStore() {
  return window.CdvPurchase?.store || null;
}

function broadcastPremiumChange() {
  window.dispatchEvent(new CustomEvent("premium-status-changed", {
    detail: { owned: isPremiumEntitled() },
  }));
}

export function isPremiumEntitled() {
  try {
    return localStorage.getItem(PREMIUM_UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function setPremiumEntitled(on) {
  try {
    if (on) localStorage.setItem(PREMIUM_UNLOCK_KEY, "1");
    else localStorage.removeItem(PREMIUM_UNLOCK_KEY);
  } catch {}
  broadcastPremiumChange();
}

function currentBannerAdUnitId() {
  return ADS_TEST_MODE ? TEST_BANNER_AD_UNIT_ID : LIVE_BANNER_AD_UNIT_ID;
}

function currentInterstitialAdUnitId() {
  return ADS_TEST_MODE ? TEST_INTERSTITIAL_AD_UNIT_ID : LIVE_INTERSTITIAL_AD_UNIT_ID;
}

async function refreshOwnedStateFromStore() {
  const store = getStore();
  if (!store) return false;

  try {
    const product = store.get?.(PREMIUM_PRODUCT_ID);
    const owned = !!(
      store.owned?.(PREMIUM_PRODUCT_ID) ||
      product?.owned ||
      product?.canPurchase === false
    );
    if (owned) setPremiumEntitled(true);
    return owned;
  } catch (err) {
    console.warn("[billing] owned-state refresh failed:", err);
    return false;
  }
}

async function initializeBillingInternal() {
  if (!isNativeCapacitor()) return false;

  const CdvPurchase = getStoreNamespace();
  const store = getStore();
  if (!CdvPurchase || !store) {
    console.warn("[billing] cordova-plugin-purchase is not available yet.");
    return false;
  }

  store.error((err) => {
    console.warn("[billing]", err);
  });

  store.register([{
    id: PREMIUM_PRODUCT_ID,
    platform: CdvPurchase.Platform.GOOGLE_PLAY,
    type: CdvPurchase.ProductType.NON_CONSUMABLE,
  }]);

  store.when()
    .productUpdated((product) => {
      if (product?.id === PREMIUM_PRODUCT_ID) {
        void refreshOwnedStateFromStore();
      }
    })
    .approved((transaction) => {
      try {
        if (store.validator) {
          transaction.verify();
          return;
        }

        setPremiumEntitled(true);
        try {
          if (typeof store.finish === "function") store.finish(transaction);
          else transaction.finish?.();
        } catch (finishErr) {
          console.warn("[billing] finish() failed:", finishErr);
        }
      } catch (err) {
        console.warn("[billing] approval handling failed:", err);
      }
    })
    .verified((receipt) => {
      setPremiumEntitled(true);
      try {
        if (typeof store.finish === "function") store.finish(receipt);
        else receipt.finish?.();
      } catch (err) {
        console.warn("[billing] verified finish() failed:", err);
      }
    });

  await store.initialize([CdvPurchase.Platform.GOOGLE_PLAY]);

  try {
    await refreshOwnedStateFromStore();
    await store.restorePurchases?.();
    await refreshOwnedStateFromStore();
  } catch (err) {
    console.warn("[billing] restorePurchases failed:", err);
  }

  return true;
}

export async function initBilling() {
  if (!billingInitPromise) {
    billingInitPromise = initializeBillingInternal().catch((err) => {
      billingInitPromise = null;
      throw err;
    });
  }
  return billingInitPromise;
}

export async function buyPremiumUnlock() {
  const ok = await initBilling();
  if (!ok) {
    throw new Error("Google Play Billing is not available in this build yet. Install the plugin, sync Android, and test from a Play-enabled build.");
  }

  const store = getStore();
  const product = store?.get?.(PREMIUM_PRODUCT_ID);
  if (!product) {
    throw new Error("The premium product is not loaded. Make sure premium_unlock exists in Play Console, is active, and the test account can see it.");
  }

  const offer = typeof product.getOffer === "function"
    ? product.getOffer()
    : (Array.isArray(product.offers) ? product.offers[0] : null);

  if (!offer?.order) {
    throw new Error("Google Play did not return a purchasable offer for premium_unlock.");
  }

  await offer.order();
  return true;
}

export async function restorePremiumUnlock() {
  const ok = await initBilling();
  if (!ok) return false;
  const store = getStore();
  try {
    await store.restorePurchases?.();
  } catch (err) {
    console.warn("[billing] restorePremiumUnlock failed:", err);
  }
  return refreshOwnedStateFromStore();
}

async function initializeAdsInternal() {
  if (!isNativeCapacitor()) return false;

  const AdMob = getAdMob();
  if (!AdMob) {
    console.warn("[ads] AdMob plugin is not available yet.");
    return false;
  }

  await AdMob.initialize();
  await wireBannerSizing();

  let canRequestAds = true;

  try {
    let consentInfo = await AdMob.requestConsentInfo();
    canRequestAds = consentInfo?.canRequestAds !== false;

    if (consentInfo?.isConsentFormAvailable && consentInfo?.canRequestAds === false) {
      consentInfo = await AdMob.showConsentForm();
      canRequestAds = consentInfo?.canRequestAds !== false;
    }
  } catch (err) {
    console.warn("[ads] consent flow failed:", err);
  }

  return canRequestAds;
}

export async function initAds() {
  if (!adsInitPromise) {
    adsInitPromise = initializeAdsInternal().catch((err) => {
      adsInitPromise = null;
      throw err;
    });
  }
  return adsInitPromise;
}

export async function hideAllAds() {
  const AdMob = getAdMob();
  if (!AdMob) {
    setBannerInset(0);
    return;
  }
  try { await AdMob.removeBanner?.(); } catch {}
  setBannerInset(0);
}

export async function showBannerIfEligible() {
  if (isPremiumEntitled()) {
    await hideAllAds();
    return false;
  }

  const ok = await initAds();
  if (!ok) return false;

  const AdMob = getAdMob();
  try {
    await AdMob.showBanner({
      adId: currentBannerAdUnitId(),
      adSize: "ADAPTIVE_BANNER",
      position: "BOTTOM_CENTER",
      margin: 0,
      isTesting: ADS_TEST_MODE,
    });
    setBannerInset(60);
    return true;
  } catch (err) {
    console.warn("[ads] showBanner failed:", err);
    return false;
  }
}

export async function maybeShowInterstitial(reason = "natural-break") {
  if (isPremiumEntitled()) return false;

  const now = Date.now();
  if (now - lastInterstitialAt < INTERSTITIAL_COOLDOWN_MS) {
    return false;
  }

  const ok = await initAds();
  if (!ok) return false;

  const AdMob = getAdMob();
  try {
    await AdMob.prepareInterstitial({
      adId: currentInterstitialAdUnitId(),
      isTesting: ADS_TEST_MODE,
    });
    await AdMob.showInterstitial();
    lastInterstitialAt = Date.now();
    return true;
  } catch (err) {
    console.warn(`[ads] interstitial failed (${reason}):`, err);
    return false;
  }
}

export function openPrivacyPolicy() {
  try {
    window.open(PRIVACY_POLICY_URL, "_blank", "noopener,noreferrer");
  } catch {
    window.location.href = PRIVACY_POLICY_URL;
  }
}

export async function openAdPrivacyOptions() {
  const AdMob = getAdMob();
  if (!AdMob) {
    openPrivacyPolicy();
    return false;
  }

  try {
    await initAds();
    await AdMob.showPrivacyOptionsForm?.();
    return true;
  } catch (err) {
    console.warn("[ads] showPrivacyOptionsForm failed:", err);
    openPrivacyPolicy();
    return false;
  }
}

export async function initMonetization({ showBanner = false } = {}) {
  await initBilling();
  await initAds();

  if (isPremiumEntitled()) {
    await hideAllAds();
  } else if (showBanner) {
    await showBannerIfEligible();
  } else {
    await hideAllAds();
  }

  return {
    premiumOwned: isPremiumEntitled(),
    adMobAppIdPlaceholder: ADMOB_APP_ID_PLACEHOLDER,
  };
}
// END: js/monetization.js
