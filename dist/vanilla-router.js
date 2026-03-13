"use strict";

// src/page.ts
var Page = class {
  /**
   * @param uri     - Matched URI fragment.
   * @param query   - Parsed query string.
   * @param params  - Positional captures from the route pattern.
   * @param state   - State passed to `navigateTo` / `redirectTo`.
   * @param options - Route-level options.
   */
  constructor(uri = "", query = {}, params = [], state = null, options = {}) {
    this.uri = uri;
    this.query = query;
    this.params = params;
    this.state = state;
    this.options = options;
  }
};

// src/router.ts
var Router = class {
  static {
    /** Reference to the {@link Page} class, available as `Router.Page`. */
    this.Page = Page;
  }
  /**
   * Creates a new Router instance.
   *
   * @param options - Optional configuration. Routing mode defaults to
   *   `'history'` when `pushState` is available, otherwise falls back to `'hash'`.
   */
  constructor(options) {
    const settings = this._getSettings(options);
    this.notFoundHandler = settings.page404;
    this.mode = !window.history || !window.history.pushState ? "hash" : settings.mode;
    this.root = settings.root === "/" ? "/" : "/" + this._trimSlashes(settings.root) + "/";
    this.beforeHook = settings.hooks.before;
    this.afterHook = settings.hooks.after;
    this.securityHook = settings.hooks.secure;
    this.routes = [];
    if (settings.routes.length > 0) {
      settings.routes.forEach((route) => {
        this.add(route.rule, route.handler, route.options);
      });
    }
    this._pageState = null;
    this._currentPage = null;
    this._skipCheck = false;
    this._current = "";
    this._queryString = "";
    this._historyStack = [];
    this._historyIdx = 0;
    this._historyState = "add";
  }
  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------
  /**
   * Merges caller-supplied options with defaults and returns a fully-resolved
   * settings object used during construction.
   */
  _getSettings(options) {
    const defaults = {
      routes: [],
      mode: "history",
      root: "/",
      hooks: {
        before: () => {
        },
        after: () => {
        },
        secure: () => true
      },
      page404: (page) => {
        console.error({ page, message: "404. Page not found" });
      }
    };
    const opts = options ?? {};
    return {
      routes: opts.routes ?? defaults.routes,
      mode: opts.mode ?? defaults.mode,
      root: opts.root ?? defaults.root,
      page404: opts.page404 ?? defaults.page404,
      hooks: Object.assign({}, defaults.hooks, opts.hooks ?? {})
    };
  }
  // -------------------------------------------------------------------------
  // URL / fragment helpers
  // -------------------------------------------------------------------------
  /** Strips leading and trailing slashes from `path`. */
  _trimSlashes(path) {
    if (typeof path !== "string") return "";
    return path.replace(/\/$/, "").replace(/^\//, "");
  }
  /** Returns the current URI fragment in `history` mode (pathname minus root). */
  _getHistoryFragment() {
    let fragment = decodeURI(window.location.pathname);
    if (this.root !== "/") {
      fragment = fragment.replace(this.root, "");
    }
    return this._trimSlashes(fragment);
  }
  /** Returns the current URI fragment in `hash` mode (hash minus `#` and query string). */
  _getHashFragment() {
    const hash = window.location.hash.substring(1).replace(/(\?.*)$/, "");
    return this._trimSlashes(hash);
  }
  /** Returns the current URI fragment for whichever routing mode is active. */
  _getFragment() {
    return this.mode === "history" ? this._getHistoryFragment() : this._getHashFragment();
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
  _parseRouteRule(route) {
    if (route instanceof RegExp) return route;
    const uri = this._trimSlashes(route);
    const rule = uri.replace(/([\\\/\-\_\.])/g, "\\$1").replace(/\{[a-zA-Z]+\}/g, "(:any)").replace(/\:any/g, "[\\w\\-\\_\\.]+").replace(/\:word/g, "[a-zA-Z]+").replace(/\:num/g, "\\d+");
    return new RegExp("^" + rule + "$", "i");
  }
  // -------------------------------------------------------------------------
  // Query string helpers
  // -------------------------------------------------------------------------
  /**
   * Parses a query string into a {@link QueryObject}.
   * Also stores the raw string in `_queryString` for use by `refresh()`.
   */
  _parseQuery(query) {
    const result = {};
    if (typeof query !== "string") return result;
    if (query[0] === "?") {
      query = query.substring(1);
    }
    this._queryString = query;
    query.split("&").forEach((row) => {
      const parts = row.split("=");
      if (parts[0] !== "") {
        result[decodeURIComponent(parts[0])] = parts[1] !== void 0 ? parts[1] : true;
      }
    });
    return result;
  }
  /** Returns the parsed query string in `history` mode (`window.location.search`). */
  _getHistoryQuery() {
    return this._parseQuery(window.location.search);
  }
  /** Returns the parsed query string in `hash` mode (the portion after `?` in the hash). */
  _getHashQuery() {
    const index = window.location.hash.indexOf("?");
    const query = index !== -1 ? window.location.hash.substring(index) : "";
    return this._parseQuery(query);
  }
  /** Returns the parsed query string for whichever routing mode is active. */
  _getQuery() {
    return this.mode === "history" ? this._getHistoryQuery() : this._getHashQuery();
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
  add(rule, handler, options) {
    this.routes.push({
      rule: this._parseRouteRule(rule),
      handler,
      options
    });
    return this;
  }
  /**
   * Removes the first route that matches `param`.
   *
   * @param param - The handler function reference, or the original string/RegExp pattern used in `add()`.
   * @returns `this` for chaining.
   */
  remove(param) {
    const paramStr = typeof param === "string" ? this._parseRouteRule(param).toString() : null;
    this.routes.some((route, i) => {
      if (typeof param === "function" && route.handler === param || route.rule.toString() === paramStr) {
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
  reset() {
    this.routes = [];
    this.mode = null;
    this.root = "/";
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
  _pushHistory() {
    const fragment = this._getFragment();
    if (this.mode === "hash") {
      if (this._historyState === "add") {
        if (this._historyIdx !== this._historyStack.length - 1) {
          this._historyStack.splice(this._historyIdx + 1);
        }
        this._historyStack.push({ path: fragment, state: this._pageState });
        this._historyIdx = this._historyStack.length - 1;
      }
      this._historyState = "add";
    }
  }
  /**
   * Navigates one step backward in browser history.
   * Delegates to `window.history.back()` in `history` mode, or to `go()` in `hash` mode.
   *
   * @returns `this` for chaining.
   */
  back() {
    if (this.mode === "history") {
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
  forward() {
    if (this.mode === "history") {
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
  go(count) {
    if (this.mode === "history") {
      window.history.go(count);
      return this;
    }
    const page = this._historyStack[count];
    if (!page) return this;
    this._historyIdx = count;
    this._historyState = "hold";
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
  navigateTo(path, state, silent) {
    path = this._trimSlashes(path) || "";
    this._pageState = state ?? null;
    this._skipCheck = !!silent;
    if (this.mode === "history") {
      window.history.pushState(state, "", this.root + this._trimSlashes(path));
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
  redirectTo(path, state, silent) {
    path = this._trimSlashes(path) || "";
    this._pageState = state ?? null;
    this._skipCheck = !!silent;
    if (this.mode === "history") {
      window.history.replaceState(state, "", this.root + this._trimSlashes(path));
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
  refresh() {
    if (!this._currentPage) return this;
    const path = this._currentPage.uri + "?" + this._queryString;
    return this.navigateTo(path, this._currentPage.state);
  }
  // -------------------------------------------------------------------------
  // Route matching & lifecycle
  // -------------------------------------------------------------------------
  /**
   * Invokes `notFoundHandler` for `path` and sets it as the current page.
   */
  _page404(path) {
    this._currentPage = new Page(path);
    this.notFoundHandler(path);
  }
  /**
   * Resolves the unload callback of the current page.
   *
   * @param asyncRequest - When `true`, always returns a Promise.
   * @returns `true` / `Promise<true>` if navigation is allowed; `false` / rejected Promise to block it.
   */
  _unloadCallback(asyncRequest) {
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
  _findRoute() {
    const fragment = this._getFragment();
    return this.routes.some((route) => {
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
      window.onbeforeunload = (ev) => {
        if (this._unloadCallback(false)) return;
        ev.returnValue = "";
        return "";
      };
      return true;
    });
  }
  /**
   * Handles navigation away from a page that has an async `unloadCb`.
   * Resolves the callback as a Promise, then either proceeds with `_processUri`
   * or rolls back to the previous URL via `_resetState`.
   */
  _treatAsync() {
    if (!this._currentPage?.options?.unloadCb) return;
    let result = this._currentPage.options.unloadCb(this._currentPage, true);
    if (!(result instanceof Promise)) {
      result = result ? Promise.resolve(result) : Promise.reject(result);
    }
    result.then(this._processUri.bind(this)).catch(this._resetState.bind(this));
  }
  /**
   * Rolls back navigation by silently navigating to the previously active
   * URL when an `unloadCb` rejects.
   */
  _resetState() {
    this._skipCheck = true;
    this.navigateTo(this._current, this._currentPage.state, true);
  }
  /**
   * Core navigation step: records the fragment in history, then calls
   * `_findRoute()`. Falls through to `_page404` when no route matches.
   */
  _processUri() {
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
  check() {
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
  addUriListener() {
    if (this.mode === "history") {
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
  removeUriListener() {
    window.onpopstate = null;
    window.onhashchange = null;
    return this;
  }
};

// src/index.ts
module.exports = Router;
