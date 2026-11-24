// @ts-check
"use strict";

/**
 * Unified lifecycle resource manager for timers, animation frames, idle callbacks,
 * DOM listeners, AbortControllers, and nested child scopes.
 * Runs in both Node.js tests and BetterDiscord's Electron renderer sandbox (no node:* imports).
 */
class DisposableScope {
    constructor() {
        /** @type {Set<() => void>} */
        this.cleanups = new Set();
        /** @type {Set<DisposableScope>} */
        this.children = new Set();
        /** @type {boolean} */
        this.disposed = false;
    }

    /**
     * Registers a cleanup function. If already disposed, invokes it immediately.
     * @param {() => void} cleanup
     * @returns {() => void} Idempotent release function
     */
    add(cleanup) {
        if (typeof cleanup !== "function") return () => {};
        if (this.disposed) {
            try { cleanup(); } catch { /* ignore */ }
            return () => {};
        }
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            this.cleanups.delete(release);
            try { cleanup(); } catch { /* ignore */ }
        };
        this.cleanups.add(release);
        return release;
    }

    /**
     * Schedules a timeout that auto-clears on dispose.
     * @param {() => void} fn
     * @param {number} delayMs
     * @param {{ unref?: boolean }} [options]
     * @returns {() => void}
     */
    setTimeout(fn, delayMs, options = {}) {
        if (this.disposed || typeof fn !== "function") return () => {};
        let timer = null;
        const release = this.add(() => {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
        });
        timer = setTimeout(() => {
            timer = null;
            this.cleanups.delete(release);
            if (!this.disposed) fn();
        }, delayMs);
        if (options?.unref) {
            try { /** @type {any} */ (timer)?.unref?.(); } catch { /* ignore */ }
        }
        return release;
    }

    /**
     * Schedules an interval that auto-clears on dispose.
     * @param {() => void} fn
     * @param {number} intervalMs
     * @param {{ unref?: boolean }} [options]
     * @returns {() => void}
     */
    setInterval(fn, intervalMs, options = {}) {
        if (this.disposed || typeof fn !== "function") return () => {};
        let timer = setInterval(() => {
            if (!this.disposed) fn();
        }, intervalMs);
        if (options?.unref) {
            try { /** @type {any} */ (timer)?.unref?.(); } catch { /* ignore */ }
        }
        return this.add(() => {
            if (timer !== null) {
                clearInterval(timer);
                timer = null;
            }
        });
    }

    /**
     * Schedules requestAnimationFrame (falling back to setTimeout when unavailable).
     * @param {() => void} fn
     * @returns {() => void}
     */
    requestAnimationFrame(fn) {
        if (this.disposed || typeof fn !== "function") return () => {};
        if (typeof requestAnimationFrame !== "function") {
            return this.setTimeout(fn, 16);
        }
        let rafId = null;
        const release = this.add(() => {
            if (rafId !== null && typeof cancelAnimationFrame === "function") {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        });
        rafId = requestAnimationFrame(() => {
            rafId = null;
            this.cleanups.delete(release);
            if (!this.disposed) fn();
        });
        return release;
    }

    /**
     * Schedules requestIdleCallback (falling back to setTimeout when unavailable).
     * @param {(deadline?: { didTimeout: boolean, timeRemaining: () => number }) => void} fn
     * @param {{ timeout?: number }} [options]
     * @returns {() => void}
     */
    requestIdleCallback(fn, options) {
        if (this.disposed || typeof fn !== "function") return () => {};
        if (typeof requestIdleCallback !== "function") {
            return this.setTimeout(() => fn({ didTimeout: true, timeRemaining: () => 0 }), 0);
        }
        let idleId = null;
        const release = this.add(() => {
            if (idleId !== null && typeof cancelIdleCallback === "function") {
                cancelIdleCallback(idleId);
                idleId = null;
            }
        });
        idleId = requestIdleCallback(deadline => {
            idleId = null;
            this.cleanups.delete(release);
            if (!this.disposed) fn(deadline);
        }, options);
        return release;
    }

    /**
     * Attaches a DOM/EventTarget listener and auto-removes it on dispose.
     * @param {any} target
     * @param {string} event
     * @param {Function} handler
     * @param {any} [options]
     * @returns {() => void}
     */
    on(target, event, handler, options) {
        if (this.disposed || !target?.addEventListener || typeof handler !== "function") return () => {};
        target.addEventListener(event, handler, options);
        return this.add(() => {
            target.removeEventListener?.(event, handler, options);
        });
    }

    /**
     * Creates an AbortController that automatically aborts on dispose.
     * @returns {AbortController}
     */
    createAbortController() {
        const controller = new AbortController();
        if (this.disposed) {
            try { controller.abort(); } catch { /* ignore */ }
            return controller;
        }
        this.add(() => {
            if (!controller.signal.aborted) {
                try { controller.abort(); } catch { /* ignore */ }
            }
        });
        return controller;
    }

    /**
     * Creates a child scope bound to this parent's lifetime.
     * @returns {DisposableScope}
     */
    createChild() {
        const child = new DisposableScope();
        if (this.disposed) {
            child.dispose();
            return child;
        }
        this.children.add(child);
        const detach = () => { this.children.delete(child); };
        child.add(detach);
        return child;
    }

    /**
     * Disposes all child scopes and registered cleanups idempotently.
     */
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        const children = [...this.children];
        this.children.clear();
        for (const child of children) {
            try { child.dispose(); } catch { /* ignore */ }
        }
        const cleanups = [...this.cleanups];
        this.cleanups.clear();
        for (const release of cleanups) {
            try { release(); } catch { /* ignore */ }
        }
    }

    /**
     * Resets a root scope so a stopped plugin instance can be started again cleanly.
     */
    reset() {
        this.dispose();
        this.disposed = false;
    }
}

module.exports = { DisposableScope };
