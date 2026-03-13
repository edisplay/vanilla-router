import type { QueryObject, PageOptions } from './types';
export declare class Page {
    uri: string;
    query: QueryObject;
    params: string[];
    state: unknown;
    options: PageOptions;
    constructor(uri?: string, query?: QueryObject, params?: string[], state?: unknown, options?: PageOptions);
}
