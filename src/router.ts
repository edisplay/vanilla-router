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

export class Router {
    static readonly Page = Page;

    routes: Route[];
    mode: 'history' | 'hash' | null;
    root: string;
    notFoundHandler: (path: string) => void;
    beforeHook: (page: Page) => void;
    afterHook: (page: Page) => void;
    securityHook: (page: Page) => boolean;

    private _pageState: unknown;
    private _currentPage: Page | null;
    private _skipCheck: boolean;
    private _current: string;
    private _queryString: string;
    private _historyStack: HistoryEntry[];
    private _historyIdx: number;
    private _historyState: string;

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

    private _trimSlashes(path: string): string {
        if (typeof path !== 'string') return '';
        return path.replace(/\/$/, '').replace(/^\//, '');
    }

    private _getHistoryFragment(): string {
        let fragment = decodeURI(window.location.pathname);
        if (this.root !== '/') {
            fragment = fragment.replace(this.root, '');
        }
        return this._trimSlashes(fragment);
    }

    private _getHashFragment(): string {
        const hash = window.location.hash.substring(1).replace(/(\?.*)$/, '');
        return this._trimSlashes(hash);
    }

    private _getFragment(): string {
        return this.mode === 'history' ? this._getHistoryFragment() : this._getHashFragment();
    }

    // -------------------------------------------------------------------------
    // Route rule parsing
    // -------------------------------------------------------------------------

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

    private _getHistoryQuery(): QueryObject {
        return this._parseQuery(window.location.search);
    }

    private _getHashQuery(): QueryObject {
        const index = window.location.hash.indexOf('?');
        const query = index !== -1 ? window.location.hash.substring(index) : '';
        return this._parseQuery(query);
    }

    private _getQuery(): QueryObject {
        return this.mode === 'history' ? this._getHistoryQuery() : this._getHashQuery();
    }

    // -------------------------------------------------------------------------
    // Route management (public API)
    // -------------------------------------------------------------------------

    add(rule: string | RegExp, handler: PageHandler, options?: PageOptions): this {
        this.routes.push({
            rule: this._parseRouteRule(rule),
            handler,
            options,
        });
        return this;
    }

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

    back(): this {
        if (this.mode === 'history') {
            window.history.back();
            return this;
        }
        return this.go(this._historyIdx - 1);
    }

    forward(): this {
        if (this.mode === 'history') {
            window.history.forward();
            return this;
        }
        return this.go(this._historyIdx + 1);
    }

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

    refresh(): this {
        if (!this._currentPage) return this;
        const path = this._currentPage.uri + '?' + this._queryString;
        return this.navigateTo(path, this._currentPage.state);
    }

    // -------------------------------------------------------------------------
    // Route matching & lifecycle
    // -------------------------------------------------------------------------

    private _page404(path: string): void {
        this._currentPage = new Page(path);
        this.notFoundHandler(path);
    }

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

    private _resetState(): void {
        this._skipCheck = true;
        this.navigateTo(this._current, (this._currentPage as Page).state, true);
    }

    private _processUri(): void {
        const fragment = this._getFragment();
        this._current = fragment;
        this._pushHistory();
        const found = this._findRoute();
        if (!found) {
            this._page404(fragment);
        }
    }

    check(): this {
        if (this._skipCheck) return this;
        if (this._currentPage?.options?.unloadCb) {
            this._treatAsync();
        } else {
            this._processUri();
        }
        return this;
    }

    addUriListener(): this {
        if (this.mode === 'history') {
            window.onpopstate = this.check.bind(this);
        } else {
            window.onhashchange = this.check.bind(this);
        }
        return this;
    }

    removeUriListener(): this {
        window.onpopstate = null;
        window.onhashchange = null;
        return this;
    }
}