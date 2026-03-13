import { Router } from './router';
import { Page } from './page';
import type { QueryObject as _QueryObject, PageHandler as _PageHandler } from './types';

// Namespace merges with class Router to expose types under the Router.* prefix.
// Inline type declarations are required (re-export form `export { X }` is not
// permitted inside a namespace when the module uses `export =`).
namespace Router {
    export type QueryObject = _QueryObject;
    export type PageHandler = _PageHandler;

    export interface PageOptions {
        unloadCb?: (page: Page, isAsync: boolean) => boolean | Promise<boolean>;
    }

    export interface Route {
        rule: RegExp;
        handler: Router.PageHandler;
        options?: Router.PageOptions;
    }

    export interface RouterHooks {
        before?: (page: Page) => void;
        after?: (page: Page) => void;
        secure?: (page: Page) => boolean;
    }

    export interface RouterOptions {
        routes?: Array<{ rule: string | RegExp; handler: Router.PageHandler; options?: Router.PageOptions }>;
        mode?: 'history' | 'hash';
        root?: string;
        hooks?: Router.RouterHooks;
        page404?: (path: string) => void;
    }
}

export = Router;