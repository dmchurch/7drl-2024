import { after, dialogElement, getElement, htmlElement } from "./helpers.js";
import { KeyboardCueElement, MessageLogElement } from "./uicomponents.js";
import { DOMListAction, InputManager, MoveAction } from "./input.js";
import { worldMap, input, player, viewport } from "./globals.js";
import { scheduler } from "./engine.js";
import { generateWorld } from "./procgen.js";

console.log("Starting main.js");

await generateWorld(worldMap, player);

viewport.trackSize(document.getElementById("viewportRegion"));
viewport.trackSize(document.getElementById("depthRegion"));
viewport.createDepthView("depthGauge");

player.bindStatUIs(document.querySelectorAll(".bodypart"));

const messageLog = getElement(document.querySelector("#messagesPanel message-log"), MessageLogElement);
Object.assign(self, {messageLog});

player.bindMessageLog(messageLog);

worldMap.startAnimation();

messageLog.addMessage("The abyss calls: Welcome, Deiphage.");

// export let mobs, junk;

// regenerate().then(() => {
//     console.log("Spawning junkyard...");
//     let {x, y, z} = player;
//     x -= 4
//     y -= 4;
//     z -= 4;
//     junk = spawninBBox(player, {pop: "junkyard"}, {x: [x, x + 8], y: [y, y + 8], z: [z, z + 8]});
//     console.log("Spawning sparse area...");
//     mobs = spawnNearby(player, {pop: "sparseArea"}, {minRadius: 3});

//     Object.assign(self, {mobs});
// });

input.attach();
input.keyIndicators.push(getElement("indicator", KeyboardCueElement));
input.helpDialog = dialogElement("help");
input.bindingLabel = htmlElement(input.helpDialog.querySelector(".binding-label"));
input.keyIndicators.push(...Array.from(input.helpDialog.querySelectorAll("keyboard-cue")).map(e => getElement(e, KeyboardCueElement)))
input.helpDialog.addEventListener("close", () => {
    input.paused = false;
    for (const ki of input.keyIndicators.slice(1)) {
        ki.highlight.remove(...ki.highlight);
    }
});

input.moveHandler = player.queueMove.bind(player);

input.ignoreKeys("F5");

input.HelpAction.addKeyBindings("F1");

MoveAction.UP.addKeyBindings("KeyW", "KeyK", "ArrowUp", "Numpad8");
MoveAction.DOWN.addKeyBindings("KeyS", "KeyJ", "ArrowDown", "Numpad2");
MoveAction.LEFT.addKeyBindings("KeyA", "KeyH", "ArrowLeft", "Numpad4");
MoveAction.RIGHT.addKeyBindings("KeyD", "KeyL", "ArrowRight", "Numpad6");
MoveAction.UPLEFT.addKeyBindings("KeyY", "Numpad7", ["KeyW", "KeyA"], ["ArrowLeft", "ArrowUp"]);
MoveAction.UPRIGHT.addKeyBindings("KeyU", "Numpad9", ["KeyW", "KeyD"], ["ArrowUp", "ArrowRight"]);
MoveAction.DOWNLEFT.addKeyBindings("KeyB", "Numpad1", ["KeyS", "KeyA"], ["ArrowDown", "ArrowLeft"]);
MoveAction.DOWNRIGHT.addKeyBindings("KeyN", "Numpad3", ["KeyS", "KeyD"], ["ArrowDown", "ArrowRight"]);
MoveAction.SURFACE.addKeyBindings("KeyQ", "NumpadSubtract").addCharBinding("<");
MoveAction.DIVE.addKeyBindings("KeyZ", "NumpadAdd").addCharBinding(">");
MoveAction.WAIT.addKeyBindings("Space", "Numpad5");

MoveAction.DiagonalOnly.addKeyBindings(input.VKeyAlt);

player.bindAbilityKey(input, "dorsal", "KeyR");
player.bindAbilityKey(input, "fins", "KeyF");
player.bindAbilityKey(input, "tail", "KeyV");

input.bind(() => player.toggleInventory(), "Tab", "KeyI").setName("Inventory");

input.bind(() => player.inventoryUI?.performAction("eat"), "Digit1").setName("Eat");
input.bind(() => player.inventoryUI?.performAction("drop"), "Digit2").setName("Drop");
input.bind(() => player.queueAction(() => player.takeItems()), "KeyG").setName("Pick up").addCharBinding(",");

input.bind(new class extends DOMListAction {
    activate(event: UIEvent, input: InputManager) {
        super.activate(event, input);
        after(100).then(() => {
            worldMap.enableCutaway = false;
            viewport.redraw();
        });
    }
    deactivate(event: UIEvent, input: InputManager) {
        super.deactivate(event, input);
        worldMap.enableCutaway = true;
        viewport.redraw();
    }
}("Look Across", document.documentElement.classList, "look-across"), input.VKeyAlt);
input.bind(new DOMListAction("Look Up", document.documentElement.classList, "look-up"), [input.VKeyAlt, "KeyQ"], [input.VKeyAlt, "NumpadSubtract"])
input.bind(new DOMListAction("Look Down", document.documentElement.classList, "look-down"), [input.VKeyAlt, "KeyZ"], [input.VKeyAlt, "NumpadAdd"])

scheduler.mainLoop();