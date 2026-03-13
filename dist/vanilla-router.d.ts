import { Router } from './router';
import { Page } from './page';
import type { QueryObject as _QueryObject, PageHandler as _PageHandler } from './types';
declare namespace Router {
    type QueryObject = _QueryObject;
    type PageHandler = _PageHandler;
    interface PageOptions {
        unloadCb?: (page: Page, isAsync: boolean) => boolean | Promise<boolean>;
    }
    interface Route {
        rule: RegExp;
        handler: Router.PageHandler;
        options?: Router.PageOptions;
    }
    interface RouterHooks {
        before?: (page: Page) => void;
        after?: (page: Page) => void;
        secure?: (page: Page) => boolean;
    }
    interface RouterOptions {
        routes?: Array<{
            rule: string | RegExp;
            handler: Router.PageHandler;
            options?: Router.PageOptions;
        }>;
        mode?: 'history' | 'hash';
        root?: string;
        hooks?: Router.RouterHooks;
        page404?: (path: string) => void;
    }
}
export = Router;
