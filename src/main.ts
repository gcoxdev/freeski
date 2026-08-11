import { GENERATOR_VERSION } from "./world/generatorVersion";
import { createGame } from "./render/createGame";

const seed =
  new URLSearchParams(window.location.search).get("seed") ?? "classic-1991";
const generatorLabel = document.querySelector<HTMLElement>("#generator-label");
const seedLabel = document.querySelector<HTMLElement>("#seed-label");
const loadingStatus = document.querySelector<HTMLElement>("#loading-status");
const loadingProgress =
  document.querySelector<HTMLElement>("#loading-progress");

if (generatorLabel) generatorLabel.textContent = GENERATOR_VERSION;
if (seedLabel) {
  seedLabel.textContent = seed;
  seedLabel.dataset.seed = seed;
  seedLabel.title = `Active world seed: ${seed}`;
  seedLabel.setAttribute("aria-label", `Active world seed: ${seed}`);
}

if (loadingProgress) loadingProgress.style.width = "18%";
if (loadingStatus) loadingStatus.textContent = "Starting slope systems…";
if (loadingProgress) loadingProgress.style.width = "36%";
if (loadingStatus) loadingStatus.textContent = "Loading alpine atlas…";
if (loadingProgress) loadingProgress.style.width = "58%";
createGame("game-canvas", seed);
