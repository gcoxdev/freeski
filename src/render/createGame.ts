import Phaser from "phaser";
import { AlpineScene } from "./scenes/AlpineScene";

export function createGame(parent: string, seed: string): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.CANVAS,
    audio: {
      noAudio: true,
    },
    parent,
    backgroundColor: "#dbe9e9",
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: "100%",
      height: "100%",
    },
    render: {
      antialias: true,
      roundPixels: false,
    },
    banner: false,
    scene: [new AlpineScene(seed)],
  });
}
