// Ambient type declarations for BetterDiscord renderer globals and custom DOM/Error expando properties.
// Dev-only static analysis file (never bundled into DiscordAITranslator.plugin.js).

declare var BdApi: any;
declare var BDFDB: any;
declare function require(id: string): any;
declare module "node:crypto";
declare module "crypto";

interface Error {
    [key: string]: any;
}

interface Element {
    dataset?: DOMStringMap & Record<string, any>;
    title?: string;
    disabled?: boolean;
    checked?: boolean;
    value?: string;
    type?: string;
    options?: HTMLOptionsCollection | HTMLOptionElement[];
    isContentEditable?: boolean;
    focus?: (options?: FocusOptions) => void;
    blur?: () => void;
    [key: `__dait${string}`]: any;
}

interface HTMLElement {
    [key: `__dait${string}`]: any;
}

interface EventTarget {
    closest?: (selector: string) => Element | null;
}

interface Navigator {
    scheduling?: {
        isInputPending?: (options?: { includeContinuous?: boolean }) => boolean;
    };
}

interface Array<T> {
    omittedIndexes?: number[];
}

interface Number {
    unref?: () => void;
}
