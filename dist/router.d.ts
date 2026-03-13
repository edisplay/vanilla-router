import { Page } from './page';
import type { PageHandler, PageOptions, Route, RouterOptions } from './types';
/**
 * Client-side router for Single Page Applications.
 *
 * Supports both HTML5 History API (`history` mode) and hash-based routing
 * (`hash` mode), with automatic fallback when `pushState` is unavailable.
 *
 * @example
 * ```ts
 * const router = new Router({ mode: 'history', root: '/' });
 *
 * router
 *   .add('home', () => renderHome())
 *   .add('users/{id}', (id) => renderUser(id))
 *   .addUriListener()
 *   .check();
 * ```
 */
export declare class Router {
    /** Reference to the {@link Page} class, available as `Router.Page`. */
    static readonly Page: typeof Page;
    /** Registered routes. Mutated by `add()` and `remove()`. */
    routes: Route[];
    /** Active routing mode. Set to `null` after `reset()`. */
    mode: 'history' | 'hash' | null;
    /** Normalised base path (always starts and ends with `/`). */
    root: string;
    /** Handler invoked when no route matches the current URL. */
    notFoundHandler: (path: string) => void;
    /** Global hook called before every route handler. */
    beforeHook: (page: Page) => void;
    /** Global hook called after every route handler. */
    afterHook: (page: Page) => void;
    /** Security hook; return `false` to block a route from executing. */
    securityHook: (page: Page) => boolean;
    private _pageState;
    private _currentPage;
    private _skipCheck;
    private _current;
    private _queryString;
    private _historyStack;
    private _historyIdx;
    private _historyState;
    /**
     * Creates a new Router instance.
     *
     * @param options - Optional configuration. Routing mode defaults to
     *   `'history'` when `pushState` is available, otherwise falls back to `'hash'`.
     */
    constructor(options?: RouterOptions);
    /**
     * Merges caller-supplied options with defaults and returns a fully-resolved
     * settings object used during construction.
     */
    private _getSettings;
    /** Strips leading and trailing slashes from `path`. */
    private _trimSlashes;
    /** Returns the current URI fragment in `history` mode (pathname minus root). */
    private _getHistoryFragment;
    /** Returns the current URI fragment in `hash` mode (hash minus `#` and query string). */
    private _getHashFragment;
    /** Returns the current URI fragment for whichever routing mode is active. */
    private _getFragment;
    /**
     * Converts a string route pattern into a RegExp.
     *
     * Supported placeholders:
     * - `:any` / `{name}` — matches `[\w\-\_\.]+`
     * - `:word` — matches `[a-zA-Z]+`
     * - `:num` — matches `\d+`
     * - `(:any)` / `(:word)` / `(:num)` — same as above but captured as a param
     *
     * RegExp rules are returned as-is.
     */
    private _parseRouteRule;
    /**
     * Parses a query string into a {@link QueryObject}.
     * Also stores the raw string in `_queryString` for use by `refresh()`.
     */
    private _parseQuery;
    /** Returns the parsed query string in `history` mode (`window.location.search`). */
    private _getHistoryQuery;
    /** Returns the parsed query string in `hash` mode (the portion after `?` in the hash). */
    private _getHashQuery;
    /** Returns the parsed query string for whichever routing mode is active. */
    private _getQuery;
    /**
     * Registers a new route.
     *
     * @param rule    - A string pattern or RegExp to match against the URL fragment.
     * @param handler - Function to invoke when the route matches. Captured params are passed as arguments.
     * @param options - Optional per-route options (e.g. `unloadCb`).
     * @returns `this` for chaining.
     *
     * @example
     * ```ts
     * router.add('users/:num', (id) => console.log(id));
     * router.add('profile/{name}', (name) => console.log(name));
     * router.add(/^admin\/(\w+)/i, (section) => console.log(section));
     * ```
     */
    add(rule: string | RegExp, handler: PageHandler, options?: PageOptions): this;
    /**
     * Removes the first route that matches `param`.
     *
     * @param param - The handler function reference, or the original string/RegExp pattern used in `add()`.
     * @returns `this` for chaining.
     */
    remove(param: string | PageHandler): this;
    /**
     * Resets the router to its initial state: clears all routes, removes URI
     * listeners, and nullifies the routing mode.
     *
     * @returns `this` for chaining.
     */
    reset(): this;
    /**
     * In `hash` mode, pushes the current fragment onto the internal history
     * stack (unless the current state is `'hold'`, which indicates a `go()` call).
     */
    private _pushHistory;
    /**
     * Navigates one step backward in browser history.
     * Delegates to `window.history.back()` in `history` mode, or to `go()` in `hash` mode.
     *
     * @returns `this` for chaining.
     */
    back(): this;
    /**
     * Navigates one step forward in browser history.
     * Delegates to `window.history.forward()` in `history` mode, or to `go()` in `hash` mode.
     *
     * @returns `this` for chaining.
     */
    forward(): this;
    /**
     * Navigates to a specific position in browser history.
     * In `history` mode wraps `window.history.go(count)`.
     * In `hash` mode uses the internal stack.
     *
     * @param count - The absolute stack index (hash mode) or relative offset (history mode).
     * @returns `this` for chaining.
     */
    go(count: number): this;
    /**
     * Navigates to `path`, pushing a new history entry.
     *
     * In `history` mode calls `pushState` then `check()`.
     * In `hash` mode sets `window.location.hash` (which triggers `hashchange`).
     *
     * @param path   - Target path (leading/trailing slashes are normalised).
     * @param state  - Arbitrary state object stored alongside the history entry.
     * @param silent - When `true`, the URL is updated but the route handler is not invoked.
     * @returns `this` for chaining.
     */
    navigateTo(path: string, state?: unknown, silent?: boolean): this;
    /**
     * Navigates to `path`, replacing the current history entry.
     *
     * In `history` mode calls `replaceState` then `check()`.
     * In `hash` mode decrements the internal index then sets `window.location.hash`.
     *
     * @param path   - Target path.
     * @param state  - Arbitrary state object.
     * @param silent - When `true`, the URL is updated but the route handler is not invoked.
     * @returns `this` for chaining.
     */
    redirectTo(path: string, state?: unknown, silent?: boolean): this;
    /**
     * Re-executes the current page's route handler by navigating to the same
     * URI (including the current query string).
     *
     * Does nothing when there is no current page.
     *
     * @returns `this` for chaining.
     */
    refresh(): this;
    /**
     * Invokes `notFoundHandler` for `path` and sets it as the current page.
     */
    private _page404;
    /**
     * Resolves the unload callback of the current page.
     *
     * @param asyncRequest - When `true`, always returns a Promise.
     * @returns `true` / `Promise<true>` if navigation is allowed; `false` / rejected Promise to block it.
     */
    private _unloadCallback;
    /**
     * Iterates over registered routes and executes the handler for the first
     * match. Calls `beforeHook`, the handler, then `afterHook`.
     * Also sets up `window.onbeforeunload` when the matched route has an `unloadCb`.
     *
     * @returns `true` if a matching route was found and executed.
     */
    private _findRoute;
    /**
     * Handles navigation away from a page that has an async `unloadCb`.
     * Resolves the callback as a Promise, then either proceeds with `_processUri`
     * or rolls back to the previous URL via `_resetState`.
     */
    private _treatAsync;
    /**
     * Rolls back navigation by silently navigating to the previously active
     * URL when an `unloadCb` rejects.
     */
    private _resetState;
    /**
     * Core navigation step: records the fragment in history, then calls
     * `_findRoute()`. Falls through to `_page404` when no route matches.
     */
    private _processUri;
    /**
     * Reads the current URL and executes the matching route handler.
     *
     * When the current page has an `unloadCb`, navigation is deferred until
     * the callback resolves.
     *
     * @returns `this` for chaining.
     */
    check(): this;
    /**
     * Starts listening for URL changes.
     * Binds `popstate` in `history` mode and `hashchange` in `hash` mode.
     *
     * @returns `this` for chaining.
     */
    addUriListener(): this;
    /**
     * Stops listening for URL changes by clearing `onpopstate` and `onhashchange`.
     *
     * @returns `this` for chaining.
     */
    removeUriListener(): this;
}
