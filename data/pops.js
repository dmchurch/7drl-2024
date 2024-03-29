/**
 * @typedef PopDefinitionCommon
 * @prop {number|[number,number]} [count=1] How many times should this get generated?
 *                                          Pair = inclusive range [min, max]
 * @prop {number|number[]}     [chance=100] What is the chance this gets generated?
 *                                          Multiple numbers = chance for multiple instances, times count
 * @prop {number|[number,number]}    [size] How large should this group be, in tiles?
 *                                          Pair = inclusive range [min, max]
 * @prop {PopDefinition}        [inventory] What items should get distributed throughout this pop?
 * 
 * @typedef PickOnePopDefinition
 * @prop {"pickone"} [type]
 * @prop {(PopDefinition & {weight: number})[]} pickone
 * 
 * @typedef PickEachPopDefinition
 * @prop {"pickeach"} [type]
 * @prop {PopDefinition[]} pickeach
 * 
 * @typedef ItemPopDefinition @prop {"item"} [type] @prop {ItemName} item @prop {Record<string, any>} [overrides]
 * @typedef RolePopDefinition @prop {"role"} [type] @prop {RoleName} role @prop {Record<string, any>} [overrides]
 * @typedef PopPopDefinition  @prop {"pop"}  [type] @prop {PopName} pop
 * 
 * @typedef {(PopDefinitionCommon & PickOnePopDefinition)
 *         | (PopDefinitionCommon & PickEachPopDefinition)
 *         | (PopDefinitionCommon & ItemPopDefinition)
 *         | (PopDefinitionCommon & RolePopDefinition)
 *         | (PopDefinitionCommon & PopPopDefinition)} PopDefinition
 */

/** @satisfies {PopDefinition["type"][]} */
const popTypes = /** @type {const} */([
    "pickone",
    "pickeach",
    "item",
    "role",
    "pop",
])

const allPopNames = /** @type {const} */([
    "world",
    "decor",
    "easyPlace",
    "mediumPlace",
    "hardPlace",
    "sparseArea",
    "fishSchool",
    "crabGang",
    "horribleZone",
    "junkyard",
    "commonSoul",
    "rareSoul",
]);

/** @satisfies {Record<PopName, PopDefinition>} */
export const popDefinitions = {
    // Each of the easy, medium, and hard places is currently occupies 30×30×17 = 16,337 coordinates,
    // and current map generator is yielding around 5,000 ~ 6,500 open spaces, of which
    // around 900 ~ 1,500 are the tile directly above a ground tile. The tweaks I'll be making to the generator
    // will almost certainly increase the number of ground tiles, though, so we can probably assume around 1,200 ~ 1,500
    world: {
        pickeach: [
            { pop: "easyPlace" },
            { pop: "mediumPlace" },
            { pop: "hardPlace" },
        ]
    },

    decor: {
        pickeach: [
            { pop: "junkyard", count: [2, 4]},
            // junkyards generally allocate 100 ground tiles apiece, so there may be anywhere from 800 ~ 1,300 ground tiles left over
            // junkyards have an average fill of around 30-60%, so we should stay under, idk, around 250 or so on average?

            // the below popdefs aren't associated with a size, so they each only "reserve" their own tile.
            { role: "pottery", count: [5, 10]},
            { role: "litter", count: [10, 20]},
            { role: "ground", count: [30, 50]},
            { role: "weeds", count: [20, 40]},
        ]
    },

    easyPlace: {
        pickeach: [
            { pop: "decor" },
            { pop: "sparseArea", count: [3, 10]},
            { pop: "fishSchool", count: [3, 6]},
            { pop: "crabGang", chance: [50, 10, 10, 5, 5, 5]},
            { pop: "horribleZone", chance: [1]}
        ]
    },
    mediumPlace: {
        pickeach: [
            { pop: "decor" },
            { pop: "sparseArea", count: [3, 10]},
            { pop: "fishSchool", count: [5, 15]},
            { pop: "crabGang", count: [3, 10]},
            { pop: "horribleZone", chance: [50, 5, 1, 1]}
        ]
    },
    hardPlace: {
        pickeach: [
            { pop: "decor" },
            { pop: "sparseArea", count: [3, 10]},
            { pop: "fishSchool", count: [1, 5]},
            { pop: "crabGang", count: [3, 10]},
            { pop: "horribleZone", count: [1, 5]}
        ]
    },
    horribleZone: {
        pickeach: [
            { role: "toothFish", chance: [100, 25, 5] },
            { role: "eel", count: [4, 12]}
        ]
    },
    crabGang: {
        role: "crab",
        count: [3, 10],
    },
    fishSchool: {
        pickeach: [
            { role: "fish", count: [10, 25]},
            { role: "bigFish", chance: [5, 1]}
        ]
    },
    sparseArea: {
        pickeach: [
            { role: "crab", chance: [50, 10, 10] },
            { role: "eel", chance: 10 },
            { role: "bigFish", chance: 5},
            { role: "fish", count: [1, 6] },
        ],
    
    },
    junkyard: {
        size: 100, // since everything in this popdef is grounded, this means 100 ground tiles
        pickeach: [
            { role: "pottery", count: [2, 5] },
            { role: "litter", count: [10, 20] },
            { role: "ground", count: [20, 30] },
            { role: "weeds", count: [3, 7] },
        ],
        // junkyards will pop anywhere from 35 ~ 62 props, which corresponds directly to % fill.
        // remembering that 50% is a checkerboard, these should look nicely crowded!
    },
    commonSoul: {
        pickone: [
            { item: "sustenanceSoul", weight: 50 },
            { item: "deliciousSoul", weight: 3 },
            { item: "disgustingSoul", weight: 5 },
            { item: "mendingSoul", weight: 2},
            { pop: "rareSoul", weight: 1}
        ],
    },
    rareSoul: {
        pickone: [
            { item: "geodeSoul", weight: 10},
            { item: "cavitationSoul", weight: 10},
            { item: "slimeSoul", weight: 10},
            { item: "venomSoul", weight: 10},
            { item: "dreadSoul", weight: 10},
            { item: "spineSoul", weight: 10},
            { item: "mendingSoul", weight: 20}
        ],
    },
};

/** @typedef {typeof allPopNames[number]} PopName */

/** @param {PopDefinition} popDef */
export function fixPopDefinition(popDef) {
    for (const type of popTypes) {
        if (type in popDef) {
            popDef.type = type;
            break;
        }
    }
    const {type} = popDef;
    const subDefs = type === "pickeach" ? popDef.pickeach
                  : type === "pickone" ? popDef.pickone
                  : null;
    if (subDefs) {
        subDefs.forEach(fixPopDefinition);
    }
    return /** @type {Required<PopDefinition>} */(popDef);
}

import { mapEntries } from "~src/helpers.js";
/** @type {Record<PopName, Required<PopDefinition>>} */
export const pops = mapEntries(popDefinitions, fixPopDefinition);

Object.assign(self, {pops, fixPopDefinition});