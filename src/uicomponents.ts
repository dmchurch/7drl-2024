import { animationFrame as nextAnimationFrame, fromTypedEntries, getElement, invertMap, mapToEntries, mapToValues, svgElement, tuple, typedEntries, after } from "./helpers.js";

export const Rendered = {
    /**
     * Creates a {@link DocumentFragment} representing the given interpolated HTML string. If the initial backtick is followed
     * immediately by a newline, all initial whitespace is ignored (rather than being rendered as a text node). DOM properties
     * of HTML elements can be set by having an interpolation immediately follow a property name with an equals sign. Thus,
     * 
     * ```
     * Rendered.html`<input value="${5}">`
     * ```
     * 
     * will set the HTML attribute "value" to "5", but
     * 
     * ```
     * Rendered.html`<input value=${5}>`
     * ```
     * 
     * will set the DOM property `.value` to 5. This is especially useful for event handler properties.
     * 
     * If the string contains only a single element and you would like to have the {@link Element} rather than a {@link DocumentFragment}, just access `.firstElementChild`.
     */
    html(strings, ...exprs) {
        const propAssignmentRegex = /(?<=\s+)(\w+)=$/;
        const rawStrings = [...strings.raw];
        if (strings.raw[0][0] === '\n' || strings.raw[0][0] === '\r') { // if this starts with an explicit linebreak, strip early whitespace
            rawStrings[0] = rawStrings[0].trimStart();
        }
        const propertiesToSet: { name: string; value: any; }[] = [];
        for (const [i, string] of rawStrings.entries()) {
            const matches = propAssignmentRegex.exec(string);
            if (matches) {
                const propIdx = propertiesToSet.length;
                propertiesToSet.push({name: matches[1], value: exprs[i]});
                rawStrings[i] = string.replace(propAssignmentRegex, "");
                exprs[i] = `data-rendered-prop-to-set data-rendered-prop-idx-${propIdx}="${propIdx}"`;
            }
        }
        let htmlString = String.raw({raw: rawStrings}, ...exprs);
        if (htmlString[0] === '\n' || htmlString[0] === '\r') { // if this starts with a linebreak, strip early whitespace
            htmlString = htmlString.trimStart();
        }
        const template = document.createElement("template");
        template.innerHTML = htmlString;

        for (const elem of template.content.querySelectorAll("[data-rendered-prop-to-set]")) {
            elem.removeAttribute("data-rendered-prop-to-set");
            for (const attr of Array.from(elem.attributes)) {
                if (attr.name.startsWith("data-rendered-prop-idx-")) {
                    const setProp = propertiesToSet[parseInt(attr.value)];
                    elem.removeAttributeNode(attr);
                    if (setProp) {
                        (elem as any)[setProp.name] = setProp.value;
                    }
                }
            }
        }
        
        return template.content;
    },
    css(strings, ...exprs) {
        const cssString = String.raw(strings, ...exprs);
        const stylesheet = new CSSStyleSheet();
        stylesheet.replaceSync(cssString);
        return stylesheet;
    },
} satisfies Record<string, (strings: TemplateStringsArray, ...exprs: any[]) => any>;

export class BaseComponent extends HTMLElement {
    static tagName = "";

    static stylesheets: CSSStyleSheet[] = [];

    static template: DocumentFragment | false;

    static cloneTemplate() {
        this.template ??= this.makeTemplate();
        return this.template ? this.template.cloneNode(true) as DocumentFragment : undefined;
    }

    static makeTemplate(): DocumentFragment | null {
        this.stylesheets = [];
        return null;
    }

    static defineElement() {
        customElements.define(this.tagName, this);
        console.log(`Defined ${this.tagName} as ${this.name}`);
    }

    static get observedAttributes(): string[] {
        return [];
    }

    constructor(shadowRootInit: ShadowRootInit = {mode: "open"}) {
        super();
        const shadowContent = new.target.cloneTemplate();
        const shadow = this.attachShadow(shadowRootInit);
        shadow.append(shadowContent);
        shadow.adoptedStyleSheets.push(...new.target.stylesheets);
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    }
}

export type KeyboardCueName = (typeof KeyboardCueElement.allKeys)[number];

export class KeyboardCueElement extends BaseComponent {
    static tagName = "keyboard-cue";
    static defaultSrc = "img/keyboard.svg";

    // note that the keynames here are based on the US-QWERTY layout, but they only represent the position of the key!
    static readonly allKeys = [
        // primary 77 keys
        "esc", "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12", "prntscrn", "scrlock", "pause",
        "grave", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "dash", "equals", "bksp",
        "tab", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "l-bracket", "r-bracket", "backslash",
        "capslock", "a", "s", "d", "f", "g", "h", "j", "k", "l", "semicolon", "quote", "return",
        "l-shift", "z", "x", "c", "v", "b", "n", "m", "comma", "period", "slash", "r-shift",
        "l-control", "l-meta", "l-alt", "space", "r-alt", "r-meta", "contextmenu", "r-control",
        // 6-cluster
        "ins", "home", "pgup",
        "del", "end", "pgdn",
        // cursor keys
        "up", "left", "down", "right",
        // keypad
        "numlock", "divide", "multiply", "subtract",
        "kp7", "kp8", "kp9", "add",
        "kp4", "kp5", "kp6",
        "kp1", "kp2", "kp3", "kpenter",
        "kp0", "decimal",
    ] as const satisfies string[];

    static readonly keysToDOMCodes = {
        esc: "Escape", f1: "F1", f2: "F2", f3: "F3", f4: "F4", f5: "F5", f6: "F6", f7: "F7", f8: "F8", f9: "F9", f10: "F10", f11: "F11", f12: "F12", prntscrn: "PrintScreen", scrlock: "ScrollLock", pause: "Pause",
        grave: "Backquote", "1": "Digit1", "2": "Digit2", "3": "Digit3", "4": "Digit4", "5": "Digit5", "6": "Digit6", "7": "Digit7", "8": "Digit8", "9": "Digit9", "0": "Digit0", dash: "Minus", equals: "Equal", bksp: "Backspace",
        tab: "Tab", q: "KeyQ", w: "KeyW", e: "KeyE", r: "KeyR", t: "KeyT", y: "KeyY", u: "KeyU", i: "KeyI", o: "KeyO", p: "KeyP", "l-bracket": "BracketLeft", "r-bracket": "BracketRight", backslash: "Backslash",
        capslock: "CapsLock", a: "KeyA", s: "KeyS", d: "KeyD", f: "KeyF", g: "KeyG", h: "KeyH", j: "KeyJ", k: "KeyK", l: "KeyL", semicolon: "Semicolon", quote: "Quote", return: "Enter",
        "l-shift": "ShiftLeft", z: "KeyZ", x: "KeyX", c: "KeyC", v: "KeyV", b: "KeyB", n: "KeyN", m: "KeyM", comma: "Comma", period: "Period", slash: "Slash", "r-shift": "ShiftRight",
        "l-control": "ControlLeft", "l-meta": "MetaLeft", "l-alt": "AltLeft", space: "Space", "r-alt": "AltRight", "r-meta": "MetaRight", contextmenu: "ContextMenu", "r-control": "ControlRight",

        // 6-cluster
        ins: "Insert", home: "Home", pgup: "PageUp", del: "Delete", end: "End", pgdn: "PageDown",

        // cursor keys
        up: "ArrowUp", left: "ArrowLeft", down: "ArrowDown", right: "ArrowRight",

        // keypad
        numlock: "NumLock", divide: "NumpadDivide", multiply: "NumpadMultiply", subtract: "NumpadSubtract", kp7: "Numpad7", kp8: "Numpad8", kp9: "Numpad9", add: "NumpadAdd", kp4: "Numpad4", kp5: "Numpad5", kp6: "Numpad6", kp1: "Numpad1", kp2: "Numpad2", kp3: "Numpad3", kpenter: "NumpadEnter", kp0: "Numpad0", decimal: "NumpadDecimal",
    } as const satisfies Record<KeyboardCueName, string>

    static views: Record<string, {keys: KeyboardCueName[], viewBox: [number, number, number, number]}> = {
        leftSide: {
            keys: [
                "grave", "1", "2", "3", "4", "5", "6", "7",
                "tab", "q", "w", "e", "r", "t", "y", "u",
                "capslock", "a", "s", "d", "f", "g", "h", "j",
                "l-shift", "z", "x", "c", "v", "b", "n", "m",
                "l-control", "l-meta", "l-alt", "space",
            ],
            viewBox: [5, 101, 380, 202],
        },
        leftSpace: {
            keys: [
                "capslock", "a", "s", "d", "f", "g", "h", "j", "k", "l", "semicolon", "quote", "return",
                "l-shift", "z", "x", "c", "v", "b", "n", "m", "comma", "period", "slash", "r-shift",
                "l-control", "l-meta", "l-alt", "space", "r-alt", "r-meta", "contextmenu", "r-control",
            ],
            viewBox: [93, 216, 294, 129],
        },
        abilities: {
            keys: [
                "3", "4", "5", "6", "7",
                "e", "r", "t", "y", "u",
                "d", "f", "g", "h", "j",
                "c", "v", "b", "n", "m",
                "space",
            ],
            viewBox: [242, 121, 108, 175],
        },
        spaceEnvirons: {
            keys: [
                "capslock", "a", "s", "d", "f", "g", "h", "j", "k", "l", "semicolon", "quote", "return",
                "l-shift", "z", "x", "c", "v", "b", "n", "m", "comma", "period", "slash", "r-shift",
                "l-control", "l-meta", "l-alt", "space", "r-alt", "r-meta", "contextmenu", "r-control",
            ],
            viewBox: [93, 216, 612, 129],
        },
        rightSpace: {
            keys: [
                "capslock", "a", "s", "d", "f", "g", "h", "j", "k", "l", "semicolon", "quote", "return",
                "l-shift", "z", "x", "c", "v", "b", "n", "m", "comma", "period", "slash", "r-shift",
                "l-control", "l-meta", "l-alt", "space", "r-alt", "r-meta", "contextmenu", "r-control",
            ],
            viewBox: [390, 216, 294, 129],
        },
        vimKeys: {
            keys: [
                "6", "7", "8", "9", "0", "dash", "equals", "bksp",
                "t", "y", "u", "i", "o", "p", "l-bracket", "r-bracket", "backslash",
                "g", "h", "j", "k", "l", "semicolon", "quote", "return",
                "b", "n", "m", "comma", "period", "slash", "r-shift",
            ],
            viewBox: [344, 127, 269, 162],
        },
        shortBase: {
            keys: [
                "grave", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "dash", "equals", "bksp",
                "tab", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", "l-bracket", "r-bracket", "backslash",
                "capslock", "a", "s", "d", "f", "g", "h", "j", "k", "l", "semicolon", "quote", "return",
                "l-shift", "z", "x", "c", "v", "b", "n", "m", "comma", "period", "slash", "r-shift",
            ],
            viewBox: [5, 72, 811, 219],
        },
        keypad: {
            keys: [
                "numlock", "divide", "multiply", "subtract",
                "kp7", "kp8", "kp9", "add",
                "kp4", "kp5", "kp6",
                "kp1", "kp2", "kp3", "kpenter",
                "kp0", "decimal",
            ],
            viewBox: [995, 68, 230, 281],
        },
        extraKeys: {
            keys: [
                "ins", "home", "pgup", "del", "end", "pgdn",
                "up", "left", "down", "right",

                "numlock", "divide", "multiply", "subtract",
                "kp7", "kp8", "kp9", "add",
                "kp4", "kp5", "kp6",
                "kp1", "kp2", "kp3", "kpenter",
                "kp0", "decimal",
            ],
            viewBox: [826, 68, 397, 275],
        },
        full: {
            keys: this.allKeys,
            viewBox: [0, 0, 1226, 349]
        }
    };

    static keyRectsPerSrc: Record<string, Promise<Record<KeyboardCueName, SVGRect>>> = {};

    static get observedAttributes(): string[] {
        return ["keys", "highlight", "lowlight", "secondary", "tertiary", "view-box", "view", "src"];
    }

    static makeTemplate() {
        super.makeTemplate();
        return Rendered.html`<svg viewBox="0 0 1226 349" part="svg"></svg>`;
    }

    get view() {
        return this.getAttribute("view");
    }
    set view(v) {
        if (v == null) {
            this.removeAttribute("view");
        } else {
            this.setAttribute("view", v);
        }
    }

    get viewBox() {
        const vbProp = this.getAttribute("view-box");
        return vbProp?.split(" ").map(Number) ?? KeyboardCueElement.views[this.view]?.viewBox ?? [0, 0, 1226, 349];
    }
    set viewBox(v) {
        if (v) {
            this.setAttribute("view-box", v.join(" "));
        } else {
            this.removeAttribute("view-box");
        }
    }

    #keys: KeyTokenList;
    get keys() {
        return this.#keys ??= new KeyTokenList(this, "keys", KeyboardCueElement.views[this.view]?.keys);
    }

    #highlight: KeyTokenList;
    get highlight() {
        return this.#highlight ??= new KeyTokenList(this, "highlight");
    }

    #lowlight: KeyTokenList;
    get lowlight() {
        return this.#lowlight ??= new KeyTokenList(this, "lowlight");
    }

    #secondary: KeyTokenList;
    get secondary() {
        return this.#secondary ??= new KeyTokenList(this, "secondary");
    }

    #tertiary: KeyTokenList;
    get tertiary() {
        return this.#tertiary ??= new KeyTokenList(this, "tertiary");
    }

    get src() {
        return this.getAttribute("src") ?? KeyboardCueElement.defaultSrc;
    }
    set src(v) {
        if (!v || v === KeyboardCueElement.defaultSrc) {
            this.removeAttribute("src");
        } else {
            this.setAttribute("src", "v");
        }
    }

    svg: SVGSVGElement = this.shadowRoot.querySelector("svg");

    keyContainer: SVGElement = this.svg;

    keyRects: Readonly<Record<KeyboardCueName, SVGRect>> = (this.updateKeyRects(), null);

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === "view-box" || name === "view") {
            this.shadowRoot.querySelector("svg").setAttribute("viewBox", this.viewBox.join(" "));
        }
        if (["keys", "highlight", "lowlight", "secondary", "tertiary", "view", "src"].includes(name)) {
            this.updateKeys();
        }
        if (name === "src" && this.src) {
            this.updateKeyRects();
        }
    }

    updateKeys() {
        const {keys, highlight, lowlight, secondary, tertiary, keyContainer} = this;
        const existingKeys: Record<string, SVGUseElement> = Object.fromEntries(
            Array.from(keyContainer.children)
                 .filter((e): e is SVGUseElement => e instanceof SVGUseElement && e.hasAttribute("data-key"))
                 .map(e => [e.getAttribute("data-key"), e]));

        keyContainer.replaceChildren(...keys.map(k => existingKeys[k] ??= this.createKeyElement(k)));
        for (const key of keys) {
            existingKeys[key].part.toggle("highlight", highlight.contains(key));
            existingKeys[key].part.toggle("lowlight", lowlight.contains(key));
            existingKeys[key].part.toggle("secondary", secondary.contains(key));
            existingKeys[key].part.toggle("tertiary", tertiary.contains(key));
        }
    }

    async updateKeyRects() {
        KeyboardCueElement.keyRectsPerSrc[this.src] ??= this.fetchKeyRects(this.src);
        try {
            this.keyRects = await KeyboardCueElement.keyRectsPerSrc[this.src];
        } catch (e) {
            KeyboardCueElement.keyRectsPerSrc[this.src] = null;
            throw e;
        }
        return this.keyRects;
    }

    async fetchKeyRects(src = KeyboardCueElement.defaultSrc) {
        const response = await fetch(src);
        const text = await response.text();

        const div = Rendered.html`
            <div style="position:absolute;visibility:hidden;" innerHTML=${text}></div>`.firstElementChild;

        document.body.append(div);
        
        try {
            const svg = getElement(div.firstElementChild, SVGSVGElement);

            return mapToValues(
                KeyboardCueElement.allKeys,
                k => (getElement(svg.getElementById(`k-${k}`), SVGPathElement)).getBBox());
        } finally  {
            div.remove();
        }
    }

    createKeyElement(key: string): SVGUseElement {
        const element = Rendered.html`
        <svg>
            <use href="${this.src}#k-${key}" part="key k-${key}"></use>
        </svg>`.firstElementChild.firstElementChild;

        if (!(element instanceof SVGUseElement)) {
            throw new Error("bad <use> element?");
        }

        return element;
    }
}

export class MessageLogElement extends BaseComponent {
    static tagName = "message-log";

    static get observedAttributes() {
        return ["limit"];
    }

    static makeTemplate() {
        super.makeTemplate();
        return Rendered.html`<slot></slot>`;
    }

    messages: HTMLLIElement[] = []

    unreadMessage: HTMLLIElement;

    #limit = (this.style.setProperty("--log-limit", "25"), 25);
    get limit() {
        return this.#limit;
    }
    set limit(v) {
        if (v !== this.#limit) {
            this.#limit = v;
            if (parseInt(this.getAttribute("limit")) !== v) {
                this.setAttribute("limit", String(v));
            }
            this.style.setProperty("--log-limit", String(v))
        }
    }

    #startIndex = (this.style.setProperty("--log-start-index", "0"), 0);
    get startIndex() { return this.#startIndex; }
    set startIndex(v) {
        if (v !== this.#startIndex) {
            this.#startIndex = v;
            this.style.setProperty("--log-start-index", String(v));
        }
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === "limit") {
            const newLimit = parseInt(newValue);
            if (Number.isSafeInteger(newLimit))
            this.#limit = Math.max(newLimit, 0);
            this.trimOldMessages();
        }
    }

    addCallout(...content: (string | Node)[]) {
        const div = Rendered.html`<div class="callout"></div>`.firstElementChild;
        div.append(...content);
        this.addMessage(div);
    }

    addFatal(...content: (string | Node)[]) {
        const span = Rendered.html`<span class="fatal"></span>`.firstElementChild;
        span.append(...content);
        this.addMessage(span);
    }

    addWarning(...content: (string | Node)[]) {
        const span = Rendered.html`<span class="warning"></span>`.firstElementChild;
        span.append(...content);
        this.addMessage(span);
    }

    addMessage(...content: (string | Node)[]) {
        if (!this.unreadMessage) {
            const li = document.createElement("li");
            li.classList.add("new", "unread", "message");
            li.style.setProperty("--log-index", String(this.messages.length + this.startIndex));
            this.style.setProperty("--log-max-index", String(this.messages.length + this.startIndex));
            this.prepend(li);
            after(10).then(() => li.classList.remove("new"));
            this.messages.push(li);
            this.trimOldMessages();
            this.unreadMessage = li;
        } else {
            this.unreadMessage.append(" ");
        }
        const li = this.unreadMessage;
        li.append(...content);
        return li;
    }

    trimOldMessages() {
        const oldLength = this.messages.length;
        while (this.messages.length && this.messages.length > this.limit) {
            const li = this.messages.shift();
            li?.remove();
        }
        if (oldLength !== this.messages.length) {
            this.startIndex += oldLength - this.messages.length;
        }
    }

    readMessages() {
        if (this.unreadMessage) {
            this.unreadMessage = undefined;
        }
        for (const element of this.querySelectorAll(":scope > .message.unread")) {
            element.classList.remove("unread");
        }
    }
}

export class KeyTokenList extends Array<KeyboardCueName> {
    #element: KeyboardCueElement;
    #attr: string;
    #viewKeys: KeyboardCueName[];
    constructor(element: KeyboardCueElement, attr: string, viewKeys?: KeyboardCueName[]) {
        super();
        this.#viewKeys = viewKeys || [];
        this.#element = element;
        this.#attr = attr;
        this.reparse();
    }

    get value() {
        return this.filter(k => !this.#viewKeys.includes(k))
                   .concat(this.#viewKeys
                               .filter(k => !this.includes(k))
                               .map(k => `-${k}` as any))
                   .join(" ");
    }

    reparse() {
        this.length = 0;
        this.push(...this.#viewKeys);
        const value = this.#element?.getAttribute?.(this.#attr);
        
        for (const token of value?.split(/\s+/) ?? []) {
            if (isKeyName(token)) {
                this.push(token);
            } else if (token.startsWith("-")) {
                const key = token.slice(1);
                if (isKeyName(key) && this.includes(key)) {
                    this.splice(this.indexOf(key), 1);
                }
            }
        }

    }

    add(...tokens: KeyboardCueName[]) {
        let changed = false;
        for (const item of tokens) {
            if (!this.includes(item)) {
                changed = true;
                this.push(item);
            }
        }
        if (changed) {
            this.#element.setAttribute(this.#attr, this.value);
        }
    }

    contains(token: KeyboardCueName) {
        return this.includes(token);
    }

    item(index: number) {
        return this[index] ?? null;
    }

    remove(...tokens: KeyboardCueName[]) {
        let changed = false;
        for (const token of tokens) {
            const index = this.indexOf(token);
            if (index >= 0) {
                changed = true;
                this.splice(index, 1);
            }
        }
        if (changed) {
            this.#element.setAttribute(this.#attr, this.value);
        }
    }

    replace(oldItem: KeyboardCueName, newItem: KeyboardCueName) {
        const index = this.indexOf(oldItem);
        if (index < 0) {
            return false;
        }
        this[index] = newItem;
        this.#element.setAttribute(this.#attr, this.value);
            return true;
    }

    toggle(item: KeyboardCueName, force?: boolean) {
        const index = this.indexOf(item);
        const present = index >= 0;
        if (present === force) return present;
        if (present) {
            this.splice(index, 1);
            this.#element.setAttribute(this.#attr, this.value);
            return false;
        } else {
            this.push(item);
            this.#element.setAttribute(this.#attr, this.value);
            return true;
        }
    }
    
    supports(token: string): token is KeyboardCueName {
        return isKeyName(token);
    }
}

export function isKeyName(key: string): key is KeyboardCueName {
    return KeyboardCueElement.allKeys.includes(key as KeyboardCueName);
}

console.groupCollapsed("Defining custom HTML components");
KeyboardCueElement.defineElement();
MessageLogElement.defineElement();
console.groupEnd();
Object.assign(self, {KeyboardCueElement, KeyTokenList, isKeyName});
