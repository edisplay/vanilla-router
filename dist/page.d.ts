import type { QueryObject, PageOptions } from './types';
/**
 * Represents the current page context passed to route handlers and hooks.
 *
 * An instance is created for every matched route and is set as `this` inside
 * the handler function, as well as passed to all lifecycle hooks.
 */
export declare class Page {
    /** The matched URI fragment (without leading/trailing slashes). */
    uri: string;
    /** Parsed query string parameters. */
    query: QueryObject;
    /** Captured route parameters (positional matches from the route pattern). */
    params: string[];
    /** Arbitrary state object passed via `navigateTo` / `redirectTo`. */
    state: unknown;
    /** Per-route options (e.g. `unloadCb`) provided when the route was registered. */
    options: PageOptions;
    /**
     * @param uri     - Matched URI fragment.
     * @param query   - Parsed query string.
     * @param params  - Positional captures from the route pattern.
     * @param state   - State passed to `navigateTo` / `redirectTo`.
     * @param options - Route-level options.
     */
    constructor(uri?: string, query?: QueryObject, params?: string[], state?: unknown, options?: PageOptions);
}
