import { Display, RNG } from "rot-js";
import { Actor, Creature } from "./actors.js";
import { after, clamp, cloneTemplate, dialogElement, getElement, htmlElement, mapEntries, templateElement, typedKeys } from "./helpers.js";
import { EggItem, Item, Prop, SoulItem } from "./props.js";
import { SatietyUI, SoulUI, Stat, StatUI, allStats, isStatName } from "./stats.js";
import { Tileset } from "./tileset.js";
import { Astar3D } from "./rot3d.js";
import { MessageLogElement } from "./uicomponents.js";
import { FOG_KNOWN, WorldMap } from "./worldmap.js";
import { equipment, godSummonMessage, winMessage } from "~data/items.js";
import { DOMKeyBindingType, InputManager } from "./input.js";

console.debug("Starting player.js");

export class Player extends Creature {
    statUIs: Record<StatName, StatUI> = {
        head: null,
        dorsal: null,
        belly: null,
        fins: null,
        tail: null,
    };
    soulUI: SoulUI = null;
    soul: StatLike & {self: Player} = {
        name: null,
        s: null,
        equipDef: null,
        self: this,
        get current() {
            return this.self.durability;
        },
        set current(v) {
            this.self.durability = v;
        },
        get max() {
            return this.self.maxDurability;
        },
    };
    satietyUI: SatietyUI = null;
    satiety: StatLike = {
        name: null,
        s: null,
        equipDef: null,
        current: 500,
        max: 500,
    };

    stats: Record<StatName, Stat>;

    get statList() {
        const {head, dorsal, belly, fins, tail} = this.stats;
        return [head, dorsal, belly, fins, tail] as const;
    }

    get soulUncovered() {
        return Object.values(this.stats).some(s => s.current <= 0);
    }

    get liveStats() {
        const stats: StatLike[] = this.statList.filter(stat => stat.current > 0);
        if (this.soulUncovered) {
            stats.push(this.soul);
        }
        return stats;
    }

    godSummoned = false;
    wonGame = false;
    isDead = false;
    healCounter = 0;
    healTime = 5; // how many rounds does it take to heal 1 point of damage

    inventoryUI = new InventoryUI(this, "inventory");
    messageLog: MessageLogElement;

    activatingBodyPart: StatName | null = null;

    destroyMessages = new WeakMap();

    get inventoryOpen() {
        return this.inventoryUI.open;
    }

    actionQueue: (() => void)[] = [];
    #resolveAction: (v: any) => void;

    path: Astar3D;

    constructor(options?: Overrides<Player>);
    constructor(options?: Overrides<Player>, {stats, ...rest} = options ?? {}) {
        super("player", {displayLayer: Infinity, ...rest});
        this.stats = mapEntries(allStats, (_def, name) => new Stat(name, stats?.[name] ?? {current: this.durability, max: this.durability}));
    }

    bindStatUIs(elements: NodeListOf<Element>) {
        for (const bpContainer of elements) {
            const bodypart = htmlElement(bpContainer).dataset.bodypart;
            if (isStatName(bodypart)) {
                this.statUIs[bodypart] = new StatUI(this.stats[bodypart], bpContainer);
            } else if (bodypart === "soul") {
                this.soulUI = new SoulUI(this, bpContainer);
            } else if (bodypart === "satiety") {
                this.satietyUI = new SatietyUI(this, bpContainer);
            } else {
                throw new Error(`Bad data-bodypart: ${bodypart}`);
            }
        }
    }

    bindAbilityKey(input: InputManager, bodyPart: StatName, ...keys: DOMKeyBindingType[]) {
        input.bind(() => this.activateBodyPart(bodyPart), ...keys).setName(`Activate ${bodyPart} ability`);
        const abilityCue = this.statUIs[bodyPart].ability;
        if (abilityCue && keys.length) {
            abilityCue.style.display = "";
            for (const cue of keys) {
                if (typeof cue === "string" && InputManager.isKeyCode(cue)) {
                    abilityCue.lowlight.add(InputManager.keyCodesToKeyCues[cue]);
                }
            }
            input.abilityIndicators.push(abilityCue);
            this.statUIs[bodyPart].container.classList.add("activatable");
            this.statUIs[bodyPart].title.addEventListener("click", () => this.activateBodyPart(bodyPart));
        }
    }

    bindMessageLog(messageLog: MessageLogElement) {
        this.messageLog = messageLog;
    }

    takeDamage(amount: number, source: Actor, item: Item) {
        const {liveStats, soulUncovered} = this;
        const stat = RNG.getItem(liveStats);
        const old = stat.current;
        stat.current -= amount;
        this.healCounter = 0;
        const {name, s, current} = stat;
        if (name === null) {
            if (current === old) {
                this.messageLog.addMessage(`The ${source.label} attacks you and you feel your soul being nibbled away, but take no damage.`);
            } else if (current > 0) {
                this.messageLog.addWarning(`The ${source.label} attacks you and you feel your soul being nibbled away for ${amount} damage.`);
            } else {
                this.messageLog.addFatal(`The ${source.label} attacks you and swallows you whole.`);
                this.die(source, item);
            }
        } else {
            this.messageLog.addMessage(`The ${source.label} attacks you`);
            if (current === old) {
                this.messageLog.addMessage(`but your ${name} take${s} no damage.`);
            } else if (current > 0) {
                this.messageLog.addMessage(`and your ${name} take${s} ${amount} damage.`);
            } else {
                this.messageLog.addMessage(`for ${amount} damage.`);
            }
        }
        if (current <= 0) {
            stat.current = 0;
            if (stat instanceof Stat) {
                this.losePart(stat, source, item);
            }
        }
        (this.statUIs[name] ?? this.soulUI).update();
        document.documentElement.classList.toggle("soul-uncovered", this.soulUncovered);
        if (!soulUncovered && this.soulUncovered) {
            this.messageLog.addWarning("The pain leaves your soul vulnerable.")
        }
    }

    die(killer: Actor, item: Item): false {
        if (!this.isDead) {
            this.visible = false;
            this.tangible = false;
            this.isDead = true;
            const {worldMap} = this;
            document.documentElement.classList.add("dead");
            after(3000).then(() => {
                document.documentElement.classList.add("buried");
                this.messageLog.readMessages();
                this.messageLog.addFatal("Your soul floats apart.");
                worldMap.visibilitySource.visibilityRadius -= 2;
                worldMap.clearFogMap(FOG_KNOWN);
                worldMap.mainViewport.redraw();
                worldMap.stopAnimation();
            });
        }
        if (killer && killer !== this) {
            killer.move(this.x - killer.x, this.y - killer.y, this.z - killer.z);
            // death will stop the event loop, so force one more redraw
            this.worldMap.mainViewport.redraw();
            // killer gets the eyes
            this.worldMap.visibilitySource = killer;
        }
        if (Creature.activePlayer === this) {
            Creature.activePlayer = null;
        }
        return false;
    }

    healDamage(amount: number, source: Actor, item: Item) {
        const isNaturalHealing = source === this && item === null;
        let stat: StatLike;
        if (isNaturalHealing) {
            if (this.durability < this.maxDurability) {
                stat = this.soul;
            } else {
                const nonFullStats = this.statList.filter(s => s.current < s.max);
                if (!nonFullStats.length) {
                    // nothing happens
                    return;
                }
                stat = RNG.getItem(nonFullStats);
            }
        } else {
            const lowHealth = Math.min(...this.statList.map(s => s.current));
            const lowStats = this.statList.filter(s => s.current === lowHealth);
            stat = RNG.getItem(lowStats);
        }
        const {current: old, max} = stat;
        if (old < max) {
            stat.current = Math.min(old + amount, max);
        }
        const {name, s, current} = stat;
        if (isNaturalHealing) {
            if (old <= 0 && current > 0) {
                this.messageLog.addMessage(`Your ${name} recover${s}.`)
            }
        } else if (old <= 0 && current > 0) {
            this.messageLog.addMessage(`Your ${name} recover${s} with ${current} health!`)
        } else if (old < current) {
            this.messageLog.addMessage(`Your ${name} recover${s} ${current - old} health.`)
        } else if (old === current) {
            this.messageLog.addMessage(`Your ${name} feel${s} great!`)
        }
        if (!this.soulUncovered && this.durability < this.maxDurability) {
            this.durability = this.maxDurability;
            this.messageLog.addMessage(`Your soul heals over, but the wound still aches.`);
        }
        this.statUIs[name].update();
        document.documentElement.classList.toggle("soul-uncovered", this.soulUncovered);
    }

    applyEffect(effect: VoidItemEffectName | NumericItemEffectName, strength: number, item: Item, source: Actor) {
        if (effect === "satiety") {
            this.satiety.current = clamp(this.satiety.current + strength, 0, this.satiety.max);
            this.satietyUI.update();
        } else {
            super.applyEffect(effect, strength, item, source);
        }
    }

    procRoundEffects() {
        if (this.satiety.current > 0) {
            this.satiety.current--;
            this.satietyUI.update();
            this.healCounter++;
            if (this.healCounter >= this.healTime) {
                this.healCounter = 0;
                this.healDamage(1, this, null);
            }
        }
        super.procRoundEffects();
    }

    procRoundEffect(effect: ItemEffectName, roundsLeft: number) {
        super.procRoundEffect(effect, roundsLeft)
    }

    attack(target: Prop) {
        const damage = super.attack(target);
        const destroyMessage = this.destroyMessages.get(target);
        this.messageLog.addMessage(`The ${target.label} takes ${damage} damage${target.durability <= 0 ? (destroyMessage ? `. ${destroyMessage}` : " and dies.") : "."}`)
        if (target instanceof Creature && target.roleName === "godFish" && target.durability <= 0) {
            this.move(target.x - this.x, target.y - this.y, target.z - this.z);
            this.messageLog.addCallout(winMessage);
            this.wonGame = true;
            this.#resolveAction = null;
        }
        return damage;
    }

    takeItem(item: Item) {
        const result = super.takeItem(item);
        if (result) {
            this.messageLog?.addMessage(`You take ${item.getDefiniteLabel()}.`)
        } else {
            this.messageLog?.addMessage(`You try to take ${item.getDefiniteLabel()} but your fins can't get a grip!`)
        }
        return result;
    }

    takeItems() {
        const result = super.takeItems();
        if (result === null) {
            this.messageLog?.addMessage("There is nothing here to take!");
        }
        return result;
    }

    dropItem(item: Item, count = 1) {
        const result = super.dropItem(item, count);
        if (Array.isArray(result)) {
            const [stack, floor] = result;
            this.messageLog.addMessage(`You drop ${stack.getIndefiniteLabel(false)} onto the pile, and now there are ${floor.stackSize}.`);
        } else if (result) {
            this.messageLog.addMessage(`You drop ${result.getIndefiniteLabel(false)}.`);
        } else {
            this.messageLog.addMessage(`You try to drop ${item.getDefiniteLabel()} but it seems to be stuck to your fins.`);
        }
        return result;
    }

    losePart(stat: Stat, source: Actor, item: Item) {
        const {name, equippedItem, equipDef, s, its} = stat;
        if (equippedItem) {
            this.messageLog.addWarning(`Your ${equipDef?.label?.toLowerCase() ?? `transformed ${stat.name}`} revert${s} to ${its} original form.`);
            stat.equippedItem = null;
        } else {
            this.messageLog.addWarning(`Your ${name} break${s}!`);
        }
    }

    receiveDestroyMessage(message: string, victim: Actor) {
        this.destroyMessages.set(victim, message);
    }

    addedToWorldMap(worldMap: WorldMap) {
        super.addedToWorldMap(worldMap);
        const {x, y, z} = this;
        this.path = new Astar3D(x, y, z, worldMap.isPassable);
        worldMap.visibilitySource ??= this;
        worldMap.setCenteredPathingBoundsTo(x, y, z, 21, 21, 11);
        Creature.activePlayer ??= this;
    }

    activateBodyPart(bodyPart: StatName) {
        const oldActivating = this.activatingBodyPart;
        if (oldActivating) {
            this.deactivateBodyPart(oldActivating);
            if (oldActivating === bodyPart) return;
        }
        const abilityCue = this.statUIs[bodyPart].ability;
        if (abilityCue) {
            abilityCue.secondary.add(...abilityCue.lowlight);
            this.statUIs[bodyPart].container.classList.add("activating");
            this.activatingBodyPart = bodyPart;
        }
    }

    deactivateBodyPart(bodyPart?: StatName) {
        bodyPart ??= this.activatingBodyPart;
        if (bodyPart && this.activatingBodyPart !== bodyPart) return;
        this.activatingBodyPart = null;
        if (bodyPart) {
            const abilityCue = this.statUIs[bodyPart].ability;
            if (abilityCue) {
                abilityCue.secondary.remove(...abilityCue.lowlight);
                this.statUIs[bodyPart].container.classList.remove("activating");
            }
        }
    }

    fireBodyPart(bodyPart: StatName, dx = 0, dy = 0, dz = 0) {
        const stat = this.stats[bodyPart];
        if (stat.equippedItem) {
            stat.equippedItem.fire(this, dx, dy, dz);
        } else {
            this.messageLog.addMessage(`You wiggle your ${bodyPart === "dorsal" ? "dorsal fin" : bodyPart} but nothing interesting happens.`);
        }
        this.deactivateBodyPart(bodyPart);
    }

    queueEat(item: Item, count=1) {
        this.queueAction(() => this.eatItem(item, count));
    }

    queueDrop(item: Item, count=1) {
        this.queueAction(() => this.dropItem(item, count));
    }

    queueMove(dx = 0, dy = 0, dz = 0) {
        if (this.inventoryOpen) {
            this.inventoryUI.moveSelection(dx, dy);
            return;
        }
        const action = this.activatingBodyPart
            ? () => this.fireBodyPart(this.activatingBodyPart, dx, dy, dz)
            : () => this.move(dx, dy, dz);
        this.queueAction(action);
    }

    queueAction(action: () => void) {
        if (!this.canAct()) {
            return;
        }
        if (this.actionQueue.length < 5) {
            this.actionQueue.push(action);
        }
        if (this.#resolveAction) {
            this.messageLog.readMessages();
            this.#resolveAction(true);
            this.#resolveAction = null;
        }
    }

    toggleInventory(force?: boolean) {
        this.inventoryUI.toggleInventory(force);
    }

    move(dx = 0, dy = 0, dz = 0) {
        if (!super.move(dx, dy, dz)) {
            return false;
        }
        const {x, y, z} = this;
        this.path.setTarget(x, y, z);
        this.worldMap?.mainViewport.centerOn(x, y, z, true);
        this.worldMap?.setCenteredPathingBoundsTo(x, y, z, 21, 21, 11);
        const items = (this.worldMap?.getSpritesAt(x, y, z) ?? []).map(s => s instanceof Item && s.visible ? s : null).filter(s => s);
        const hasUnseen = items.some(i => !i.seen);
        const discoveries = items.filter(i => i.discover());
        if (discoveries.length || hasUnseen) {
            // full report
            const firstItem = items[0].getIndefiniteLabel(true);
            const otherItems = items.slice(1).map(i => i.getIndefiniteLabel(false));
            otherItems.push(`and ${otherItems.pop()}`);
            const allItems = [firstItem, ...otherItems];
            if (items.length > 2) {
                this.messageLog.addMessage(`${allItems.join(", ")} float here.`)
            } else if (items.length === 2) {
                this.messageLog.addMessage(`${allItems.join(" ")} float here.`)
            } else if (items.length === 1) {
                this.messageLog.addMessage(`${firstItem} float${items[0].s} here.`);
            }
        } else {
            // brief report
            for (const item of items) {
                this.messageLog.addMessage(`${item.getIndefiniteLabel(true)}.`);
            }
        }
        if (discoveries.length) {
            // new discoveries
            for (const item of discoveries) {
                if (item.description) {
                    this.messageLog.addCallout(item.description);
                }
            }
        }
        return true;
    }

    digestItemStack(item: Item) {
        this.messageLog.addMessage(item.itemDef.message);
        if (item instanceof EggItem) {
            const soulItem = item.identify(this.worldMap);
            const {description, discoveryMessage = `You have discovered {indefinite}!`} = soulItem.itemDef;
            if (discoveryMessage) {
                this.messageLog.addMessage(discoveryMessage.replace("{indefinite}", soulItem.getIndefiniteLabel(false)));
            }
            this.messageLog.addCallout(description);
            item = soulItem;
            // and then let super call the soul's digest unless it's equipment
        }

        super.digestItemStack(item);

        if (item.itemDef.equippable && item instanceof SoulItem) {
            this.equipSoul(item);
        }
    }

    equipSoul(soul: SoulItem) {
        const eqDef = equipment[soul.itemName as EquipmentName];

        const availableParts = typedKeys(eqDef).filter(p => this.stats[p].current > 0);
        if (availableParts.length === 0) {
            this.messageLog.addMessage("Unfortunately, you're left no better off than you were. Your body is too weak.");
            return;
        }
        const equipTo = RNG.getItem(availableParts);
        const stat = this.stats[equipTo];
        
        stat.equipItem(soul);
        const {equipMessage} = stat.equipDef;
        if (equipMessage) {
            this.messageLog.addMessage(equipMessage);
        }
        this.statUIs[equipTo].update();

        if (!this.godSummoned && this.statList.every(s => s.current > 0 && s.equipDef)) {
            this.godSummoned = true;
            this.messageLog.addWarning(godSummonMessage);
            this.spawnNearby({role: "godFish"}, {minRadius: 5});
        }
    }

    canAct() {
        return true;
    }

    async act(time = 0) {
        if (this.isDead || this.wonGame) {
            // this will terminate the event loop
            return false;
        }
        while (!this.actionQueue.length) {
            // redraw whenever we go into a wait
            this.worldMap?.mainViewport?.redraw();
            console.log("awaiting");
            await new Promise(r => this.#resolveAction = r);
            console.log("awaited");
        }
        this.actionQueue.shift()();
        this.procRoundEffects();
        return true;
    }
}

export class InventoryUI {
    player: Player;
    dialog: HTMLDialogElement;
    itemLabel: HTMLElement;
    itemsList: HTMLElement;
    itemButtons: HTMLButtonElement[] = [];
    actionButtons: (HTMLButtonElement)[];
    itemTemplate: HTMLTemplateElement;

    get open() {
        return this.dialog.open;
    }
    set open(v) {
        this.dialog.open = v;
    }

    #selectedItem: HTMLButtonElement & { inventoryItem: Item; };
    get selectedItem() {
        return this.#selectedItem;
    }
    set selectedItem(v) {
        if (v === this.#selectedItem) return;
        this.#selectedItem?.classList.remove("selected");
        this.#selectedItem = v;
        v?.classList.add("selected");
    }

    focusButton: HTMLButtonElement;

    constructor(player: Player, dialog: string | HTMLDialogElement, itemTemplate?: string | HTMLTemplateElement) {
        this.player = player;
        this.dialog = dialogElement(dialog);
        this.itemsList = htmlElement(this.dialog.querySelector(".items-list"));
        this.itemLabel = htmlElement(this.dialog.querySelector(".item-label"));
        this.actionButtons = Array.from(this.dialog.querySelectorAll("button.action-button")).map(e => getElement(e, HTMLButtonElement));
        this.itemTemplate = templateElement(itemTemplate ?? this.dialog.querySelector(".item-template") ?? "inventoryItemTemplate")
        this.keyEventListener = this.keyEventListener.bind(this);
        this.focusListener = this.focusListener.bind(this);
        this.itemClickListener = this.itemClickListener.bind(this);
        this.actionClickListener = this.actionClickListener.bind(this);
        for (const button of this.actionButtons) {
            button.onfocus = this.focusListener;
            button.onclick = this.actionClickListener;
        }
    }

    keyEventListener(event: KeyboardEvent) {
        event.stopPropagation();
    }

    focusListener(event: FocusEvent) {
        const {target} = event as FocusEvent & { target: HTMLButtonElement & { inventoryItem?: Item; }; };
        const item = target.inventoryItem;
        if (item) {
            this.itemLabel.textContent = item?.getIndefiniteLabel() ?? "Unknown";
            // @ts-ignore
            this.selectedItem = target;
        }
        this.focusButton = target;
    }

    itemClickListener(event: Event) {
        this.actionButtons[0].focus();
    }

    actionClickListener(event: FocusEvent) {
        const item = this.selectedItem?.inventoryItem;
        if (!item) return;
        const {action} = htmlElement(event.target).dataset;
        if (action === "eat" || action === "drop") {
            this.performAction(action);
        }
    }

    performAction(action: "eat" | "drop") {
        const item = this.selectedItem?.inventoryItem;
        if (!this.open || !item) return false;
        
        if (action === "eat") {
            this.player.queueEat(item);
        } else if (action === "drop") {
            this.player.queueDrop(item);
        }
        this.dialog.close(action);
        return true;
    }

    updateItems() {
        const itemMap = new Map<Item, Element>();
        for (const element of this.itemsList.children) {
            if ("inventoryItem" in element && element.inventoryItem instanceof Item) {
                itemMap.set(element.inventoryItem, element);
            }
        }
        this.itemsList.replaceChildren(...this.player.validInventory.map((item, index) => {
            const element = itemMap.get(item) ?? this.createItemElement(item);
            const button = element.querySelector("button");
            if (button) {
                button.autofocus = index === 0;
            }
            const stackLabel = button.querySelector("label.stack-size");
            if (stackLabel) {
                stackLabel.textContent = item.stackSize === 1 ? "" : String(item.stackSize);
            }
            return element;
        }));

        this.itemButtons = Array.from(this.dialog.querySelectorAll("button.item-button")).map(e => getElement(e, HTMLButtonElement));
    }

    createItemElement(item: Item) {
        const element = cloneTemplate(this.itemTemplate, true).firstElementChild as Element & {inventoryItem?: Item, rotDisplay?: Display};
        element.inventoryItem = item;
        const button = element.querySelector("button") as HTMLButtonElement & {inventoryItem?: Item};
        button.inventoryItem = item;
        button.classList.add("item-button");
        button.onfocus = this.focusListener;
        button.onclick = this.itemClickListener;
        const displayContainer = element.querySelector(".display-container");
        if (displayContainer) {
            element.rotDisplay = null;
            const {char} = Tileset.light.layerFrames[item.spriteTile][item.spriteFrame];
            Tileset.light.getDisplayOptions().then(opts => {
                const display = new Display({...opts, width: 1, height: 1});
                displayContainer.append(display.getContainer());
                display.draw(0, 0, char, null, null);
                element.rotDisplay = display;
            });
        }
        return element;
    }

    toggleInventory(force?: boolean) {
        if (this.dialog.open === force) return;

        if (this.dialog.open) {
            this.dialog.close();
        } else {
            this.updateItems();
            this.dialog.showModal();
        }
    }

    moveSelection(dx=0, dy=0) {
        if (!dx && !dy) {
            this.focusButton?.click()
            return;
        }
        const itemIndex = this.itemButtons.indexOf(this.focusButton);
        const actionIndex = this.actionButtons.indexOf(this.focusButton);
        if (dx !== 0) {
            if (itemIndex >= 0) {
                this.itemButtons.at((itemIndex + dx) % this.itemButtons.length).focus();
            } else if (actionIndex >= 0) {
                this.actionButtons.at((actionIndex + dx) % this.actionButtons.length).focus();
            }
        } else if (dy !== 0) {
            if (itemIndex >= 0) {
                this.actionButtons[0].focus();
            } else if (actionIndex >= 0) {
                (this.selectedItem ?? this.itemButtons[0])?.focus();
            }
        }
    }
}

Object.assign(self, {Player});