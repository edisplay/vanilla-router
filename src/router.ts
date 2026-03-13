/* global window */

import { Page } from './page';
import type { QueryObject, PageHandler, PageOptions, Route, RouterOptions } from './types';

// Internal types not exposed in the public API
interface ResolvedSettings {
    routes: Array<{ rule: string | RegExp; handler: PageHandler; options?: PageOptions }>;
    mode: 'history' | 'hash';
    root: string;
    hooks: {
        before: (page: Page) => void;
        after: (page: Page) => void;
        secure: (page: Page) => boolean;
    };
    page404: (path: string) => void;
}

interface HistoryEntry {
    path: string;
    state: unknown;
}

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
export class Router {
    /** Reference to the {@link Page} class, available as `Router.Page`. */
    static readonly Page = Page;

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

    private _pageState: unknown;
    private _currentPage: Page | null;
    private _skipCheck: boolean;
    private _current: string;
    private _queryString: string;
    private _historyStack: HistoryEntry[];
    private _historyIdx: number;
    private _historyState: string;

    /**
     * Creates a new Router instance.
     *
     * @param options - Optional configuration. Routing mode defaults to
     *   `'history'` when `pushState` is available, otherwise falls back to `'hash'`.
     */
    constructor(options?: RouterOptions) {
        const settings = this._getSettings(options);

        this.notFoundHandler = settings.page404;
        this.mode = (!window.history || !window.history.pushState) ? 'hash' : settings.mode;
        this.root = settings.root === '/' ? '/' : '/' + this._trimSlashes(settings.root) + '/';
        this.beforeHook = settings.hooks.before;
        this.afterHook = settings.hooks.after;
        this.securityHook = settings.hooks.secure;

        this.routes = [];
        if (settings.routes.length > 0) {
            settings.routes.forEach(route => {
                this.add(route.rule, route.handler, route.options);
            });
        }

        this._pageState = null;
        this._currentPage = null;
        this._skipCheck = false;
        this._current = '';
        this._queryString = '';
        this._historyStack = [];
        this._historyIdx = 0;
        this._historyState = 'add';
    }

    // -------------------------------------------------------------------------
    // Settings
    // -------------------------------------------------------------------------

    /**
     * Merges caller-supplied options with defaults and returns a fully-resolved
     * settings object used during construction.
     */
    private _getSettings(options?: RouterOptions): ResolvedSettings {
        const defaults: ResolvedSettings = {
            routes: [],
            mode: 'history',
            root: '/',
            hooks: {
                before: () => {},
                after: () => {},
                secure: () => true,
            },
            page404: (page: string) => {
                console.error({ page, message: '404. Page not found' });
            },
        };

        const opts = options ?? {};
        return {
            routes: opts.routes ?? defaults.routes,
            mode: opts.mode ?? defaults.mode,
            root: opts.root ?? defaults.root,
            page404: opts.page404 ?? defaults.page404,
            hooks: Object.assign({}, defaults.hooks, opts.hooks ?? {}),
        };
    }

    // -------------------------------------------------------------------------
    // URL / fragment helpers
    // -------------------------------------------------------------------------

    /** Strips leading and trailing slashes from `path`. */
    private _trimSlashes(path: string): string {
        if (typeof path !== 'string') return '';
        return path.replace(/\/$/, '').replace(/^\//, '');
    }

    /** Returns the current URI fragment in `history` mode (pathname minus root). */
    private _getHistoryFragment(): string {
        let fragment = decodeURI(window.location.pathname);
        if (this.root !== '/') {
            fragment = fragment.replace(this.root, '');
        }
        return this._trimSlashes(fragment);
    }

    /** Returns the current URI fragment in `hash` mode (hash minus `#` and query string). */
    private _getHashFragment(): string {
        const hash = window.location.hash.substring(1).replace(/(\?.*)$/, '');
        return this._trimSlashes(hash);
    }

    /** Returns the current URI fragment for whichever routing mode is active. */
    private _getFragment(): string {
        return this.mode === 'history' ? this._getHistoryFragment() : this._getHashFragment();
    }

    // -------------------------------------------------------------------------
    // Route rule parsing
    // -------------------------------------------------------------------------

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
    private _parseRouteRule(route: string | RegExp): RegExp {
        if (route instanceof RegExp) return route;
        const uri = this._trimSlashes(route);
        const rule = uri
            .replace(/([\\\/\-\_\.])/g, '\\$1')
            .replace(/\{[a-zA-Z]+\}/g, '(:any)')
            .replace(/\:any/g, '[\\w\\-\\_\\.]+')
            .replace(/\:word/g, '[a-zA-Z]+')
            .replace(/\:num/g, '\\d+');
        return new RegExp('^' + rule + '$', 'i');
    }

    // -------------------------------------------------------------------------
    // Query string helpers
    // -------------------------------------------------------------------------

    /**
     * Parses a query string into a {@link QueryObject}.
     * Also stores the raw string in `_queryString` for use by `refresh()`.
     */
    private _parseQuery(query: string): QueryObject {
        const result: QueryObject = {};
        if (typeof query !== 'string') return result;

        if (query[0] === '?') {
            query = query.substring(1);
        }

        this._queryString = query;
        query.split('&').forEach(row => {
            const parts = row.split('=');
            if (parts[0] !== '') {
                result[decodeURIComponent(parts[0])] = parts[1] !== undefined ? parts[1] : true;
            }
        });
        return result;
    }

    /** Returns the parsed query string in `history` mode (`window.location.search`). */
    private _getHistoryQuery(): QueryObject {
        return this._parseQuery(window.location.search);
    }

    /** Returns the parsed query string in `hash` mode (the portion after `?` in the hash). */
    private _getHashQuery(): QueryObject {
        const index = window.location.hash.indexOf('?');
        const query = index !== -1 ? window.location.hash.substring(index) : '';
        return this._parseQuery(query);
    }

    /** Returns the parsed query string for whichever routing mode is active. */
    private _getQuery(): QueryObject {
        return this.mode === 'history' ? this._getHistoryQuery() : this._getHashQuery();
    }

    // -------------------------------------------------------------------------
    // Route management (public API)
    // -------------------------------------------------------------------------

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
    add(rule: string | RegExp, handler: PageHandler, options?: PageOptions): this {
        this.routes.push({
            rule: this._parseRouteRule(rule),
            handler,
            options,
        });
        return this;
    }

    /**
     * Removes the first route that matches `param`.
     *
     * @param param - The handler function reference, or the original string/RegExp pattern used in `add()`.
     * @returns `this` for chaining.
     */
    remove(param: string | PageHandler): this {
        const paramStr = typeof param === 'string' ? this._parseRouteRule(param).toString() : null;
        this.routes.some((route, i) => {
            if (
                (typeof param === 'function' && route.handler === param) ||
                route.rule.toString() === paramStr
            ) {
                this.routes.splice(i, 1);
                return true;
            }
            return false;
        });
        return this;
    }

    /**
     * Resets the router to its initial state: clears all routes, removes URI
     * listeners, and nullifies the routing mode.
     *
     * @returns `this` for chaining.
     */
    reset(): this {
        this.routes = [];
        this.mode = null;
        this.root = '/';
        this._pageState = {};
        this.removeUriListener();
        return this;
    }

    // -------------------------------------------------------------------------
    // History management
    // -------------------------------------------------------------------------

    /**
     * In `hash` mode, pushes the current fragment onto the internal history
     * stack (unless the current state is `'hold'`, which indicates a `go()` call).
     */
    private _pushHistory(): void {
        const fragment = this._getFragment();
        if (this.mode === 'hash') {
            if (this._historyState === 'add') {
                if (this._historyIdx !== this._historyStack.length - 1) {
                    this._historyStack.splice(this._historyIdx + 1);
                }
                this._historyStack.push({ path: fragment, state: this._pageState });
                this._historyIdx = this._historyStack.length - 1;
            }
            this._historyState = 'add';
        }
    }

    /**
     * Navigates one step backward in browser history.
     * Delegates to `window.history.back()` in `history` mode, or to `go()` in `hash` mode.
     *
     * @returns `this` for chaining.
     */
    back(): this {
        if (this.mode === 'history') {
            window.history.back();
            return this;
        }
        return this.go(this._historyIdx - 1);
    }

    /**
     * Navigates one step forward in browser history.
     * Delegates to `window.history.forward()` in `history` mode, or to `go()` in `hash` mode.
     *
     * @returns `this` for chaining.
     */
    forward(): this {
        if (this.mode === 'history') {
            window.history.forward();
            return this;
        }
        return this.go(this._historyIdx + 1);
    }

    /**
     * Navigates to a specific position in browser history.
     * In `history` mode wraps `window.history.go(count)`.
     * In `hash` mode uses the internal stack.
     *
     * @param count - The absolute stack index (hash mode) or relative offset (history mode).
     * @returns `this` for chaining.
     */
    go(count: number): this {
        if (this.mode === 'history') {
            window.history.go(count);
            return this;
        }
        const page = this._historyStack[count];
        if (!page) return this;
        this._historyIdx = count;
        this._historyState = 'hold';
        return this.navigateTo(page.path, page.state);
    }

    // -------------------------------------------------------------------------
    // Navigation (public API)
    // -------------------------------------------------------------------------

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
    navigateTo(path: string, state?: unknown, silent?: boolean): this {
        path = this._trimSlashes(path) || '';
        this._pageState = state ?? null;
        this._skipCheck = !!silent;
        if (this.mode === 'history') {
            window.history.pushState(state, '', this.root + this._trimSlashes(path));
            return this.check();
        } else {
            window.location.hash = path;
        }
        return this;
    }

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
    redirectTo(path: string, state?: unknown, silent?: boolean): this {
        path = this._trimSlashes(path) || '';
        this._pageState = state ?? null;
        this._skipCheck = !!silent;
        if (this.mode === 'history') {
            window.history.replaceState(state, '', this.root + this._trimSlashes(path));
            return this.check();
        } else {
            this._historyIdx--;
            window.location.hash = path;
        }
        return this;
    }

    /**
     * Re-executes the current page's route handler by navigating to the same
     * URI (including the current query string).
     *
     * Does nothing when there is no current page.
     *
     * @returns `this` for chaining.
     */
    refresh(): this {
        if (!this._currentPage) return this;
        const path = this._currentPage.uri + '?' + this._queryString;
        return this.navigateTo(path, this._currentPage.state);
    }

    // -------------------------------------------------------------------------
    // Route matching & lifecycle
    // -------------------------------------------------------------------------

    /**
     * Invokes `notFoundHandler` for `path` and sets it as the current page.
     */
    private _page404(path: string): void {
        this._currentPage = new Page(path);
        this.notFoundHandler(path);
    }

    /**
     * Resolves the unload callback of the current page.
     *
     * @param asyncRequest - When `true`, always returns a Promise.
     * @returns `true` / `Promise<true>` if navigation is allowed; `false` / rejected Promise to block it.
     */
    private _unloadCallback(asyncRequest: boolean): boolean | Promise<boolean> {
        if (this._skipCheck) {
            return asyncRequest ? Promise.resolve(true) : true;
        }
        if (this._currentPage?.options?.unloadCb) {
            const result = this._currentPage.options.unloadCb(this._currentPage, asyncRequest);
            if (!asyncRequest || result instanceof Promise) {
                return result;
            }
            return result ? Promise.resolve(result) : Promise.reject(result);
        }
        return asyncRequest ? Promise.resolve(true) : true;
    }

    /**
     * Iterates over registered routes and executes the handler for the first
     * match. Calls `beforeHook`, the handler, then `afterHook`.
     * Also sets up `window.onbeforeunload` when the matched route has an `unloadCb`.
     *
     * @returns `true` if a matching route was found and executed.
     */
    private _findRoute(): boolean {
        const fragment = this._getFragment();
        return this.routes.some(route => {
            const match = fragment.match(route.rule);
            if (!match) return false;

            match.shift();
            const query = this._getQuery();
            const page = new Page(fragment, query, match, this._pageState, route.options);

            if (!this.securityHook(page)) return false;

            this._currentPage = page;
            if (this._skipCheck) {
                this._skipCheck = false;
                return true;
            }

            this.beforeHook(page);
            route.handler.apply(page, match);
            this.afterHook(page);
            this._pageState = null;

            window.onbeforeunload = (ev: BeforeUnloadEvent) => {
                if (this._unloadCallback(false)) return;
                ev.returnValue = '';
                return '';
            };

            return true;
        });
    }

    /**
     * Handles navigation away from a page that has an async `unloadCb`.
     * Resolves the callback as a Promise, then either proceeds with `_processUri`
     * or rolls back to the previous URL via `_resetState`.
     */
    private _treatAsync(): void {
        if (!this._currentPage?.options?.unloadCb) return;

        let result: boolean | Promise<boolean> = this._currentPage.options.unloadCb(this._currentPage, true);
        if (!(result instanceof Promise)) {
            result = result ? Promise.resolve(result) : Promise.reject(result);
        }
        (result as Promise<boolean>)
            .then(this._processUri.bind(this))
            .catch(this._resetState.bind(this));
    }

    /**
     * Rolls back navigation by silently navigating to the previously active
     * URL when an `unloadCb` rejects.
     */
    private _resetState(): void {
        this._skipCheck = true;
        this.navigateTo(this._current, (this._currentPage as Page).state, true);
    }

    /**
     * Core navigation step: records the fragment in history, then calls
     * `_findRoute()`. Falls through to `_page404` when no route matches.
     */
    private _processUri(): void {
        const fragment = this._getFragment();
        this._current = fragment;
        this._pushHistory();
        const found = this._findRoute();
        if (!found) {
            this._page404(fragment);
        }
    }

    /**
     * Reads the current URL and executes the matching route handler.
     *
     * When the current page has an `unloadCb`, navigation is deferred until
     * the callback resolves.
     *
     * @returns `this` for chaining.
     */
    check(): this {
        if (this._skipCheck) return this;
        if (this._currentPage?.options?.unloadCb) {
            this._treatAsync();
        } else {
            this._processUri();
        }
        return this;
    }

    /**
     * Starts listening for URL changes.
     * Binds `popstate` in `history` mode and `hashchange` in `hash` mode.
     *
     * @returns `this` for chaining.
     */
    addUriListener(): this {
        if (this.mode === 'history') {
            window.onpopstate = this.check.bind(this);
        } else {
            window.onhashchange = this.check.bind(this);
        }
        return this;
    }

    /**
     * Stops listening for URL changes by clearing `onpopstate` and `onhashchange`.
     *
     * @returns `this` for chaining.
     */
    removeUriListener(): this {
        window.onpopstate = null;
        window.onhashchange = null;
        return this;
    }
}
