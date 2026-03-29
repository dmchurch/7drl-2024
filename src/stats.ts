import { cloneTemplate, getElement, htmlElement, meterElement, outputElement } from "./helpers.js";
import { equipment } from "~data/items.js";
import type { Item } from "./props.js";
import type { Player } from "./player.js";
import { KeyboardCueElement } from "./uicomponents.js";

export const allStats = {
    "head": {
        label: "Head",
        defaultMax: 5,
    },
    "dorsal": {
        label: "Dorsal",
        defaultMax: 5,
    },
    "belly": {
        label: "Belly",
        defaultMax: 5,
    },
    "fins": {
        label: "Fins",
        defaultMax: 5,
    },
    "tail": {
        label: "Tail",
        defaultMax: 5,
    },
} satisfies Record<string, StatDef>;

export interface StatDef {
    label: string;
    defaultMax: number;
}
export type StatName = keyof typeof allStats;

export function isStatName(name: string): name is StatName {
    return Object.hasOwn(allStats, name);
}

export class Stat {
    name: StatName;

    s: "s" | "";

    its: "its" | "their";

    #current = 10;
    #max = 10;

    get current() {
        return this.equippedItem?.durability ?? this.#current;
    }
    set current(v) {
        if (this.equippedItem) this.equippedItem.durability = v;
        else this.#current = v;
    }
    get max() {
        return this.equippedItem?.durability ?? this.#max;
    }
    set max(v) {
        if (this.equippedItem) this.equippedItem.maxDurability = v;
        else this.#max = v;
    }

    equippedItem: Item;

    get equipDef(): EquipmentDefinition | null {
        return equipment[this.equippedItem?.itemName as EquipmentName]?.[this.name] || null;
    }

    constructor(nameArgument: StatName, options?: Overrides<Stat>);
    constructor(nameArgument: StatName, options: Overrides<Stat>, {name = nameArgument, max = allStats[name].defaultMax, current = max}: Overrides<Stat> = options ?? {}) {
        this.name = name;
        this.current = current;
        this.max = max;
        this.s = name === "fins" ? "" : "s";
        this.its = name === "fins" ? "their" : "its";
    }

    equipItem(item: Item) {
        if (this.equippedItem) {
            item.stackSize += this.equippedItem.durability;
            this.equippedItem.releaseFromOwner();
        }
        item.releaseFromOwner();
        item.durability = item.maxDurability = item.stackSize;
        this.equippedItem = item;
    }
}

abstract class MeterUI {
    stat;

    container: HTMLElement;
    title: HTMLElement;
    meter: HTMLMeterElement;
    ability?: KeyboardCueElement;

    abstract get label(): string;

    constructor(stat: StatLike, container: string | Element, template: string) {
        this.stat = stat;
        this.container = htmlElement(container);

        if (!this.container.querySelector("dt")) {
            this.container.appendChild(cloneTemplate(template));
        }
        this.title = this.container.querySelector(".title");
        this.meter = meterElement(this.container.querySelector(".hpmeter"));
        this.ability = getElement(this.container.querySelector("keyboard-cue"), KeyboardCueElement, false, false);
    }

    update() {
        const {current, max, equipDef} = this.stat;
        this.title.textContent = equipDef?.label ?? this.label;
        this.meter.max = max;
        this.meter.optimum = max;
        this.meter.low = max / 4 + 0.01;
        this.meter.high = max * 3 / 4 - 0.01;
        this.meter.value = current;
        this.container.classList.toggle("broken", current <= 0);
        this.container.classList.toggle("full", current === max);
    }
}

export class StatUI extends MeterUI {
    curOutput;
    maxOutput;

    get label() {
        return allStats[this.stat.name].label;
    }

    constructor(stat: StatLike, container: string | Element, template = "bodypartTemplate") {
        super(stat, container, template);
        this.curOutput = outputElement(this.container.querySelector(".curhp"));
        this.maxOutput = outputElement(this.container.querySelector(".maxhp"));
        this.update();
    }

    update() {
        super.update();
        const {current, max, equipDef} = this.stat;
        this.curOutput.value = String(current);
        this.maxOutput.value = String(max);
    }
}

type DurableObject = { durability: number; maxDurability: number; };

export class SoulUI extends StatUI {
    get label() {
        return "Soul";
    }

    constructor(prop: DurableObject, container: string | Element, template = "bodypartTemplate") {
        super({
            name: null,
            s: null,
            equipDef: null,
            get current() { return prop.durability; },
            get max() { return prop.maxDurability; },
        }, container, template);
   }
}

export class SatietyUI extends MeterUI {
    stateOutput;

    get label() {
        return "Satiety";
    }

    constructor(player: Player, container: string | Element, template = "satietyTemplate") {
        super(player.satiety, container, template);
        this.stateOutput = outputElement(this.container.querySelector(".state"));
        this.update();
    }

    update() {
        super.update();
    }
}