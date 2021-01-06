export class SearchResponse {
    /**
     * CDISC Library search response.
    */
    /** Indicates whether there are more hits */
    hasMore?: boolean;
    /**  Array with response hits */
    hits: SearchResponseHit[];
    /** Total number of hits */
    totalHits: number;

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    constructor (rawResponse: any) {
        this.hasMore = rawResponse.hasMore;
        this.totalHits = rawResponse.totalHits;
        this.hits = rawResponse.hits.map((rawHit: { [name: string]: any }) => {
            return new SearchResponseHit(rawHit);
        });
    }

    /**
     * Load additional hits;
     * @param rawHits Additional hits from raw search response
     */
    addHits (rawHits: Object[]): void {
        const newHits = rawHits.map((rawHit: { [name: string]: any }) => {
            return new SearchResponseHit(rawHit);
        });

        this.hits = this.hits.concat(newHits);

        if (this.totalHits === this.hits.length) {
            this.hasMore = false;
        }
    }
}

export class SearchResponseHit {
    /**
     * CDISC Library search response hit.
    */
    /** Raw response hit */
    rawHit: { [name: string]: any };
    /** Type of the hit. All item types (e.g., variable or field) are set to Item, item groups (e.g., dataset, domain) */
    /** are set to ItemGroup. Code List -> CodeList, Code List Value -> Coded Value. The rest types are saved as is. */
    type: string;
    /** ID of a product containing the hit */
    productId: string;
    /** In case type = Item, stores the parent item group ID */
    parentItemGroupId: string;

    /*
     * @param {Object} rawHit
     */
    constructor (rawHit: { [name: string]: any }) {
        this.rawHit = rawHit;
        const rawType: string = rawHit.type;
        if (['Analysis Variable', 'Data Collection Field', 'Class Variable', 'SDTM Dataset Variable'].includes(rawType)) {
            this.type = 'Item';
        } else if (['Class', 'SDTM Dataset', 'CDASH Domain', 'Data Structure'].includes(rawType)) {
            this.type = 'ItemGroup';
        } else if (rawType === 'Code List') {
            this.type = 'CodeList';
        } else if (rawType === 'Code List Value') {
            this.type = 'CodedValue';
        } else {
            this.type = rawType;
        }
        if (Array.isArray(rawHit.links)) {
            // Search for parent product;
            rawHit.links.some(link => {
                if (link.linkName === 'parentProduct') {
                    if (/\/mdr\/[^/]+\/^[/]+\/.*/.test(link.href)) {
                        this.productId = link.href.replace(/\/mdr\/[^/]+\/(^[/]+)\/.*/, '$1');
                    }
                }
            });
        }
    }
}
