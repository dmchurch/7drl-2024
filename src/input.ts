import { fromTypedEntries, invertMap, typedEntries } from "./helpers.js";
import { KeyboardCueElement } from "./uicomponents.js";

export type SingleDOMKeyBindingType = DOMKeyCode | DOMKeySymbol;
export type DOMKeyBindingType = SingleDOMKeyBindingType | SingleDOMKeyBindingType[];

export class InputManager {
    static #instance: InputManager;
    static get instance() {
        if (!this.#instance) {
            this.#instance = new this();
        }
        return this.#instance;
    }
    private _: any = InputManager.#instance ??= this; // set the #instance as early as possible in the constructor

    static readonly keyCodesToKeyCues = invertMap(KeyboardCueElement.keysToDOMCodes);
    static readonly keySymbolsToKeyCues = symbolMap([typedEntries(this.keyCodesToKeyCues)?.[0]?.[1]]);
    static {
        for (const [code, cue] of typedEntries(this.keyCodesToKeyCues)) {
            this.keySymbolsToKeyCues[keySymbol(code)] = [cue];
        }
    }

    static isKeyCode(name: string): name is DOMKeyCode {
        return name in InputManager.keyCodesToKeyCues;
    }

    static readonly modifierKeys: Record<Extract<Exclude<keyof KeyboardEvent, keyof UIEvent>, `${string}Key`>, DOMKeySymbol[]> = {
        altKey: [keySymbol("AltLeft"), keySymbol("AltRight")],
        ctrlKey: [keySymbol("ControlLeft"), keySymbol("ControlRight")],
        metaKey: [keySymbol("MetaLeft"), keySymbol("MetaRight")],
        shiftKey: [keySymbol("ShiftLeft"), keySymbol("ShiftRight")],
    };
    static readonly modifierKeyNames = ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const satisfies (keyof typeof InputManager.modifierKeys)[];

    keysPressed = symbolMap(true);
    charsPressed = symbolMap("");

    keyIndicators: KeyboardCueElement[] = [];

    abilityIndicators: KeyboardCueElement[] = [];

    #limitedKeyIndicators: KeyboardCueElement[] = [];

    get activeKeyIndicators() {
        if (this.keyIndicators.length === 0 || this.helpOpen) {
            return this.keyIndicators;
        }
        this.#limitedKeyIndicators[0] = this.keyIndicators[0];
        this.#limitedKeyIndicators.splice(1, 0, ...this.abilityIndicators);
        return this.#limitedKeyIndicators;
    }
    
    helpDialog: HTMLDialogElement;
    bindingLabel: HTMLElement;

    get helpOpen() {
        return this.helpDialog?.open ?? false;
    }

    #activatedMatches: InputAction[] = [];
    #deactivatedMatches: InputAction[] = [];

    repeatDelay = 500;
    repeatInterval = 250;

    paused = false;

    keyBindings: KeyBindingMap = {};
    charBindings: CharBindingMap = {};

    activeActions: InputAction[] = [];
    
    lastTriggeredActions: InputAction[] = [];

    allActions: InputAction[] = [];

    alwaysIgnoreKeys = symbolMap(true);

    moveHandler: (dx: number, dy: number, dz: number) => void;

    lastModifiers = [false, false, false, false];

    constructor() {
        if (new.target.#instance !== this) { // gets set by initializer
            throw new Error(`May not construct additional instances of ${new.target.name}`);
        }
        new.target.#instance = this;
        this.trackKeyState = this.trackKeyState.bind(this);
        this.handleKeyEvent = this.handleKeyEvent.bind(this);
    }

    ignoreKeys(...keys: DOMKeyCode[]) {
        for (const key of keys) {
            this.alwaysIgnoreKeys[keySymbol(key)] = true;
        }
    }

    unignoreKeys(...keys: DOMKeyCode[]) {
        for (const key of keys) {
            this.alwaysIgnoreKeys[keySymbol(key)] = false;
        }
    }

    bind(actionOrCallback: ActionFunction | InputAction, ...keys: DOMKeyBindingType[]) {
        if (typeof actionOrCallback === "function") {
            actionOrCallback = new CallbackAction(actionOrCallback);
        }

        this.allActions.push(actionOrCallback);

        for (const binding of actionOrCallback.bindings) {
            binding.bind(this);
        }

        for (const alternative of keys) {
            actionOrCallback.addKeyBinding(alternative);
        }
        return actionOrCallback;
    }

    unbind(actionOrCallback: ActionFunction | InputAction, ...keys: DOMKeyBindingType[]) {
        throw new Error("not implemented");
    }

    addBinding(binding: ActionBinding) {
        if (!this.allActions.includes(binding.action)) {
            this.allActions.push(binding.action);
        }
        const {keySymbolsToKeyCues} = InputManager;
        if (binding instanceof ActionKeyBinding) {
            for (const key of binding.keys) {
                const arr = (this.keyBindings[key] ??= [])
                if (!arr.includes(binding))
                    arr.push(binding);
                for (const ki of this.keyIndicators) {
                    ki.lowlight.add(...(keySymbolsToKeyCues[key] ?? []))
                }
                if (binding.action instanceof VKeyAction) {
                    (keySymbolsToKeyCues[binding.action.virtualKey] ??= []).push(...(keySymbolsToKeyCues[key] ?? []));
                }
            }
        }
        
        if (binding instanceof ActionCharBinding) {
            const arr = (this.charBindings[binding.char] ??= []);
            if (!arr.includes(binding)) arr.push(binding);
        }

    }

    removeBinding(binding: ActionBinding) {
        if (binding instanceof ActionKeyBinding) {
            for (const key of binding.keys) {
                const index = this.keyBindings[key]?.indexOf(binding) ?? -1;
                if (index >= 0) {
                    this.keyBindings[key].splice(index, 1);
                }
                for (const ki of this.keyIndicators) {
                    ki.lowlight.remove(...(InputManager.keySymbolsToKeyCues[key] ?? []))
                }
            }
        }
        if (binding instanceof ActionCharBinding) {
        }
    }

    attach(target = window) {
        target.addEventListener("keydown", this.trackKeyState, {"capture": true, "passive": true});
        target.addEventListener("keyup", this.trackKeyState, {"capture": true, "passive": true});
        target.addEventListener("keydown", this.handleKeyEvent);
        target.addEventListener("keyup", this.handleKeyEvent);
    }

    detach(target = window) {
        target.removeEventListener("keydown", this.trackKeyState, {"capture": true});
        target.removeEventListener("keyup", this.trackKeyState, {"capture": true});
        target.removeEventListener("keydown", this.handleKeyEvent);
        target.removeEventListener("keyup", this.handleKeyEvent);
    }

    #actionStatesDirty = false;
    trackKeyState(event: KeyboardEvent) {
        const {isKeyCode, modifierKeyNames, modifierKeys} = InputManager;
        const sym = isKeyCode(event.code) ? keySymbol(event.code) : null;
        if (sym) {
            if (this.alwaysIgnoreKeys[sym]) return; // ignore this event entirely

            const isDown = event.type === "keydown";
            this.#keyChange(sym, isDown, true);
        }

        for (let i = 0; i < modifierKeyNames.length; i++) {
            const keyProp = modifierKeyNames[i];
            const state = event[keyProp];
            if (this.lastModifiers[i] && !state) {
                for (const modSym of modifierKeys[keyProp]) {
                    if (this.keysPressed[modSym] && modSym !== sym) {
                        this.#keyChange(modSym, false, true);
                        this.#actionStatesDirty = true;
                    }
                }
            }
            this.lastModifiers[i] = state;
        }
    }

    #keyChange(sym: DOMKeySymbol, isDown: boolean, doHighlight = false) {
        this.keysPressed[sym] = isDown;
        if (!isDown && this.charsPressed[sym]) {
            this.charsPressed[sym] = null;
        }
        if (doHighlight) {
            for (const ki of this.activeKeyIndicators) {
            for (const keyname of InputManager.keySymbolsToKeyCues[sym] ?? []) {
                    ki.highlight.toggle(keyname, isDown);
                }
            }
        }
    }

    setKeyState(keySym: DOMKeySymbol, isDown: boolean, event: UIEvent) {
        this.keysPressed[keySym] = isDown;
        this.handleKeySym(keySym, event);
    }

    handleKeySym(keySym: DOMKeySymbol, event: UIEvent) {
        if (this.alwaysIgnoreKeys[keySym]) {
            return false;
        }
        const bindings = this.keyBindings[keySym];

        const length = bindings?.length ?? 0;
        for (let i = 0; i < length; i++) {
            const binding = bindings[i];
            const matches = binding.matches(event, this);
            this.setBindingActive(binding, matches, event); // may cause an action to activate or deactivate
        }
        return true;
    }

    handleKeyEvent(event: KeyboardEvent) {
        if (event.defaultPrevented) return;

        if (this.#actionStatesDirty) {
            // we had to do an emergency modifier reset, so go through and check all our actions. actions
            // that are active but have no matches get silently reset.
            for (const action of this.allActions) {
                if (action.isActive && !action.hasMatch(null, this)) {
                    action.deactivate(null, this);
                    for (const binding of action.bindings) {
                        binding.isActive = false;
                    }
                }
            }
            this.#actionStatesDirty = false;
        }

        const wasActive = this.activeActions.length > 0;

        this.#activatedMatches.length = 0;
        this.#deactivatedMatches.length = 0;

        const sym = InputManager.isKeyCode(event.code) ? keySymbol(event.code) : null;
        
        if (sym) {
            if (this.handleKeySym(sym, event) === false) {
                // bail, don't process further, don't prevent default
                return;
            }
        }

        if (event.key && event.key in this.charBindings) {
            const bindings = this.charBindings[event.key];
            const length = bindings?.length ?? 0;
            if (sym) {
                this.charsPressed[sym] = event.key;
            }
            for (let i = 0; i < length; i++) {
                const binding = bindings[i];
                const matches = binding.matches(event, this);
                this.setBindingActive(binding, matches, event);
            }
        }

        if (this.#activatedMatches.length) {
            this.bindingLabel.textContent = `Activated: ${this.#activatedMatches.map(a => a.name).join(", ")}`;
        } else if (this.#deactivatedMatches.length) {
            this.bindingLabel.textContent = `Deactivated: ${this.#deactivatedMatches.map(a => a.name).join(", ")}`;
        }
        
        if (wasActive || this.activeActions.length > 0) {
            event.preventDefault();
        }
    }
    
    setBindingActive(binding: ActionBinding, active: boolean, event: UIEvent) {
        binding.setActive(event, active, this);
    }

    triggerMoveHandler(dx=0, dy=0, dz=0) {
        this.moveHandler?.(dx, dy, dz);
    }

    reportActionState(action: InputAction, active: boolean) {
        const {activeActions} = this;
        if (active && !activeActions.includes(action)) {
            activeActions.push(action);
            if (action.name && !(action instanceof VKeyAction)) {
                this.#activatedMatches.push(action);
            }
        } else if (!active) {
            const index = activeActions.indexOf(action);
            if (index >= 0) {
                activeActions.splice(index, 1);
                if (action.name && !(action instanceof VKeyAction)) {
                    this.#deactivatedMatches.push(action);
                }
            }
        }
    }

    toggleHelp() {
        this.bindingLabel.textContent = "";
        if (this.helpOpen) {
            this.helpDialog.close("cancel");
            this.paused = false;
        } else {
            this.helpDialog.showModal();
            this.paused = true;
        }
    }

    HelpAction = new CallbackAction(() => this.toggleHelp(), "Help", false);

    // enabling any of these cause the input manager to think of these as "bound keys" and
    // start blocking keyboard events by default
    readonly VKeyAlt = new VKeyAction("Alt").addKeyBindings("AltLeft", "AltRight").virtualKey;
    // readonly VKeyShift = new VKeyAction("Shift").addKeyBindings("ShiftLeft", "ShiftRight").virtualKey;
    // readonly VKeyControl = new VKeyAction("Control").addKeyBindings("ControlLeft", "ControlRight").virtualKey;
    // readonly VKeyMeta = new VKeyAction("Meta").addKeyBindings("MetaLeft", "MetaRight").virtualKey;
}

export class InputAction {
    name = "Perform Action";

    bindings: ActionBinding[] = [];

    #isActive = false;
    get isActive() {
        return this.#isActive;
    }

    repeatable = true;
    #disabled = false;
    get disabled() { return this.#disabled; }
    set disabled(v) {
        if (v !== this.#disabled) {
            this.#disabled = v;
            this.checkBindings();
        }
    }

    constructor(name: string, repeatable = true, disabled = false) {
        this.name = name;
        this.repeatable = repeatable;
        this.disabled = disabled;
    }

    setName(name: string) {
        this.name = name;
        return this;
    }

    activate(event: UIEvent, input = InputManager.instance) {
        this.#isActive = true;
        input.reportActionState(this, true);
    }

    repeat(input = InputManager.instance) {
    }

    deactivate(event: UIEvent, input = InputManager.instance) {
        this.#isActive = false;
        input.reportActionState(this, false);
    }

    matchAllowed(event: UIEvent) {
        return true;
    }

    hasMatch(event: UIEvent, input = InputManager.instance) {
        for (const binding of this.bindings) {
            if (binding.matches(event, input)) {
                return true;
            }
        }
        return false;
    }

    checkBindings(event?: UIEvent, input = InputManager.instance) {
        const hasActiveBinding = this.hasMatch(event, input);
        if (hasActiveBinding && !this.isActive) {
            this.activate(event, input);
        } else if (!hasActiveBinding && this.isActive) {
            this.deactivate(event, input);
        }
    }

    indexOfBinding(binding: ActionBinding) {
        return this.bindings.findIndex(b => binding.equals(b));
    }

    findBinding(binding: ActionBinding) {
        return this.bindings.find(b => binding.equals(b));
    }

    addBinding(newBinding: ActionBinding, recheck = true) {
        if (this.findBinding(newBinding)) return this;
        this.bindings.push(newBinding);
        newBinding.bind();
        if (recheck) this.checkBindings();
        return newBinding;
    }

    removeBinding(binding: ActionBinding, recheck = true) {
        const index = this.indexOfBinding(binding);
        if (index < 0) return this;

        const oldBinding = this.bindings.splice(index, 1)[0];
        if (recheck) this.checkBindings();
        oldBinding.unbind();
        return this;
    }

    addKeyBinding(keys: DOMKeyBindingType, repeatable = true, disabled = false) {
        if (!Array.isArray(keys)) keys = [keys];
        const newBinding = new ActionKeyBinding(this, keys);
        newBinding.repeatable = repeatable;
        newBinding.disabled = disabled;
        return this.addBinding(newBinding);
    }

    addKeyBindings(...bindings: DOMKeyBindingType[]) {
        for (const binding of bindings) {
            this.addKeyBinding(binding, this.repeatable);
        }
        return this;
    }

    removeKeyBindings(...bindings: DOMKeyBindingType[]) {
        for (const binding of bindings) {
            this.removeKeyBinding(binding);
        }
        return this;
    }

    removeKeyBinding(keys: DOMKeyBindingType) {
        if (!Array.isArray(keys)) keys = [keys];
        const searchBinding = new ActionKeyBinding(this, keys);
        return this.removeBinding(searchBinding);
    }

    addCharBinding(char: string, keys?: DOMKeyBindingType, repeatable = true, disabled = false) {
        if (!Array.isArray(keys)) keys = keys ? [keys] : [];
        const newBinding = new ActionCharBinding(this, char, keys);
        newBinding.repeatable = repeatable;
        newBinding.disabled = disabled;
        return this.addBinding(newBinding);
    }

    removeCharBinding(char: string, keys?: DOMKeyBindingType) {
        if (!Array.isArray(keys)) keys = keys ? [keys] : [];
        const searchBinding = new ActionCharBinding(this, char, keys);
        return this.removeBinding(searchBinding);
    }
}

export class DOMListAction extends InputAction {
    tokenList: DOMTokenList;
    item: string;

    constructor(name: string, tokenList: DOMTokenList, item: string, disabled = false) {
        super(name, false, disabled);
        this.tokenList = tokenList;
        this.item = item;
    }

    activate(event: UIEvent, input = InputManager.instance) {
        super.activate(event, input);
        if (!input.paused) {
            this.tokenList.add(this.item);
        }
    }

    deactivate(event: UIEvent, input = InputManager.instance) {
        super.deactivate(event, input);
        if (!input.paused) {
            this.tokenList.remove(this.item);
        }
    }
}

export class VKeyAction extends InputAction {
    virtualKey = Symbol(`VKey${this.name}`);

    constructor(name: string, disabled=false) {
        super(name, false, disabled);

    }

    activate(event: UIEvent, input = InputManager.instance) {
        super.activate(event, input);
        input.setKeyState(this.virtualKey, true, event);
    }

    deactivate(event: UIEvent, input = InputManager.instance) {
        input.setKeyState(this.virtualKey, false, event);
        super.deactivate(event, input);
    }
}

export class CallbackAction extends InputAction {
    callback: ActionFunction;

    constructor(callback: ActionFunction, name = callback.name, repeatable = true, disabled = false) {
        super(name, repeatable, disabled);
        this.callback = callback;
    }

    activate(event: UIEvent, input = InputManager.instance) {
        super.activate(event, input);
        if (!input.paused) {
            this.callback(event);
        }
    }

    repeat(input = InputManager.instance) {
        if (!input.paused) {
            this.callback(null);
        }
    }

}

export class MoveAction extends InputAction {
    static moveActions: Record<string, MoveAction> = {};

    static DiagonalOnly = new VKeyAction("Lock diagonal movement", false);
    
    static UP = new this("Move up", 0, -1);
    static RIGHT = new this("Move right", 1, 0);
    static DOWN = new this("Move down", 0, 1);
    static LEFT = new this("Move left", -1, 0);

    static UPLEFT = new this("Move up-left", -1, -1);
    static UPRIGHT = new this("Move up-right", 1, -1);
    static DOWNRIGHT = new this("Move down-right", 1, 1);
    static DOWNLEFT = new this("Move down-left", -1, 1);

    static SURFACE = new this("Surface", 0, 0, 1);
    static DIVE = new this("Dive", 0, 0, -1);
    
    static WAIT = new this("Wait", 0, 0, 0);

    static lastMovedEvent: UIEvent;

    readonly dx: number;
    readonly dy: number;
    readonly dz: number;

    readonly isOrthogonal: boolean;
    readonly isDiagonal: boolean;
    readonly isSurfaceDive: boolean;

    constructor(name: string, dx = 0, dy = 0, dz = 0) {
        super(name);
        const key = `${dx},${dy},${dz}`;
        if (new.target.moveActions[key]) {
            return new.target.moveActions[key];
        }
        this.dx = dx;
        this.dy = dy;
        this.dz = dz;
        this.isSurfaceDive = dz !== 0;
        this.isOrthogonal = (dx !== 0 ? 1 : 0) + (dy !== 0 ? 1 : 0) === 1;
        this.isDiagonal = (dx !== 0 ? 1 : 0) + (dy !== 0 ? 1 : 0) === 2;
        new.target.moveActions[key] = this;
    }

    matchAllowed(event: UIEvent) {
        return super.matchAllowed(event) && (!MoveAction.DiagonalOnly.isActive || this.isDiagonal);
    }

    activate(event: UIEvent, input = InputManager.instance) {
        super.activate(event, input);
        const {dx, dy, dz} = this;
        if (event) {
            if (event === MoveAction.lastMovedEvent) {
                return;
            }
            MoveAction.lastMovedEvent = event;
        }
        if (!input.paused) {
            input.triggerMoveHandler(dx, dy, dz);
        }
    }

    repeat(input = InputManager.instance) {
        const {dx, dy, dz} = this;
        if (!input.paused) {
            input.triggerMoveHandler(dx, dy, dz);
        }
    }
}

export class ActionBinding {
    #action: WeakRef<InputAction>;
    get action() {
        return this.#action?.deref();
    }

    isActive = false;

    #disabled = false;
    get disabled() {
        return this.#disabled;
    }
    set disabled(v) {
        if (v !== this.#disabled) {
            this.#disabled = v;
            if (!this.action.disabled) {
                this.action.checkBindings();
            }
        }
    }
    repeatable = true;

    constructor(action: InputAction) {
        this.#action = new WeakRef(action);
    }

    equals(other: ActionBinding) {
        return !this.action || this.action === other.action;
    }

    matches(event: UIEvent, input = InputManager.instance) {
        return this.action?.matchAllowed(event) && !this.disabled;
    }

    bind(input = InputManager.instance) {
        input.addBinding(this);
    }

    unbind(input = InputManager.instance) {
        input.removeBinding(this);
    }

    setActive(event: UIEvent, active=true, input = InputManager.instance) {
        if (active === this.isActive) return active;
        this.isActive = active;
        if (active && !this.action.isActive) {
            this.action.activate(event, input);
        } else if (!active && this.action.isActive && !this.action.hasMatch(event, input)) {
            this.action.deactivate(event, input);
        }
        return active;
    }
}

export class ActionKeyBinding extends ActionBinding {
    keys: DOMKeySymbol[] = [];

    constructor(action: InputAction, keys: (DOMKeyCode | DOMKeySymbol)[]) {
        super(action);
        this.keys = keys.map(keySymbol);
    }

    equals(other: ActionBinding) {
        if (!super.equals(other) || !(other instanceof ActionKeyBinding)) return false;
        const {keys} = other;
        if (keys?.length !== this.keys.length) {
            return false;
        }
        return this.keys.every(s => keys.includes(s));
    }

    matches(event: UIEvent, input = InputManager.instance) {
        if (!super.matches(event, input)) {
            return false;
        }
        const {keysPressed} = input;
        for (const key of this.keys) {
            if (!keysPressed[key]) {
                return false;
            }
        }
        return true;
    }
}

export class ActionCharBinding extends ActionKeyBinding {
    char: string;

    activatingKeySym: DOMKeySymbol;

    constructor(action: InputAction, char: string, keys: (DOMKeyCode | DOMKeySymbol)[]) {
        super(action, keys);
        this.char = char;
    }

    matches(event: UIEvent, input = InputManager.instance) {
        if (!super.matches(event, input)) return false;
        if (event instanceof KeyboardEvent && event.type === "keydown" && event.key === this.char) {
            return true;
        } else if (this.activatingKeySym && input.keysPressed[this.activatingKeySym]) {
            return true;
        }
        return false;
    }

    equals(other: ActionBinding) {
        return other instanceof ActionCharBinding && super.equals(other) && this.char === other.char;
    }

    setActive(event: UIEvent, active = true, input = InputManager.instance) {
        if (super.setActive(event, active, input) && event instanceof KeyboardEvent && event.key === this.char) {
            this.activatingKeySym = InputManager.isKeyCode(event.code) ? keySymbol(event.code) : null;
        } else if (!this.isActive) {
            this.activatingKeySym = null;
        }
        return this.isActive;
    }
}

function keySymbol(code: DOMKeyCode | DOMKeySymbol): DOMKeySymbol {
    return typeof code === "symbol" ? code : Symbol.for(code) as DOMKeySymbol;
}

function symbolMap<T>(valueForTyping: T): Record<DOMKeySymbol, T> {
    return {__proto__: null} as any;
}
type ActionFunction = (event: UIEvent) => any | Promise<any>;
type KeyBindingMap = Record<DOMKeySymbol, ActionBinding[]>;
type CharBindingMap = Record<string, ActionBinding[]>;

// const domKeySymbol = Symbol("unused, just for typing");
type DOMKeySymbol = symbol;

Object.assign(self, {InputManager, InputAction, CallbackAction, MoveAction, DOMListAction, VKeyAction, ActionBinding, ActionKeyBinding});