import type { QueryObject, PageOptions } from './types';

export class Page {
    uri: string;
    query: QueryObject;
    params: string[];
    state: unknown;
    options: PageOptions;

    constructor(
        uri: string = '',
        query: QueryObject = {},
        params: string[] = [],
        state: unknown = null,
        options: PageOptions = {}
    ) {
        this.uri = uri;
        this.query = query;
        this.params = params;
        this.state = state;
        this.options = options;
    }
}
