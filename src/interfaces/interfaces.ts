/**
 * Functions handling cache.
 */
export interface ClCache {
    /** Returns a Promise that resolves to the response associated with the matching request. */
    match: (req: Request) => Promise<Request>;
    /**
     * Takes both a request and its response and adds it to the given cache.
     * Response must contain the body attribute.
     * Do not create connection attribute in the cached response, in order to avoid traffic count.
     */
    put: (req: Request, res: Response) => Promise<any>;
}

/**
 * MatchingOptions
 */
export interface MatchingOptions {
    /** Match only full names, partial - match partial names. */
    mode: 'full' | 'partial';
    /** If true, returns only the first matching item, when false - returns all matching items. */
    firstOnly: boolean;
}

/**
 * GetItemGroupOptions
 */
export interface GetItemGroupOptions {
    /** Specifies the output format. Possible values: json, csv. */
    format?: 'csv' | 'json';
}

/**
 * GetItemGroupsOptions
 */
export interface GetItemGroupsOptions {
    /** Specifies whether a short or full description of itemGroups is required. Possible values: short, long (default). */
    type?: 'short' | 'long';
    /** Specifies the output format. Possible values: json, csv. */
    format?: 'csv' | 'json';
}

/**
 * Information about traffic used by the wrapper
*/
export interface Traffic {
    /** Inbound traffic. */
    incoming: number;
    /** Outbound traffic. */
    outgoing: number;
}

/**
 * Request options.
 */
export interface ApiRequestOptions {
    /** Additional headers for the request. */
    headers?: object;
    /** If true, a raw response is returned. By default the response body is returned. */
    returnRaw?: boolean;
    /** If true, cache will not be used for that request. */
    noCache?: boolean;
}

export interface ProductDetailsShort {
    id: string;
    label: string;
}

export interface ProductDetailsLong {
    [name: string]: any;
}

export type ProductDetails =
    ProductDetailsShort |
    ProductDetailsLong
;

/**
 * Product dependency.
 */
export interface ProductDependency {
    id: string;
    href: string;
    title: string;
    class: string;
}

/**
 * CodeList Term.
 */
export interface Term {
    conceptId: string;
    submissionValue: string;
    definition: string;
    preferredTerm: string;
    synonyms: string[];
}

/**
 * Parameters for search.
 */
export interface SearchParameters {
    query: string;
    scopes: object;
    loadAll: boolean;
    start?: number;
    pageSize?: number;
    highlights?: string[];
}