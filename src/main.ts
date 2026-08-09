import "./styles.css";
import { createGame } from "./render/createGame";
import { GENERATOR_VERSION } from "./world/generatorVersion";

const seed =
  new URLSearchParams(window.location.search).get("seed") ?? "classic-1991";
const generatorLabel = document.querySelector<HTMLElement>("#generator-label");
const seedLabel = document.querySelector<HTMLElement>("#seed-label");

if (generatorLabel) generatorLabel.textContent = GENERATOR_VERSION;
if (seedLabel) seedLabel.textContent = seed;

createGame("game-canvas", seed);
