import type { Page } from './page';

export type QueryObject = { [key: string]: boolean | string };
export type PageHandler = (...params: string[]) => void;

export interface PageOptions {
    unloadCb?: (page: Page, isAsync: boolean) => boolean | Promise<boolean>;
}

export interface Route {
    rule: RegExp;
    handler: PageHandler;
    options?: PageOptions;
}

export interface RouterHooks {
    before?: (page: Page) => void;
    after?: (page: Page) => void;
    secure?: (page: Page) => boolean;
}

export interface RouterOptions {
    routes?: Array<{ rule: string | RegExp; handler: PageHandler; options?: PageOptions }>;
    mode?: 'history' | 'hash';
    root?: string;
    hooks?: RouterHooks;
    page404?: (path: string) => void;
}
