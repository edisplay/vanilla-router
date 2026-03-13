"use strict";

// src/page.ts
var Page = class {
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
    this.Page = Page;
  }
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
  _trimSlashes(path) {
    if (typeof path !== "string") return "";
    return path.replace(/\/$/, "").replace(/^\//, "");
  }
  _getHistoryFragment() {
    let fragment = decodeURI(window.location.pathname);
    if (this.root !== "/") {
      fragment = fragment.replace(this.root, "");
    }
    return this._trimSlashes(fragment);
  }
  _getHashFragment() {
    const hash = window.location.hash.substring(1).replace(/(\?.*)$/, "");
    return this._trimSlashes(hash);
  }
  _getFragment() {
    return this.mode === "history" ? this._getHistoryFragment() : this._getHashFragment();
  }
  // -------------------------------------------------------------------------
  // Route rule parsing
  // -------------------------------------------------------------------------
  _parseRouteRule(route) {
    if (route instanceof RegExp) return route;
    const uri = this._trimSlashes(route);
    const rule = uri.replace(/([\\\/\-\_\.])/g, "\\$1").replace(/\{[a-zA-Z]+\}/g, "(:any)").replace(/\:any/g, "[\\w\\-\\_\\.]+").replace(/\:word/g, "[a-zA-Z]+").replace(/\:num/g, "\\d+");
    return new RegExp("^" + rule + "$", "i");
  }
  // -------------------------------------------------------------------------
  // Query string helpers
  // -------------------------------------------------------------------------
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
  _getHistoryQuery() {
    return this._parseQuery(window.location.search);
  }
  _getHashQuery() {
    const index = window.location.hash.indexOf("?");
    const query = index !== -1 ? window.location.hash.substring(index) : "";
    return this._parseQuery(query);
  }
  _getQuery() {
    return this.mode === "history" ? this._getHistoryQuery() : this._getHashQuery();
  }
  // -------------------------------------------------------------------------
  // Route management (public API)
  // -------------------------------------------------------------------------
  add(rule, handler, options) {
    this.routes.push({
      rule: this._parseRouteRule(rule),
      handler,
      options
    });
    return this;
  }
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
  back() {
    if (this.mode === "history") {
      window.history.back();
      return this;
    }
    return this.go(this._historyIdx - 1);
  }
  forward() {
    if (this.mode === "history") {
      window.history.forward();
      return this;
    }
    return this.go(this._historyIdx + 1);
  }
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
  refresh() {
    if (!this._currentPage) return this;
    const path = this._currentPage.uri + "?" + this._queryString;
    return this.navigateTo(path, this._currentPage.state);
  }
  // -------------------------------------------------------------------------
  // Route matching & lifecycle
  // -------------------------------------------------------------------------
  _page404(path) {
    this._currentPage = new Page(path);
    this.notFoundHandler(path);
  }
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
  _treatAsync() {
    if (!this._currentPage?.options?.unloadCb) return;
    let result = this._currentPage.options.unloadCb(this._currentPage, true);
    if (!(result instanceof Promise)) {
      result = result ? Promise.resolve(result) : Promise.reject(result);
    }
    result.then(this._processUri.bind(this)).catch(this._resetState.bind(this));
  }
  _resetState() {
    this._skipCheck = true;
    this.navigateTo(this._current, this._currentPage.state, true);
  }
  _processUri() {
    const fragment = this._getFragment();
    this._current = fragment;
    this._pushHistory();
    const found = this._findRoute();
    if (!found) {
      this._page404(fragment);
    }
  }
  check() {
    if (this._skipCheck) return this;
    if (this._currentPage?.options?.unloadCb) {
      this._treatAsync();
    } else {
      this._processUri();
    }
    return this;
  }
  addUriListener() {
    if (this.mode === "history") {
      window.onpopstate = this.check.bind(this);
    } else {
      window.onhashchange = this.check.bind(this);
    }
    return this;
  }
  removeUriListener() {
    window.onpopstate = null;
    window.onhashchange = null;
    return this;
  }
};

// src/index.ts
module.exports = Router;
