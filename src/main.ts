import { createGame } from "./render/createGame";
import { APP_BUILD_VERSION } from "./buildVersion";

const CACHE_CLEANUP_KEY = "freeski:cache-cleanup-version";

async function retireLegacyOfflineBuild(): Promise<boolean> {
  const registrations =
    "serviceWorker" in navigator
      ? await navigator.serviceWorker.getRegistrations().catch(() => [])
      : [];
  const controlled =
    "serviceWorker" in navigator && navigator.serviceWorker.controller !== null;
  let alreadyCleaned = false;
  try {
    alreadyCleaned =
      localStorage.getItem(CACHE_CLEANUP_KEY) === APP_BUILD_VERSION;
  } catch {
    // Restricted storage should not prevent the game from loading.
  }
  if (!alreadyCleaned || registrations.length > 0 || controlled) {
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
    if ("caches" in window) {
      const cacheNames = await window.caches.keys().catch(() => []);
      await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
    }
    try {
      localStorage.setItem(CACHE_CLEANUP_KEY, APP_BUILD_VERSION);
    } catch {
      // Cache retirement still succeeded when persistent storage is blocked.
    }
  }
  return controlled;
}

document.documentElement.dataset.buildVersion = APP_BUILD_VERSION;

if (await retireLegacyOfflineBuild()) {
  window.location.reload();
} else {
  const seed =
    new URLSearchParams(window.location.search).get("seed") ?? "classic-1991";
  const loadingStatus = document.querySelector<HTMLElement>("#loading-status");
  const loadingProgress =
    document.querySelector<HTMLElement>("#loading-progress");

  if (loadingProgress) loadingProgress.style.width = "18%";
  if (loadingStatus) loadingStatus.textContent = "Starting slope systems…";
  if (loadingProgress) loadingProgress.style.width = "36%";
  if (loadingStatus) loadingStatus.textContent = "Loading alpine atlas…";
  if (loadingProgress) loadingProgress.style.width = "58%";
  createGame("game-canvas", seed);
}
