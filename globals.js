import { Creature } from "./actors.js";
import { scheduler } from "./engine.js";
import { InputManager } from "./input.js";
import { Player } from "./player.js";
import { Item } from "./props.js";
import { Tileset } from "./tileset.js";
import { Viewport } from "./viewport.js";
import { WorldMap } from "./worldmap.js";

console.debug("Starting globals.js");

export let worldMap = new WorldMap();

export const player = new Player({
    inventory: [
        new Item("geodeSoul"),
        new Item("deliciousSoul", {stackSize: 10}),
        new Item("disgustingSoul", {stackSize: 2}),
    ],
});

worldMap.visibilitySource = player;
Creature.activePlayer = player;
scheduler.player = player;

export const tileset = Tileset.light;

/** @type {ConstructorParameters<typeof Viewport>[2]} */
let o = {
    ...await tileset.getDisplayOptions(),
    width: 31,
    height: 31,
    layers: 7,
    focusLayer: 3,
};
export const viewport = worldMap.mainViewport = new Viewport(worldMap, "gameDisplay", o);

export const input = InputManager.instance;

// make these available in the devtools console
Object.assign(self, { worldMap, tileset, player, viewport, input });
