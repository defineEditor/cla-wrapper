import { CdiscLibrary, Variable, Field, DataStructure, Domain, Dataset } from './claWrapper';

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
    /** Additional IDs of a search hit */
    ids: { [name: string]: string };

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
        this.ids = {};
        if (Array.isArray(rawHit.links)) {
            // Search for parent product;
            rawHit.links.forEach(link => {
                if (link.linkName === 'parentProduct' && /\/mdr\/[^/]+\/.+/.test(link.href)) {
                    if (link.href.startsWith('/mdr/ct/') || link.href.startsWith('/mdr/adam/')) {
                        this.ids.productId = link.href.replace(/.*\/(.*)$/, '$1');
                    } else {
                        this.ids.productId = link.href.replace(/.*\/(.*)\/(.*)$/, '$1-$2');
                    }
                } else if (link.linkName.toLowerCase() === 'parentdatastructure' && /\/mdr\/.*\/datastructures\/.+/.test(link.href)) {
                    this.ids.dataStructureId = link.href.replace(/.*\/(.*)$/, '$1');
                } else if (
                    (link.linkName === 'parentVariableSet' && /\/mdr\/.*\/varset\/.+/.test(link.href)) ||
                    (link.linkName === 'parentDomain' && /\/mdr\/.*\/domains\/.+/.test(link.href)) ||
                    (link.linkName === 'parentDataset' && /\/mdr\/.*\/datasets\/.+/.test(link.href))
                ) {
                    this.ids.itemGroupId = link.href.replace(/.*\/(.*)$/, '$1');
                } else if (link.linkName === 'parentClass' && /\/mdr\/.*\/classes\/.+/.test(link.href)) {
                    this.ids.dataClassId = link.href.replace(/.*\/(.*)$/, '$1');
                } else if (link.linkName === 'parentCodelist' && /\/mdr\/.*\/codelists\/.+/.test(link.href)) {
                    this.ids.codeListId = link.href.replace(/.*\/(.*)$/, '$1');
                }
            });
        }
    }

    /**
     * Resolve a search hit
     *
     * @param cl CDISC Library
     */
    async resolve (cl: CdiscLibrary): Promise<Variable|Field|Domain|DataStructure|Dataset> {
        if (this.type === 'Item') {
            const itemGroup = await cl.getItemGroup(this.ids.itemGroupId ?? this.ids.dataStructureId, this.ids.productId) as Domain | DataStructure | Dataset;
            return await itemGroup.getItem(this.rawHit.name);
        }
        if (this.type === 'ItemGroup') {
            return await cl.getItemGroup(this.rawHit.name, this.ids.productId) as Domain | DataStructure | Dataset;
        }
    }
}
