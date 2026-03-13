import type { Page } from './page';
/** A parsed query string represented as a key-value map. Values are strings or `true` for bare keys (e.g. `?flag`). */
export type QueryObject = {
    [key: string]: boolean | string;
};
/** Handler function invoked when a route matches. Captured route params are passed as positional arguments. */
export type PageHandler = (...params: string[]) => void;
/** Per-route options attached when calling `router.add()`. */
export interface PageOptions {
    /**
     * Called when the user navigates away from this page.
     * Receives the current page and a flag indicating whether the call is async.
     * Return `false` (or a rejected Promise) to block navigation.
     */
    unloadCb?: (page: Page, isAsync: boolean) => boolean | Promise<boolean>;
}
/** A compiled route entry stored in `Router.routes`. */
export interface Route {
    /** The compiled RegExp used to match URL fragments. */
    rule: RegExp;
    /** The handler to invoke on match. */
    handler: PageHandler;
    /** Optional per-route options (e.g. `unloadCb`). */
    options?: PageOptions;
}
/** Global lifecycle hooks applied to every route. */
export interface RouterHooks {
    /**
     * Called before a route handler is executed.
     * Useful for analytics, logging, or setting up shared state.
     */
    before?: (page: Page) => void;
    /**
     * Called after a route handler has finished executing.
     */
    after?: (page: Page) => void;
    /**
     * Security gate called before each route handler.
     * Return `false` to block the route (the handler will not run).
     */
    secure?: (page: Page) => boolean;
}
/** Options accepted by the `Router` constructor. */
export interface RouterOptions {
    /** Pre-define routes instead of (or in addition to) calling `router.add()`. */
    routes?: Array<{
        rule: string | RegExp;
        handler: PageHandler;
        options?: PageOptions;
    }>;
    /**
     * Routing mode.
     * - `'history'` — uses the HTML5 History API (clean URLs). Falls back to `'hash'` when `pushState` is unavailable.
     * - `'hash'` — uses `window.location.hash`.
     * @default 'history'
     */
    mode?: 'history' | 'hash';
    /**
     * Base path of the application.
     * @default '/'
     */
    root?: string;
    /** Global lifecycle hooks. */
    hooks?: RouterHooks;
    /**
     * Handler called when no route matches the current URL.
     * @default logs an error to the console
     */
    page404?: (path: string) => void;
}
