import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { SelectScene } from "./scenes/SelectScene";
import { GameScene } from "./scenes/GameScene";
import { UIScene } from "./scenes/UIScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { ArenaScene } from "./scenes/ArenaScene";
import { ArenaUIScene } from "./scenes/ArenaUIScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#06090f",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: "100%",
    height: "100%",
  },
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  render: { antialias: true, roundPixels: false },
  scene: [BootScene, MenuScene, SelectScene, GameScene, UIScene, LobbyScene, ArenaScene, ArenaUIScene],
};

// eslint-disable-next-line no-new
new Phaser.Game(config);
