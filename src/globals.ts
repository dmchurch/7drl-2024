import { scheduler } from "./engine.js";
import { InputManager } from "./input.js";
import { Player } from "./player.js";
import { Tileset } from "./tileset.js";
import { Viewport, type ViewportOptions } from "./viewport.js";
import { WorldMap } from "./worldmap.js";

console.debug("Starting globals.js");

export let worldMap = new WorldMap(31, 31, 51);

export const player = new Player({
    // inventory: [
    //     Item.create("geodeSoul"),
    //     Item.create("deliciousSoul", {stackSize: 10}),
    //     Item.create("disgustingSoul", {stackSize: 2}),
    // ],
    // stats: {
    //     head: {
    //         current: 1,
    //     }
    // }
});

scheduler.player = player;

export const tileset = Tileset.light;

let o: ViewportOptions = {
    ...await tileset.getDisplayOptions(),
    width: 33,
    height: 33,
    layers: 7,
    focusLayer: 3,
};
export const viewport = worldMap.mainViewport = new Viewport(worldMap, "gameDisplay", o, 0);

export const input = InputManager.instance;

// make these available in the devtools console
Object.assign(self, { worldMap, tileset, player, viewport, input });

