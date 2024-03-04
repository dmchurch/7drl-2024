import { WorldMap } from "./worldmap.js";

export class WallRule {
    /** @readonly */
    static SAME = -1;
    /** @readonly */
    static DONT_CARE = -2;
    /** @readonly */
    static OTHER = -3;

    /** @param {TemplateStringsArray} strings */
    static new(strings, ...args) {
        const rawLast = strings.raw.at(-1);
        const newlineIndex = rawLast.indexOf('\n');
        const raw = [...strings.raw.slice(0, strings.raw.length - 1), rawLast.slice(0, newlineIndex)];
        const frameSymbolString = String.raw({raw}, ...args);
        if (frameSymbolString.includes('\n')) {
            throw new Error(`Invalid WallRule specification, all newlines must come after all interpolations`)
        }
        const frameSymbols = frameSymbolString.replace(/\s/g, "");
        if (!frameSymbols.length || newlineIndex < 0) {
            throw new Error(`Invalid WallRule specification, expects frame symbols followed by a newline`);
        }
        if (/[.#]/.test(frameSymbols)) {
            throw new Error(`Invalid WallRule specification, cannot use . or # as a frame symbol`);
        }
        /** @type {RegExpExecArray} */
        let matches;
        if (matches = /(.).*\1/.exec(frameSymbols)) {
            throw new Error(`Invalid WallRule specification, duplicated frame symbol ${matches[1]} in ${frameSymbols}`);
        }

        const template = rawLast.slice(newlineIndex + 1);
        const templateLines = template.split("\n");
        if (templateLines.length < 1) {
            throw new Error("Invalid WallRule specification, must have at least two lines in template");
        }
        const mapValues = `. #${frameSymbols}`;

        return new this(frameSymbols.length, templateLines.map(l => l.split("").map(char => {
            const index = mapValues.indexOf(char);
            if (index < 0) {
                throw new Error(`Invalid WallRule specification, character ${char} not found in frame symbols ${frameSymbols}`);
            }
            return index - 3;
        })), frameSymbols.split(""));
    }

    /**
     * Bit ordering for wall-rule tests is clockwise from north of the cardinal directions,
     * then clockwise from northwest of the diagonals, and then finally the center bit, so:
     * 
     *     405
     *     381
     *     726
     * 
     * thus, the two diagonals adjacent to cardinal bit `c` are `c + 4` and `(c + 1) % 4 + 4`,
     * and the two cardinals adjacent to diagonal `d` are `d - 4` and `(d - 1) % 4`
     * 
     * @readonly @satisfies {[dx: number, dy: number][]}
     */
    static bitDirections = /** @type {const} */([
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
        [0, 0],
    ]);

    frameCount;
    framesTemplate;
    frameNames;

    framesMap = new Int8Array(256);


    /** @param {number} frameCount @param {number[][]} framesTemplate @param {string[]} frameNames */
    constructor(frameCount, framesTemplate, frameNames) {
        this.frameCount = frameCount;
        this.framesTemplate = framesTemplate;
        this.frameNames = frameNames;

        this.calculateFrames(framesTemplate);
    }

    /** @param {number[][]} template  */
    calculateFrames(template) {
        const {bitDirections, SAME, OTHER, DONT_CARE} = WallRule;
        /** @type {Record<number, string>} */
        const definedAt = {};
        for (const [y, templateRow] of template.entries()) {
            for (const [x, cell] of templateRow.entries()) {
                if (cell < 0) continue;
                let totals = [0];
                for (let bit = 0; bit < 8; bit++) {
                    const [dx, dy] = bitDirections[bit];
                    let other = template[y + dy]?.[x + dx] ?? OTHER;
                    if (bit > 3) {
                        // diagonals only count if both adjacent orthogonals are set
                        const orthos = (bit >> 2) | ((bit - 1) & 3);
                        if (!totals.every(v => ((v & orthos) === orthos))) {
                            other = DONT_CARE;
                        }
                    }
                    if (other >= SAME) {
                        totals.forEach((v,i) => totals[i] = v | (1 << bit));
                    } else if (other === DONT_CARE) {
                        totals = totals.flatMap(v => [v, v | (1 << bit)]);
                    }
                }
                const location = `${y+1},${x+1}`
                for (const total of totals) {
                    if (total in definedAt && this.framesMap[total] !== cell) {
                        throw new Error(`Error in WallRule: bit pattern ${total} (${total.toString(2)}), originally defined at ${definedAt[total]} as ${this.framesMap[total]} (${this.frameNames[this.framesMap[total]]}), redefined at ${location} as ${cell} (${this.frameNames[cell]})`);
                    }
                    definedAt[total] = location;
                    this.framesMap[total] = cell;
                }
            }
        }
    }

    /** @param {WorldMap} worldMap  */
    getFrame(worldMap, x=0, y=0, z=0, base=worldMap.getBase(x, y, z)) {
        let total = 0;
        const {bitDirections} = WallRule;
        for (let bit = 0; bit < 8; bit++) {
            const [dx, dy] = bitDirections[bit];
            if (worldMap.isSameBaseAs(x + dx, y + dy, z, base)) {
                total |= 1 << bit;
            }
        }
        return this.framesMap[total];
    }
}
