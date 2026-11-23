// @ts-check
"use strict";

/**
 * Lightweight synchronous publish/subscribe event bus for decoupling settings,
 * theme, route, provider status, and UI updates without manual refresh chains.
 */
class EventBus {
    constructor() {
        /** @type {Map<string, Set<(payload: any) => void>>} */
        this.listeners = new Map();
    }

    /**
     * Subscribes to a named event.
     * @param {string} event
     * @param {(payload: any) => void} handler
     * @returns {() => void} Unsubscribe callback
     */
    on(event, handler) {
        const name = String(event || "").trim();
        if (!name || typeof handler !== "function") return () => {};
        let set = this.listeners.get(name);
        if (!set) {
            set = new Set();
            this.listeners.set(name, set);
        }
        set.add(handler);
        return () => this.off(name, handler);
    }

    /**
     * Subscribes once and auto-unsubscribes before invoking handler.
     * @param {string} event
     * @param {(payload: any) => void} handler
     * @returns {() => void}
     */
    once(event, handler) {
        if (typeof handler !== "function") return () => {};
        let unsub = () => {};
        const wrapped = payload => {
            unsub();
            handler(payload);
        };
        unsub = this.on(event, wrapped);
        return unsub;
    }

    /**
     * Unsubscribes a listener from an event.
     * @param {string} event
     * @param {(payload: any) => void} handler
     */
    off(event, handler) {
        const set = this.listeners.get(String(event || "").trim());
        if (!set) return;
        set.delete(handler);
        if (set.size === 0) this.listeners.delete(String(event || "").trim());
    }

    /**
     * Emits an event to all current listeners, isolating listener exceptions.
     * @param {string} event
     * @param {any} [payload]
     * @returns {number} Number of listeners invoked
     */
    emit(event, payload) {
        const set = this.listeners.get(String(event || "").trim());
        if (!set || set.size === 0) return 0;
        let count = 0;
        for (const handler of [...set]) {
            count++;
            try {
                handler(payload);
            }
            catch {
                // Keep remaining subscribers isolated from a single listener failure.
            }
        }
        return count;
    }

    /**
     * Removes listeners for one event or all events.
     * @param {string} [event]
     */
    clear(event) {
        if (event !== undefined) {
            this.listeners.delete(String(event || "").trim());
            return;
        }
        this.listeners.clear();
    }

    /**
     * Returns current subscriber count for an event (or total when omitted).
     * @param {string} [event]
     * @returns {number}
     */
    listenerCount(event) {
        if (event !== undefined) {
            return this.listeners.get(String(event || "").trim())?.size || 0;
        }
        let total = 0;
        for (const set of this.listeners.values()) total += set.size;
        return total;
    }
}

module.exports = { EventBus };
