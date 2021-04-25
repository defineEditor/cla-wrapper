/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import qs from 'qs';
import xmlParser from 'fast-xml-parser';
import { SearchResponse } from '../classes/searchResponse';
import apiRequest from '../utils/apiRequest';
import convertToFormat from '../utils/convertToFormat';
import matchItem from '../utils/matchItem';
import toSimpleObject from '../utils/toSimpleObject';
import {
    MatchingOptions, GetItemGroupOptions, GetItemGroupsOptions, ClCache,
    Traffic, Term, ApiRequestOptions, ProductDetails, ProductDependency, SearchParameters
} from '../interfaces/interfaces';

const defaultMatchingOptions: MatchingOptions = { mode: 'full', firstOnly: false };
const defaultGetItemGroupOptions: GetItemGroupOptions = {};
const defaultGetItemGroupsOptions: GetItemGroupsOptions = { type: 'long' };

// Interfaces
interface AnalysisVariableSets {
    [name: string]: AnalysisVariableSet;
}
interface ProductClasses {
    [name: string]: ProductClass;
}
type ItemGroupType = Domain|DataStructure|Dataset;
interface ItemGroups {
    [name: string]: ItemGroupType;
}
export type ItemType = Variable | Field;
interface Items {
    [name: string]: ItemType;
}
type ContentEncoding = 'gzip' | 'compress' | 'deflate' | 'br';

/**
 * CoreObject constructor parameters.
 */
interface CoreObjectParameters {
    apiKey?: string;
    baseUrl?: string;
    cache?: ClCache;
    traffic?: Traffic;
    useNciSiteForCt?: boolean;
    nciSiteUrl?: string;
    contentEncoding?: ContentEncoding;
}

export class CoreObject {
    /**
     * CDISC Library Core Object which contains API request functions and technical information.
    */
    /**  CDISC Library API primary key. Used in case of OAuth2 Authentication. */
    apiKey?: string;
    /**  A base URL for the library. */
    baseUrl?: string;
    /** @ApiRequestOptions */
    cache?: ClCache;
    /** @Traffic */
    traffic?: Traffic;
    /**  If true, CT is downloaded from NCI site. */
    useNciSiteForCt?: boolean;
    /**  NCI site URL */
    nciSiteUrl?: string;
    /** Add Content-Encoding to request headers. See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding */
    contentEncoding?: ContentEncoding;

    constructor ({
        apiKey,
        baseUrl = 'https://library.cdisc.org/api',
        cache,
        traffic,
        useNciSiteForCt = false,
        nciSiteUrl = 'https://evs.nci.nih.gov/ftp1/CDISC',
        contentEncoding,
    }: CoreObjectParameters) {
        this.apiKey = apiKey;
        this.cache = cache;
        this.baseUrl = baseUrl;
        if (traffic !== undefined) {
            this.traffic = traffic;
        } else {
            this.traffic = {
                incoming: 0,
                outgoing: 0
            };
        }
        this.useNciSiteForCt = useNciSiteForCt;
        this.nciSiteUrl = nciSiteUrl;
        this.contentEncoding = contentEncoding;
    }

    /**
     * Make an API request
     *
     * @param endpoint CDISC Library API endpoint.
     * @param __namedParameters Request options {@link ApiRequestOptions}.
     * @returns API response, if API request failed a blank object is returned.
     */

    async apiRequest (endpoint: string, { headers, returnRaw = false, noCache = false }: ApiRequestOptions = {}): Promise<any> {
        // Default options
        try {
            const response: any = await apiRequest({
                apiKey: this.apiKey,
                baseUrl: this.baseUrl,
                endpoint: endpoint,
                headers,
                cache: noCache ? undefined : this.cache,
                useNciSiteForCt: this.useNciSiteForCt,
                nciSiteUrl: this.nciSiteUrl,
                contentEncoding: this.contentEncoding,
            });
            // Count traffic
            if (response.connection !== undefined) {
                this.traffic.incoming += response.connection.bytesRead;
                this.traffic.outgoing += response.connection.bytesWritten;
            }
            if (returnRaw) {
                return response;
            }
            if (response.statusCode === 200) {
                if (response.headers['content-type'].includes('application/json')) {
                    return JSON.parse(response.body);
                } else {
                    return response.body;
                }
            } else if (response.statusCode > 0) {
                throw new Error('Request failed with code: ' + response.statusCode);
            } else {
                throw new Error('Request failed');
            }
        } catch (error) {
            if (returnRaw) {
                return { statusCode: -1, description: 'Request failed' };
            } else {
                return {};
            }
        }
    }
}

abstract class BasicFunctions {
    /**
     * Functions used in multiple classes
     */
    /** CDISC Library API endpoint. */
    href?: string;
    /** CLA Wrapper attribute. Object used to send API requests and store technical information. Must be the same object for all classes within an instance of a CdiscLibrary class. */
    coreObject: CoreObject;

    /**
     * Parse API response as an object
    */
    abstract parseResponse (response: any, id?: any): void;

    /**
     * Get raw API response
     *
     * @param href CDISC Library API endpoint. If not specified, href attribute of the object is used.
     * @returns Returns a JSON response if the request was successfull, otherwise returns undefined.
     */
    async getRawResponse (href?: string): Promise<object|undefined> {
        let link = href;
        if (href === undefined && this.href !== undefined) {
            link = this.href;
        }
        if (this.coreObject !== undefined && link !== undefined) {
            const response = await this.coreObject.apiRequest(link);
            if (typeof response === 'object') {
                return response;
            }
        }
    }

    /**
     * Load object from the CDISC Library
     *
     * @param href CDISC Library API endpoint. If not specified, href attribute of the object is used.
     * @returns Returns true in the object was successfully loaded, false otherwise
     */
    async load (href?: string): Promise<boolean> {
        const response = await this.getRawResponse(href);
        if (response === undefined) {
            return false;
        } else {
            this.parseResponse(response);
            return true;
        }
    }

    /**
     * Convert class to a simple object, removes methods and technical elements (e.g., coreObject).
     *
     * @returns {Object} A new object
     */
    toSimpleObject (): any {
        return toSimpleObject(this);
    }
}

/**
 * CdiscLibrary constructor parameters.
 */
interface CdiscLibraryParameters extends CoreObjectParameters {
    productClasses?: ProductClasses;
}

export class CdiscLibrary {
    /**
     * CDISC Library Main class
    */

    /** CLA Wrapper attribute. {@link CoreObject} */
    coreObject: CoreObject;
    /** An object with product classes. */
    productClasses: ProductClasses;

    constructor ({ apiKey, baseUrl, cache, traffic, productClasses, useNciSiteForCt, nciSiteUrl }: CdiscLibraryParameters = {}) {
        this.coreObject = new CoreObject({ apiKey, baseUrl, cache, traffic, useNciSiteForCt, nciSiteUrl });
        this.productClasses = productClasses;
    }

    /**
     * Checks connection to the CDISC Library API
     *
     * @returns Returns response status code and description
     */
    async checkConnection (): Promise<object> {
        let response;
        let result: {
            statusCode: number;
            description?: string;
        };
        try {
            response = await this.coreObject.apiRequest('/mdr/lastupdated', { returnRaw: true, noCache: true });
            result = { statusCode: response.statusCode };
        } catch (error) {
            response = { statusCode: -1, description: error.message };
        }
        if (response.statusCode === 200) {
            let data;
            try {
                data = JSON.parse(response.body);
                if (data.overall !== undefined) {
                    result.description = 'OK';
                } else {
                    result.statusCode = -1;
                    result.description = 'Could not connect';
                }
            } catch (error) {
                result.statusCode = -1;
                result.description = 'Check valid Basa URL is used';
            }
        } else if (response.statusCode === 401) {
            result.description = 'Authentication failed';
        } else if (response.statusCode === 404) {
            result.description = 'Resource not found';
        } else {
            result.description = 'Unknown';
        }
        return result;
    }

    /**
     * Get the latest update date
     *
     * @returns Returns object with update dates
     */
    async getLastUpdated (): Promise<object> {
        let response;
        let result: any = {};
        try {
            response = await this.coreObject.apiRequest('/mdr/lastupdated', { noCache: true });
            if (response !== undefined) {
                result = response;
                if (result._links !== undefined) {
                    delete result._links;
                }
            }
        } catch (error) {
            return result;
        }
        return result;
    }

    /**
     * Get product classes
     *
     * @returns Product classes
     */
    async getProductClasses (): Promise<ProductClasses> {
        if (this.productClasses !== undefined) {
            return this.productClasses;
        }
        const productClasses: ProductClasses = {};
        const dataRaw = await this.coreObject.apiRequest('/mdr/products');
        if (dataRaw.hasOwnProperty('_links')) {
            Object.keys(dataRaw._links).forEach(pcId => {
                if (pcId !== 'self') {
                    const pcRaw = dataRaw._links[pcId];
                    productClasses[pcId] = new ProductClass({ coreObject: this.coreObject });
                    productClasses[pcId].parseResponse(pcRaw, pcId);
                }
            });
            this.productClasses = productClasses;
        }
        return productClasses;
    }

    /**
     * Get a list of product class names
     *
     * @returns Array of product class names
     */
    async getProductClassList (): Promise<string[]> {
        if (this.productClasses) {
            return Object.keys(this.productClasses);
        } else {
            return Object.keys(await this.getProductClasses());
        }
    }

    /**
     * Get a list of product group names
     *
     * @returns Array of product group names
     */
    async getProductGroupList (): Promise<string[]> {
        let result: string[] = [];
        const pcList = await this.getProductClassList();
        pcList.forEach(pcId => {
            result = result.concat(this.productClasses[pcId].getProductGroupList());
        });
        return result;
    }

    /**
     * Get product group
     *
     * @param name Valid product group name.
     * @returns Product group or a blank
     */
    async getProductGroup (name: string): Promise<ProductGroup> {
        let result: ProductGroup;
        const pcList: string[] = await this.getProductClassList();
        pcList.some(pcId => {
            const tempRes = this.productClasses[pcId].getProductGroup(name);
            if (tempRes !== undefined) {
                result = tempRes;
                return true;
            }
            return false;
        });
        return result;
    }

    /**
     * Get a list of product IDs
     *
     * @param format Specifies the output format. Possible values: json, csv.
     * @returns List of product names (IDs)
     */
    async getProductList (format: 'json' | 'csv' = 'json'): Promise<string[] | string[]> {
        let result: string[] = [];
        const pcList = await this.getProductClassList();
        pcList.forEach(pcId => {
            result = result.concat(this.productClasses[pcId].getProductList() as string[]);
        });
        return convertToFormat(result, format);
    }

    /**
     * Get an object with a loaded product
     *
     * @param alias Product alias. Examples: sdtmig3-3, sdtm1.7, adamig11.
     * @param loadBasicInfo If true, will load only basic product details. By default a full product is loaded.
     * @returns Product
     */
    async getFullProduct (alias: string, loadBasicInfo?: boolean): Promise<any> {
        let result;
        const pcs = await this.getProductClasses();
        // Get IDs
        const productFullId = await this.getProductIdByAlias(alias);
        if (productFullId) {
            const pgs = pcs[productFullId.productClassId].productGroups;
            const pg = pgs[productFullId.productGroupId];
            if (loadBasicInfo) {
                result = pg.products[productFullId.productId];
            } else {
                result = await pg.getFullProduct(productFullId.productId);
            }
        }
        return result;
    }

    /**
     * Get a dataset/dataStructure/domain for a specific product
     *
     * @param name Dataset name.
     * @param productAlias Product name alias. Examples: sdtmig3-3, sdtm1.7, adamig11.
     * @param options @GetItemGroupOptions
     * @returns Dataset/DataStructure/Domain
     */
    async getItemGroup (name: string, productAlias: string, options?: GetItemGroupOptions): Promise<ItemGroupType|string> {
        let result;
        const defaultedOptions = { ...defaultGetItemGroupOptions, ...options };
        if (!this.productClasses) {
            await this.getProductClasses();
        }
        for (const productClass of Object.values(this.productClasses)) {
            result = await productClass.getItemGroup(name, productAlias, defaultedOptions);
            if (result !== undefined) {
                break;
            }
        }
        return result;
    }

    /**
     * Get an object with all datasets/domains/dataStructure for a specific product
     * <br> This method does not update the main object
     *
     * @param productAlias Product alias
     * @param options @GetItemGroupsOptions
     * @returns An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the itemGroup information from the CDISC Library.
     */
    async getItemGroups (productAlias: string, options: GetItemGroupsOptions): Promise<ItemGroups> {
        const defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        let result;
        if (!this.productClasses) {
            await this.getProductClasses();
        }
        for (const productClass of Object.values(this.productClasses)) {
            result = await productClass.getItemGroups(productAlias, defaultedOptions);
            if (result !== undefined) {
                break;
            }
        }
        return result;
    }

    /**
     * Get an object with all datasets/domains/dataStructure/codelists
     *
     * @param options Detail options
     * @param [options.type=short] Short/extended list of product attributes. Possible values: short, long
     * @param [options.format=json] Output format. Possible values: json, csv.
     * @returns Product list with details
     */
    async getProductDetails ({ type = 'short', format = 'json' }: GetItemGroupsOptions = {}): Promise<ProductDetails[]> {
        const result: Array<string|object> = [];
        const productClasses = await this.getProductClasses();
        Object.values(productClasses).forEach((pc: ProductClass) => {
            Object.values(pc.getProductGroups()).forEach((pg: ProductGroup) => {
                Object.values(pg.getProducts()).forEach((product: any) => {
                    const productDetails: ProductDetails = {};
                    if (type === 'short') {
                        productDetails.id = product.id;
                        productDetails.label = product.label;
                    } else if (type === 'long') {
                        for (const prop in product) {
                            // Remove all properties, which are objects or undefined
                            if (typeof product[prop] !== 'object' || product[prop] === undefined) {
                                productDetails[prop] = product[prop];
                            }
                        }
                    }
                    result.push(productDetails);
                });
            });
        });
        return convertToFormat(result, format);
    }

    /**
     * Get Terminology information from NCI site
     *
     * @param folderList NCI of paths on the NCI site to scan. The paths are relative to ftp1/CDISC/.
     * @returns Object with of packages
     */
    async getCTFromNCISite (pathList = [
        '/SDTM/Archive/',
        '/ADaM/Archive/',
        '/Define-XML/Archive/',
        '/SEND/Archive/',
        '/Protocol/Archive/',
        '/Glossary/Archive/'
    ]): Promise<{[name: string]: Product}> {
        if (!this.coreObject.useNciSiteForCt) {
            throw Error('getCTFromNCISite function requires useNciSiteForCt set to true.');
        }
        const result: { [name: string]: Product } = {};
        await Promise.all(pathList.map(async (path) => {
            const rawHtml = await this.coreObject.apiRequest('/nciSite/' + path);
            // Keep only odm.xml
            const aTags = rawHtml.matchAll(/<a\s*href=".*?">.*?Terminology\s*\d{4}-\d{2}-\d{2}.odm.xml\s*<\/a>/g);
            for (const tag of aTags) {
                const name: string = tag[0].replace(/<a\s*href=".*?">(.*?)\s*Terminology\s*\d{4}-\d{2}-\d{2}.odm.xml\s*<\/a>/,'$1');
                const version: string = tag[0].replace(/<a\s*href=".*?">.*?Terminology\s*(\d{4}-\d{2}-\d{2}).odm.xml\s*<\/a>/,'$1');
                let idName: string;
                if (name === 'CDISC Glossary') {
                    idName = 'glossary';
                } else {
                    idName = name.toLowerCase();
                }
                const id = `${idName}ct-${version}`;
                const label = `${name} Controlled Terminology Effective ${version}`;
                const model = path.replace(/^\/(.*?)\/.*/, '$1');
                const ct = new Product({
                    id,
                    href: `/mdr/ct/packages/${id}`,
                    datasetType: 'codelists',
                    type: 'Terminology',
                    label,
                    model,
                    version,
                });
                result[id] = ct;
            }
        }));
        // Check if structure is already created;
        if (this.productClasses?.terminology?.productGroups?.packages?.products !== undefined) {
            this.productClasses.terminology.productGroups.packages.products = result;
        } else {
            this.productClasses = {
                terminology: new ProductClass({
                    name: 'terminology',
                    productGroups: {
                        packages: new ProductGroup({
                            name: 'packages',
                            products: result
                        })
                    }
                })
            };
        }
        return result;
    }

    /**
     * Get traffic used by the current insurance of the CdiscLibrary class
     *
     * @param type Type of the traffic. Possible values: all, incoming, outgoin.
     * @param format Output format. If char is used, the result will be returned in a human-readable format (34kb, 5.3MB). Possible values: char, num.
     * @returns Traffic used in a human-readable format or number of bytes
     */
    getTrafficStats (type: 'all' | 'incoming' | 'outgoing' = 'all', format: 'char' | 'num' = 'char'): string|number {
        const byteUnits = [' kB', ' MB', ' GB', ' TB', 'PB', 'EB', 'ZB', 'YB'];
        let traffic = 0;

        if (type === 'all') {
            traffic = this.coreObject.traffic.incoming + this.coreObject.traffic.outgoing;
        } else if (type === 'incoming') {
            traffic = this.coreObject.traffic.incoming;
        } else if (type === 'outgoing') {
            traffic = this.coreObject.traffic.outgoing;
        }

        if (format === 'num') {
            return traffic;
        } else {
            let i = -1;
            do {
                traffic = traffic / 1024;
                i++;
            } while (traffic > 1024);

            if (traffic === 0) {
                return '0 bytes';
            } else {
                return Math.max(traffic, 0.1).toFixed(1) + byteUnits[i];
            }
        }
    }

    /**
     * Get a product, product group, product class IDs by alias or substring, e.g., adamig11 agamig1-1 adamig1.1 will return { productClassId: 'data-analysis', productGroupId: 'adam', productId: 'adamig-1-1' }.
     *
     * @param name Product name alias
     * @returns Product, product group, product class IDs
     */
    async getProductIdByAlias (alias: string): Promise<{productClassId: string; productGroupId: string; productId: string}|undefined> {
        let result;
        let productClasses = this.productClasses;
        if (!productClasses) {
            productClasses = await this.getProductClasses();
        }
        Object.keys(productClasses).some(pcId => {
            const res = productClasses[pcId].getProductIdByAlias(alias);
            if (res) {
                result = { productClassId: pcId, ...res };
                return true;
            }
            return false;
        });
        return result;
    }

    /**
     * Reset CDISC Library
     */
    reset (): void {
        delete this.productClasses;
        this.productClasses = undefined;
    }

    /**
     * Search.
     *
     * @param params Object with search parameters
     * @param params.query Query for search
     * @param params.scopes Object with scopes (e.g., { product: 'ADaMIG v1.1' })
     * @param params.loadAll [true] Load all hits. If set to false only the number of hits specified in pageSize will be loaded.
     * @param params.pageSize Search result page size
     * @param params.highlights Array of strings to highlight
     * @param params.start Search start
     * @param params.pageSize Search result page size
     * @returns Search response with array of hits.
     */
    async search (params: SearchParameters): Promise<SearchResponse> {
        const { query, scopes = {}, highlights } = params;
        const searchParams = {
            q: query,
            ...scopes,
            highlights,
            start: params.start || 0,
            pageSize: params.pageSize || 250,
        };
        const loadAll = params.loadAll ?? true;

        let result: SearchResponse;

        const href = '/mdr/search?' + qs.stringify(searchParams);
        let rawResult = await this.coreObject.apiRequest(href);
        if (Object.keys(rawResult).length > 0) {
            result = new SearchResponse(rawResult);
        } else {
            throw Error('Search request failed.');
        }

        if (loadAll && rawResult.hasMore === true) {
            searchParams.start = searchParams.start + searchParams.pageSize;
            searchParams.pageSize = result.totalHits - searchParams.pageSize;
            const href = '/mdr/search?' + qs.stringify(searchParams);
            rawResult = await this.coreObject.apiRequest(href);
            result.addHits(rawResult.hits);
        }

        return result;
    }

    /** Get a list of scopes
     * @returns Array of scope names.
     */
    async getScopeList (): Promise<{ [name: string]: string }> {
        const result = await this.coreObject.apiRequest('/mdr/search/scopes');
        return result.scopes;
    }

    /**
     * Get search scope.
     *
     * @param name Name of the scope to retrive.
     * @returns List of values for the scope.
     */
    async getScope (name: string): Promise<string[]> {
        const rawResult = await this.coreObject.apiRequest('/mdr/search/scopes/' + name);
        return rawResult.values;
    }
}

/**
 * Product class
 */
export class ProductClass extends BasicFunctions {
    /** Product class name. */
    name: string;
    /** An object with Product Groups. */
    productGroups: { [name: string]: ProductGroup };
    constructor ({ name, productGroups, coreObject }: { name?: string; productGroups?: { [name: string]: ProductGroup }; coreObject?: CoreObject } = {}) {
        super();
        this.name = name;
        this.productGroups = productGroups;
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to product classes
     *
     * @param name Product class name.
     * @param pcRaw Raw CDISC API response.
     */
    parseResponse (pcRaw: any, name: string): void {
        this.name = name;
        const productGroups: { [name: string]: ProductGroup } = {};
        if (pcRaw.hasOwnProperty('_links')) {
            Object.keys(pcRaw._links).forEach(pgId => {
                if (pgId !== 'self') {
                    const pgRaw = pcRaw._links[pgId];
                    productGroups[pgId] = new ProductGroup({ coreObject: this.coreObject });
                    productGroups[pgId].parseResponse(pgRaw, pgId);
                }
            });
        }
        this.productGroups = productGroups;
    }

    /**
     * Get an object with product groups
     *
     * @returns {Object} Product groups
     */
    getProductGroups (): { [name: string]: ProductGroup } {
        if (this.productGroups) {
            return this.productGroups;
        } else {
            return {};
        }
    }

    /**
     * Get a list of product group names
     *
     * @returns {Array} Array of product group names
     */
    getProductGroupList (): string[] {
        if (this.productGroups) {
            return Object.keys(this.productGroups);
        } else {
            return [];
        }
    }

    /**
     * Get a product group
     *
     * @param name Valid product group name.
     * @returns Product group or a blank
     */
    getProductGroup (name: string): ProductGroup {
        let result: ProductGroup;
        const pgList: string[] = this.getProductGroupList();
        pgList.some(pgId => {
            if (pgId.toLowerCase() === name.toLowerCase()) {
                result = this.productGroups[pgId];
                return true;
            }
            return false;
        });
        return result;
    }

    /**
     * Get a list of product IDs
     *
     * @param Specifies the output format. Possible values: json, csv.
     * @returns List of product names (IDs)
     */
    getProductList (format: 'json' | 'csv' = 'json'): object | string {
        let result: string[] = [];
        const pgList = this.getProductGroupList();
        pgList.forEach(pgId => {
            result = result.concat(this.getProductGroups()[pgId].getProductList() as string[]);
        });
        return convertToFormat(result, format);
    }

    /**
     * Get a dataset/dataStructure/domain for a specific product
     *
     * @param name Dataset name
     * @param productAlias  Product name alias. Examples: sdtmig3-3, sdtm1.7, adamig11.
     * @param options @GetItemGroupOptions
     * @returns Dataset/DataStruture/Domain
     */
    async getItemGroup (name: string, productAlias: string, options: GetItemGroupOptions): Promise<ItemGroupType|string> {
        let result;
        const defaultedOptions = { ...defaultGetItemGroupOptions, ...options };
        for (const productGroup of Object.values(this.productGroups)) {
            result = await productGroup.getItemGroup(name, productAlias, defaultedOptions);
            if (result !== undefined) {
                break;
            }
        }
        return result;
    }

    /**
     * Get an object with all datasets/domains/dataStructure
     * <br> This method does not update the main object
     *
     * @param productAlias Product alias
     * @param options @GetItemGroupsOptions
     * @returns An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the dataset information from the CDISC Library.
     */
    async getItemGroups (productAlias: string, options: GetItemGroupsOptions): Promise<ItemGroups> {
        const defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        let result;
        for (const productGroup of Object.values(this.productGroups)) {
            result = await productGroup.getItemGroups(productAlias, defaultedOptions);
            if (result !== undefined) {
                break;
            }
        }
        return result;
    }

    /**
     * Get a product, product group IDs by alias or substring, e.g., adamig11 agamig1-1 adamig1.1 will return { productGroupId: 'adam', productId: 'adamig-1-1' }.
     *
     * @param alias Product name alias
     * @returns Product and product group IDs
     */
    getProductIdByAlias (alias: string): { productGroupId: string; productId: string } | undefined {
        let result;
        const productGroups = this.getProductGroups();
        Object.keys(productGroups).some(pgId => {
            const res = productGroups[pgId].getProductIdByAlias(alias);
            if (res !== undefined) {
                result = { productGroupId: pgId, ...res };
                return true;
            }
            return false;
        });
        return result;
    }
}

/**
 * Product Group class
 */
export class ProductGroup extends BasicFunctions {
    /** Product group name. */
    name: string;
    /** An object with products. */
    products: { [name: string]: Product };
    constructor ({ name, products = {}, coreObject }: { name?: string; products?: { [name: string]: Product }; coreObject?: CoreObject } = {}) {
        super();
        this.name = name;
        this.products = products;
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to product groups
     *
     * @param name name
     * @param pgRaw Raw CDISC API response
     */
    parseResponse (pgRaw: object[], name: string): void {
        this.name = name;
        const products: { [name: string]: Product } = {};
        pgRaw.forEach(gRaw => {
            const product = new Product({ ...gRaw, coreObject: this.coreObject });
            products[product.id] = product;
        });
        this.products = products;
    }

    /**
     * Get oll products for this product group
     *
     * @returns Products
     */
    getProducts (): { [name: string]: Product } {
        if (this.products) {
            return this.products;
        } else {
            return {};
        }
    }

    /**
     * Get a list of product IDs
     *
     * @param format Specifies the output format. Possible values: json, csv.
     * @returns List of product names (IDs)
     */
    getProductList (format: 'json' | 'csv' = 'json'): string[] | object {
        let result: string[] = [];
        if (this.products) {
            result = Object.keys(this.getProducts()).map(pId => this.products[pId].id);
        } else {
            result = [];
        }
        return convertToFormat(result, format);
    }

    /**
     * Get a product ID by alias or substring, e.g., adamig11 agamig1-1 adamig1.1 will return { productId: 'adamig-1-1' }.
     *
     * @param name Product name alias
     * @returns {Object|undefined} Product ID
     */
    getProductIdByAlias (alias: string): { productId: string } | undefined {
        let productId;
        if (this.products) {
            const productList = this.getProductList() as string[];
            // Try exact match first, then make it less strict
            productId = productList.find(id => (alias.toLowerCase() === id.toLowerCase()));
            // Remove - and .
            if (!productId) {
                productId = productList.find(id => (alias.toLowerCase().replace(/[-. ]/g, '') === id.toLowerCase().replace(/[-. ]/g, '')));
            }
            // Search by substring
            if (!productId) {
                productId = productList.find(id => (id.toLowerCase().replace(/[-. ]/g, '')).includes(alias.toLowerCase().replace(/[-. ]/g, '')));
            }
        }
        if (productId) {
            return { productId };
        }
    }

    /**
     * Get an object with a fully loaded product by name or alias
     *
     * @param {String} alias Product name alias
     * @param {Boolean} loadBasicInfo If true, will load only basic product details. By default a full product is loaded.
     * @returns {Object} Product
     */
    async getFullProduct (alias: string, loadBasicInfo?: boolean): Promise<Product> {
        let product;
        const idObj = this.getProductIdByAlias(alias);
        if (idObj !== undefined) {
            const id = idObj.productId;
            if (loadBasicInfo) {
                return this.products[id];
            } else {
                const productRaw = await this.coreObject.apiRequest(this.products[id].href);
                product = new Product({ ...this.products[id] });
                if (product.datasetType === 'codelists') {
                    product.parseResponse(productRaw, this.coreObject.useNciSiteForCt);
                } else {
                    product.parseResponse(productRaw);
                }
                product.fullyLoaded = true;
                this.products[id] = product;
            }
        }
        return product;
    }

    /**
     * Get a dataset/dataStructure/domain for a specific product
     *
     * @param {String} name Dataset name
     * @param {String} productAlias  Product name alias. Examples: sdtmig3-3, sdtm1.7, adamig11.
     * @param {GetItemGroupOptions} options {@link GetItemGroupOptions}
     * @returns {Object} Dataset/DataStruture/Domain
     */
    async getItemGroup (name: string, productAlias: string, options?: GetItemGroupOptions): Promise<ItemGroupType|string> {
        const defaultedOptions = { ...defaultGetItemGroupOptions, ...options };
        const idObj = this.getProductIdByAlias(productAlias);
        if (idObj) {
            return await this.products[idObj.productId].getItemGroup(name, defaultedOptions);
        }
    }

    /**
     * Get an object with all datasets/domains/dataStructure
     * <br> This method does not update the main object
     *
     * @param productAlias Product alias
     * @param {GetItemGroupsOptions} options {@link GetItemGroupsOptions}
     * @returns {Object} An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the dataset information from the CDISC Library.
     */
    async getItemGroups (productAlias: string, options?: GetItemGroupsOptions): Promise<ItemGroups> {
        const defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        const idObj = this.getProductIdByAlias(productAlias);
        if (idObj) {
            const id = idObj.productId;
            if (!this.products[id].fullyLoaded && defaultedOptions.type !== 'short') {
                // If the product is not fully loaded
                await this.getFullProduct(id);
                return await this.products[id].getItemGroups(defaultedOptions);
            } else {
                // When a short description is required of the product is fully loaded
                return await this.products[id].getItemGroups(defaultedOptions);
            }
        }
    }
}

/**
 * Product constructor parameters.
 */
interface ProductParameters {
    id?: string;
    name?: string;
    label?: string;
    title?: string;
    type?: string;
    description?: string;
    source?: string;
    effectiveDate?: string;
    registrationStatus?: string;
    version?: string;
    dataClasses?: { [name: string]: DataClass };
    dataStructures?: { [name: string]: DataStructure };
    codelists?: { [name: string]: CodeList };
    href?: string;
    coreObject?: CoreObject;
    model?: string;
    datasetType?: 'dataStructures' | 'dataClasses' | 'domains' | 'datasets' | 'codelists';
    dependencies?: { [name: string]: ProductDependency };
    fullyLoaded?: boolean;
}

/**
 * Product class
 */
export class Product extends BasicFunctions {
    /** CLA Wrapper attribute. Product ID. */
    id?: string;
    /** CDISC Library attribute. */
    name?: string;
    /** CDISC Library attribute. */
    label?: string;
    /** CDISC Library attribute. */
    title?: string;
    /** CDISC Library attribute. */
    type?: string;
    /** CDISC Library attribute. */
    description?: string;
    /** CDISC Library attribute. */
    source?: string;
    /** CDISC Library attribute. */
    effectiveDate?: string;
    /** CDISC Library attribute. */
    registrationStatus?: string;
    /** CDISC Library attribute. */
    version?: string;
    /** CDISC Library attribute. */
    dataClasses?: { [name: string]: DataClass };
    /** CDISC Library attribute. */
    dataStructures?: { [name: string]: DataStructure };
    /** CDISC Library attribute. */
    codelists?: { [name: string]: CodeList };
    /** CLA Wrapper attribute. Model of the product (e.g., ADaM, SDTM, SEND, CDASH) */
    model?: string;
    /** CLA Wrapper attribute. Name of the attribute which contains child groups (e.g., dataStructures, dataClasses, domains, codelits) */
    datasetType?: 'dataStructures' | 'dataClasses' | 'domains' | 'datasets' | 'codelists';
    /** CLA Wrapper attribute. Model and Prior version. */
    dependencies?: { [name: string]: ProductDependency };
    /** CLA Wrapper attribute. Set to TRUE when the product is fully loaded, FALSE otherwise. */
    fullyLoaded?: boolean;
    constructor ({
        id, name, title, label, type, description, source, effectiveDate,
        registrationStatus, version, dataClasses, dataStructures, codelists, href,
        coreObject, model, datasetType, fullyLoaded = false, dependencies
    }: ProductParameters = {}) {
        super();
        if (id) {
            this.id = id;
        } else if (href !== undefined) {
            if (href.startsWith('/mdr/ct/') || href.startsWith('/mdr/adam/')) {
                this.id = href.replace(/.*\/(.*)$/, '$1');
            } else {
                this.id = href.replace(/.*\/(.*)\/(.*)$/, '$1-$2');
            }
        }
        this.name = name;
        this.label = title || label;
        this.type = type;
        this.description = description;
        this.source = source;
        this.effectiveDate = effectiveDate;
        this.registrationStatus = registrationStatus;
        this.href = href;
        this.coreObject = coreObject;
        this.dataStructures = dataStructures;
        this.dataClasses = dataClasses;
        this.codelists = codelists;
        // Non-standard attributes
        if (version) {
            this.version = version;
        } else if (/(\d+-?)+$/.test(href)) {
            if (this.type === 'Terminology') {
                this.version = href.replace(/.*?(\d[\d-]*$)/, '$1');
            } else {
                this.version = href.replace(/.*?(\d[\d-]*$)/, '$1').replace(/-/g, '.');
            }
        }
        if (model) {
            this.model = model;
        } else {
            if (this.id.startsWith('adam')) {
                this.model = 'ADaM';
            } else if (this.id.startsWith('sdtm')) {
                this.model = 'SDTM';
            } else if (this.id.startsWith('send')) {
                this.model = 'SEND';
            } else if (this.id.startsWith('cdash')) {
                this.model = 'CDASH';
            } else if (this.type === 'Terminology') {
                this.model = 'SDTM';
            }
        }
        if (datasetType) {
            this.datasetType = datasetType;
        } else if (this.type === 'Terminology') {
            this.datasetType = 'codelists';
        } else {
            if (this.model === 'ADaM') {
                this.datasetType = 'dataStructures';
            } else if (this.model === 'SDTM') {
                this.datasetType = 'datasets';
            } else if (this.model === 'SEND') {
                this.datasetType = 'datasets';
            } else if (this.model === 'CDASH') {
                this.datasetType = 'domains';
            }
        }

        if (this.datasetType === 'codelists') {
            this.codelists = {};
        } else {
            if (this.model === 'ADaM' && !this.dataStructures) {
                this.dataStructures = {};
            }
            if (['SDTM', 'SEND', 'CDASH'].includes(this.model) && !this.dataClasses) {
                this.dataClasses = {};
            }
        }
        this.fullyLoaded = fullyLoaded;
        this.dependencies = dependencies;
    }

    /**
     * Parse API response to product
     *
     * @param {Object} pRaw Raw CDISC API response
     * @param {boolean} nciSiteResponse Indicates whether the reponse is from the NCI site
     */
    parseResponse(pRaw: any, nciSiteResponse = false): void {
        if (!nciSiteResponse) {
            this.name = pRaw.name;
            this.description = pRaw.description;
            this.source = pRaw.source;
            this.effectiveDate = pRaw.effectiveDate;
            this.registrationStatus = pRaw.registrationStatus;
            this.version = pRaw.version;
            if (pRaw.hasOwnProperty('dataStructures')) {
                const dataStructures: { [name: string]: DataStructure } = {};
                pRaw.dataStructures.forEach((dataStructureRaw: any) => {
                    let href;
                    if (dataStructureRaw?._links?.self) {
                        href = dataStructureRaw._links.self.href;
                    }
                    const dataStructure = new DataStructure({
                        name: dataStructureRaw.name,
                        href,
                        coreObject: this.coreObject
                    });
                    dataStructure.parseResponse(dataStructureRaw);
                    dataStructures[dataStructure.id] = dataStructure;
                });
                this.dataStructures = dataStructures;
            }
            if (pRaw.hasOwnProperty('classes')) {
                const dataClasses: { [name: string]: DataClass } = {};
                pRaw.classes.forEach((dataClassRaw: any) => {
                    let href;
                    if (dataClassRaw?._links?.self) {
                        href = dataClassRaw._links.self.href;
                    }
                    const dataClass = new DataClass({
                        name: dataClassRaw.name,
                        href,
                        coreObject: this.coreObject
                    });
                    // CDASH structure is different from SDTM, as domains are provided separately
                    // Pass all domains, so that they can be split by class
                    if (pRaw.hasOwnProperty('domains')) {
                        dataClass.parseResponse(dataClassRaw, pRaw.domains);
                    } else {
                        dataClass.parseResponse(dataClassRaw);
                    }
                    dataClasses[dataClass.id] = dataClass;
                });
                this.dataClasses = dataClasses;
            }
            if (pRaw.hasOwnProperty('codelists')) {
                const codelists: { [name: string]: CodeList } = {};
                pRaw.codelists.forEach((codeListRaw: any) => {
                    let href;
                    if (codeListRaw?._links?.self) {
                        href = codeListRaw._links.self.href;
                    }
                    const codeList = new CodeList({
                        name: codeListRaw.name,
                        href,
                        coreObject: this.coreObject
                    });
                    codeList.parseResponse(codeListRaw);
                    if (codeList.href === undefined && this.href !== undefined) {
                        // Build href using the CT href
                        codeList.href = this.href + '/codelists/' + codeList.conceptId;
                    }
                    codelists[codeList.conceptId] = codeList;
                });
                this.codelists = codelists;
            }
            if (pRaw._links) {
                const dependencies: { [name: string]: ProductDependency } = {};
                Object.keys(pRaw._links).forEach(link => {
                    if (link !== 'self') {
                        dependencies[link] = { ...pRaw._links[link] };
                        const href = pRaw._links[link].href;
                        if (href.startsWith('/mdr/ct/') || href.startsWith('/mdr/adam/')) {
                            dependencies[link].id = href.replace(/.*\/(.*)$/, '$1');
                        } else {
                            dependencies[link].id = href.replace(/.*\/(.*)\/(.*)$/, '$1-$2');
                        }
                    }
                });
                this.dependencies = dependencies;
            }
        } else {
            // Parse response as NCI codelist
            const options = {
                attributeNamePrefix: '_',
                ignoreAttributes: false,
                ignoreNameSpace: true,
                parseNodeValue: true,
                parseAttributeValue: true,
                trimValues: true,
            };
            const rawXml = xmlParser.parse(pRaw, options);
            this.href = '/mdr/packages/ct/' + this.id;
            this.description = rawXml.ODM.Study.GlobalVariables.StudyDescription;
            this.source = rawXml.ODM._Originator;
            this.effectiveDate = rawXml.ODM._SourceSystemVersion;
            this.registrationStatus = 'Final';
            this.version = rawXml.ODM._SourceSystemVersion;
            this.name = `${this.model} CT ${this.version}`;
            const codelists: { [name: string]: CodeList } = {};
            rawXml.ODM.Study.MetaDataVersion.CodeList.forEach((codeListRaw: any) => {
                const codeList = new CodeList({
                    name: codeListRaw._Name,
                    coreObject: this.coreObject
                });
                codeList.parseResponse(codeListRaw, nciSiteResponse);
                // Build href using the CT href
                codeList.href = this.href + '/codelists/' + codeList.conceptId;
                codelists[codeList.conceptId] = codeList;
            });
            this.codelists = codelists;
        }
    }

    /**
     * Get an object with all variables/fields for that product
     *
     * @returns {Object} An object with variables/fields
     */
    async getItems(): Promise<Items> {
        if (this.fullyLoaded) {
            return this.getCurrentItems();
        } else {
            // Load the full product
            const productRaw = await this.coreObject.apiRequest(this.href);
            this.parseResponse(productRaw);
            this.fullyLoaded = true;
            return this.getCurrentItems();
        }
    }

    /**
     * Get an object with all variables/fields for that product which are currently loaded
     *
     * @returns {Object} An object with variables/fields
     */
    getCurrentItems(): Items {
        let sourceObject;
        let result: Items = {};
        if (this.dataStructures) {
            sourceObject = this.dataStructures;
        } else if (this.dataClasses) {
            sourceObject = this.dataClasses;
        }
        if (sourceObject) {
            Object.values(sourceObject).forEach(obj => {
                result = { ...result, ...obj.getItems() };
            });
        }
        return result;
    }

    /**
     * Get an object with all datasets/domains/dataStructure
     * <br> This method does not update the main object
     *
     * @param {GetItemGroupsOptions} options {@link GetItemGroupsOptions}
     * @returns {Object} An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the dataset information from the CDISC Library.
     */
    async getItemGroups(options?: GetItemGroupsOptions): Promise<any> {
        const defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        let result: any = {};
        if (defaultedOptions.type !== 'short') {
            if (this.fullyLoaded) {
                result = this.getCurrentItemGroups();
            } else {
                // Load the full product
                const productRaw = await this.coreObject.apiRequest(this.href);
                this.parseResponse(productRaw);
                this.fullyLoaded = true;
            }
        } else {
            if (this.fullyLoaded) {
                const itemGroups = this.getCurrentItemGroups();
                Object.values(itemGroups).forEach(itemGroup => {
                    result[itemGroup.name] = { name: itemGroup.name, label: itemGroup.label };
                });
            } else {
                const datasetsHref = `${this.href}/${this.datasetType.toLowerCase()}`;
                const itemGroupsRaw = await this.coreObject.apiRequest(datasetsHref);
                if (itemGroupsRaw?._links[this.datasetType]) {
                    itemGroupsRaw._links[this.datasetType].forEach((dsRaw: any) => {
                        const name = dsRaw.href.replace(/.*\/(.*)$/, '$1');
                        result[name] = { name, label: dsRaw.title };
                    });
                }
            }
        }
        if (defaultedOptions.format === undefined) {
            return result;
        } else {
            if (defaultedOptions.type === 'short') {
                return convertToFormat(Object.values(result), defaultedOptions.format);
            } else {
                let formatted: object[] = [];
                Object.values(result).forEach((itemGroup: ItemGroupType) => {
                    formatted = formatted.concat(itemGroup.getFormattedItems('json', true) as object[]);
                });
                return convertToFormat(formatted, defaultedOptions.format);
            }
        }
    }

    /**
     * Get an object with all datasets/dataStructures/domains for that product which are currently loaded
     *
     * @returns {Object} An object with datasets/dataStructures/domains
     */
    getCurrentItemGroups(): ItemGroups {
        let result = {};
        if (this.dataStructures) {
            return this.dataStructures;
        } else if (this.dataClasses) {
            Object.values(this.dataClasses).forEach(dataClass => {
                result = { ...result, ...dataClass.getItemGroups() };
            });
        }
        return result;
    }

    /**
     * Get a dataset/dataStructure/domain for that product
     *
     * @param {String} name Dataset name
     * @param {GetItemGroupOptions} options {@link GetItemGroupOptions}
     * @returns {Object} Dataset/DataStruture/Domain
     */
    async getItemGroup(name: string, options?: GetItemGroupOptions): Promise<ItemGroupType | string> {
        let result;
        const defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        // Check if dataset is already present;
        const loadedDatasets = this.getCurrentItemGroups();
        let datasetId;
        Object.values(loadedDatasets).some(dataset => {
            if (dataset.name.toUpperCase() === name.toUpperCase()) {
                datasetId = dataset.id;
                return true;
            }
            return false;
        });
        if (datasetId) {
            result = loadedDatasets[datasetId];
        } else if (!this.fullyLoaded) {
            const href = `${this.href}/${this.datasetType.toLowerCase()}/${name.toUpperCase()}`;
            const dsRaw = await this.coreObject.apiRequest(href);
            if (Object.keys(dsRaw).length === 0) {
                // Dataset not found
                return null;
            }
            if (this.datasetType.toLowerCase() === 'datastructures') {
                result = new DataStructure({
                    name: dsRaw.name,
                    href,
                    coreObject: this.coreObject
                });
                result.parseResponse(dsRaw);
                this.dataStructures[result.id] = result;
            } else if (['datasets', 'domains'].includes(this.datasetType)) {
                if (this.datasetType === 'datasets') {
                    result = new Dataset({
                        name: dsRaw.name,
                        href,
                        coreObject: this.coreObject
                    });
                    result.parseResponse(dsRaw);
                } else if (this.datasetType === 'domains') {
                    result = new Domain({
                        name: dsRaw.name,
                        href,
                        coreObject: this.coreObject
                    });
                    result.parseResponse(dsRaw);
                }
                // Create a class to add this itemgroup to the main object
                if (dsRaw?._links?.parentClass) {
                    const dcRaw = dsRaw._links.parentClass;
                    const dataClass = new DataClass({
                        ...dcRaw,
                        coreObject: this.coreObject
                    });
                    dataClass.name = dataClass.id;
                    if (this?.dataClasses?.hasOwnProperty(dataClass.id)) {
                        // If the dataClass is already present, add the dataset to it
                        this.dataClasses[dataClass.id][this.datasetType as 'datasets' | 'domains'][result.id] = result;
                    } else {
                        // Otherwise create a new data class
                        dataClass[this.datasetType as 'datasets' | 'domains'] = { [result.id]: result };
                        this.dataClasses[dataClass.id] = dataClass;
                    }
                }
            }
        }
        if (defaultedOptions.format === undefined) {
            return result;
        } else {
            return result.getFormattedItems(defaultedOptions.format) as ItemGroupType | string;
        }
    }

    /**
     * Find all matching variables/fields. For example TRxxPGy matches TR01PG12.
     *
     * @param {String} name Variable/Field name.
     * @param {Object} [options]  Matching options. {@link MatchingOptions}
     * @returns {Array} Array of matched items.
     */
    findMatchingItems(name: string, options?: MatchingOptions): ItemType[] {
        // Default options
        const defaultedOptions = { ...defaultMatchingOptions, ...options };
        let result: ItemType[] = [];
        let sourceObject;
        if (this.dataStructures) {
            sourceObject = this.dataStructures;
        } else if (this.dataClasses) {
            sourceObject = this.dataClasses;
        }
        if (sourceObject) {
            Object.values(sourceObject).some(obj => {
                const matches = obj.findMatchingItems(name, defaultedOptions);
                if (matches.length > 0) {
                    result = result.concat(matches);
                    if (defaultedOptions.firstOnly) {
                        return true;
                    }
                }
                return false;
            });
        }
        return result;
    }

    /**
     * Get a list of codelists in for that terminology.
     *
     * @param {Object} [options] Output options.
     * @param {Boolean} [options.type='short'] Keep only preferred term and ID in the result. Possible values: short, long.
     * @param {String} [options.format=json] Specifies the output format. Possible values: json, csv.
     * @returns {Array} Array of codelist IDs and titles.
     */
    async getCodeListList(options: GetItemGroupsOptions = { type: 'long' }): Promise<Array<{ conceptId: string; preferredTerm: string; href?: string }>> {
        const result: Array<{ conceptId: string; preferredTerm: string; href?: string }> = [];
        if (!this.codelists) {
            const codeListsHref = `${this.href}/codelists`;
            const clRaw = await this.coreObject.apiRequest(codeListsHref);
            if (clRaw.hasOwnProperty('_links') && clRaw._links.hasOwnProperty('codelists')) {
                const codelists: { [name: string]: CodeList } = {};
                clRaw._links.codelists.forEach((codeListRaw: any) => {
                    const codeList = new CodeList({
                        href: codeListRaw.href,
                        preferredTerm: codeListRaw.title,
                        coreObject: this.coreObject
                    });
                    codelists[codeList.conceptId] = codeList;
                });
                this.codelists = codelists;
            }
        }
        Object.values(this.codelists).forEach(codeList => {
            if (options.type === 'short') {
                result.push({ conceptId: codeList.conceptId, preferredTerm: codeList.preferredTerm });
            } else {
                result.push({ conceptId: codeList.conceptId, preferredTerm: codeList.preferredTerm, href: codeList.href });
            }
        });
        return convertToFormat(result, options.format);
    }

    /**
     * Get a codelist.
     *
     * @param {String} codeListId Concept ID of the codelist.
     * @param {Object} [options] Output options.
     * @param {String} [options.format=json] Specifies the output format. Possible values: json, csv.
     * @returns {Object} Codelist.
     */
    async getCodeList(codeListId: string, options: GetItemGroupOptions = {}): Promise<CodeList | Term[] | string> {
        let ct;
        if (this?.codelists[codeListId]) {
            ct = this.codelists[codeListId];
        }
        // If not found, try to loaded it. Even when found it is possible that the codelist is not fully loaded
        if ((ct === undefined && !this.fullyLoaded) || (ct && ct.terms.length < 1)) {
            const href = this.href + '/codelists/' + codeListId;
            const codeList = new CodeList({
                href,
                coreObject: this.coreObject
            });
            const loaded = await codeList.load();
            if (loaded) {
                ct = codeList;
                if (!this.codelists) {
                    this.codelists = {};
                }
                this.codelists[ct.conceptId] = ct;
            }
        }

        if (ct) {
            if (options.format) {
                return ct.getFormattedTerms(options.format);
            } else {
                return ct;
            }
        }
    }

    /**
     * Remove contents of the product.
     */
    removeContent(): void {
        if (this.datasetType === 'codelists') {
            this.codelists = {};
        } else {
            if (this.dataClasses !== undefined && Object.keys(this.dataClasses).length > 0) {
                this.dataClasses = {};
            }
            if (this.dataStructures !== undefined && Object.keys(this.dataStructures).length > 0) {
                this.dataStructures = {};
            }
        }
        this.fullyLoaded = false;
    }
}

/**
 * DataStructure constructor parameters.
 */
interface DataStructureParameters {
    id?: string;
    name?: string;
    label?: string;
    description?: string;
    className?: string;
    analysisVariableSets?: AnalysisVariableSets;
    href?: string;
    coreObject?: CoreObject;
}

/**
 * Data Structure class
 */
export class DataStructure extends BasicFunctions {
    /** CLA Wrapper attribute. Data structure ID. */
    id?: string;
    /** CDISC Library attribute. */
    name?: string;
    /** CDISC Library attribute. */
    label?: string;
    /** CDISC Library attribute. */
    description?: string;
    /** CDISC Library attribute. */
    className?: string;
    /** CDISC Library attribute. */
    analysisVariableSets?: AnalysisVariableSets;

    constructor({ name, label, description, className, analysisVariableSets, href, coreObject }: DataStructureParameters = {}) {
        super();
        this.id = href.replace(/.*\/(.*)$/, '$1');
        this.name = name;
        this.label = label;
        this.description = description;
        this.className = className;
        this.analysisVariableSets = analysisVariableSets;
        this.href = href;
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to data structure
     *
     * @param dsRaw {Object} Raw CDISC API response
     */
    parseResponse(dsRaw: any): void {
        this.name = dsRaw.name;
        this.label = dsRaw.label || dsRaw.title;
        this.description = dsRaw.description;
        this.className = dsRaw.className;
        const analysisVariableSets: AnalysisVariableSets = {};
        if (dsRaw.hasOwnProperty('analysisVariableSets')) {
            dsRaw.analysisVariableSets.forEach((analysisVariableSetRaw: any) => {
                let href;
                let id;
                if (analysisVariableSetRaw?._links?.self) {
                    href = analysisVariableSetRaw._links.self.href;
                    id = href.replace(/.*\/(.*)$/, '$1');
                }
                if (!id) {
                    id = analysisVariableSetRaw.name;
                }
                analysisVariableSets[id] = new AnalysisVariableSet({
                    id,
                    name: analysisVariableSetRaw.name,
                    href,
                    coreObject: this.coreObject
                });
                analysisVariableSets[id].parseResponse(analysisVariableSetRaw);
            });
        }
        this.analysisVariableSets = analysisVariableSets;
    }

    /**
     * Get an object with all variables/fields for that data structure
     *
     * @returns {Object} An object with variables/fields
     */
    getItems(): Items {
        let result = {};
        if (this.analysisVariableSets) {
            Object.values(this.analysisVariableSets).forEach(analysisVariableSet => {
                result = { ...result, ...analysisVariableSet.getItems() };
            });
        }
        return result;
    }

    /**
     * Get an object with specified item name
     *
     * @property {String} name Variable/field name.
     *
     * @returns {Object|undefined} An object with variable/field if found
     */
    async getItem(name: string): Promise<ItemType> {
        let result;

        Object.values(this.getItems()).some(item => {
            if (item.name === name) {
                result = item;
                return true;
            }
            return false;
        });
        return result;
    }

    /**
     * Find all matching variables/fields. For example TRxxPGy matches TR01PG12.
     *
     * @param {String} name Variable/Field name.
     * @param {Object} [options]  Matching options. {@link MatchingOptions}
     * @returns {Array} Array of matched items.
     */
    findMatchingItems(name: string, options: MatchingOptions): ItemType[] {
        // Default options
        const defaultedOptions = { ...defaultMatchingOptions, ...options };
        let result: ItemType[] = [];
        if (this.analysisVariableSets) {
            Object.values(this.analysisVariableSets).some(analysisVariableSet => {
                const matches = analysisVariableSet.findMatchingItems(name, defaultedOptions);
                if (matches.length > 0) {
                    result = result.concat(matches);
                    if (defaultedOptions.firstOnly) {
                        return true;
                    }
                }
                return false;
            });
        }
        return result;
    }

    /**
     * Get items in a specific format.
     *
     * @param {String} format Specifies the output format. Possible values: json, csv.
     * @param {Boolean} [addItemGroupId=false] If set to true, itemGroup name is added to each records.
     * @returns {String|Array} String with formatted items or an array with item details.
     */
    getFormattedItems(format: 'json' | 'csv', addItemGroupId = false): string | ItemType[] {
        let result: object[] = [];
        if (this.analysisVariableSets) {
            Object.values(this.analysisVariableSets).forEach((analysisVariableSet: AnalysisVariableSet) => {
                result = result.concat(analysisVariableSet.getFormattedItems('json', addItemGroupId, { dataStructure: this.id }) as ItemType[]);
            });
            return convertToFormat(result, format);
        }
    }

    /**
     * Get an array or object with variable sets and their descriptions in a specific format.
     *
     * @param {Object} [options]  Format options.
     * @param {Boolean} [options.descriptions=false] Will return an object with variable set IDs and their labels.
     * @returns {Object|Array} List of variable sets.
     */
    getVariableSetList(options: { descriptions?: boolean } = {}): string[] | object {
        const analysisVariableSets = this.analysisVariableSets || {};
        if (options?.descriptions) {
            const result: { [name: string]: string } = {};
            Object.keys(analysisVariableSets).forEach(id => {
                result[id] = analysisVariableSets[id].label;
            });
            return result;
        } else {
            return Object.keys(analysisVariableSets);
        }
    }
}

/**
 * DataStructure constructor parameters.
 */
interface DataClassParameters {
    id?: string;
    ordinal?: string;
    name?: string;
    label?: string;
    description?: string;
    datasets?: ItemGroups;
    domains?: ItemGroups;
    classVariables?: Items;
    cdashModelFields?: Items;
    href?: string;
    coreObject?: CoreObject;
}

/**
 * Dataset Class class
 */
export class DataClass extends BasicFunctions {
    /** CLA Wrapper attribute. Data class ID. */
    id?: string;
    /** CDISC Library attribute. */
    ordinal?: string;
    /** CDISC Library attribute. */
    name?: string;
    /** CDISC Library attribute. */
    label?: string;
    /** CDISC Library attribute. */
    description?: string;
    /** CDISC Library attribute. */
    datasets?: ItemGroups;
    /** CDISC Library attribute. */
    domains?: ItemGroups;
    /** CDISC Library attribute. */
    classVariables?: Items;
    /** CDISC Library attribute. */
    cdashModelFields?: Items;

    constructor({ ordinal, name, label, description, datasets, domains, classVariables, cdashModelFields, href, coreObject }: DataClassParameters = {}) {
        super();
        this.id = href.replace(/.*\/(.*)$/, '$1');
        this.ordinal = ordinal;
        this.name = name;
        this.label = label;
        this.description = description;
        this.datasets = datasets;
        this.domains = domains;
        this.classVariables = classVariables;
        this.cdashModelFields = cdashModelFields;
        this.href = href;
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to data structure
     *
     * @param {Object} dcRaw Raw CDISC API response
     * @param {Object} id Placeholder, has no effect.
     * @param {Object} domainsRaw Raw CDISC API response with domains, used for CDASH endpoints
     */
    parseResponse(dcRaw: any, domainsRaw?: any): void {
        this.name = dcRaw.name;
        this.ordinal = dcRaw.ordinal;
        this.label = dcRaw.label;
        this.description = dcRaw.description;
        if (!this.href && dcRaw._links && dcRaw._links.self) {
            this.href = dcRaw._links.self.href;
        }
        if (dcRaw.hasOwnProperty('datasets')) {
            const datasets: { [name: string]: Dataset } = {};
            dcRaw.datasets.forEach((datasetRaw: any) => {
                let href;
                let id;
                if (datasetRaw?._links?.self) {
                    href = datasetRaw._links.self.href;
                    id = href.replace(/.*\/(.*)$/, '$1');
                }
                if (!id) {
                    id = datasetRaw.name;
                }
                datasets[id] = new Dataset({
                    id,
                    name: datasetRaw.name,
                    href,
                    coreObject: this.coreObject
                });
                datasets[id].parseResponse(datasetRaw);
            });
            this.datasets = datasets;
        }
        if (dcRaw.hasOwnProperty('domains') || domainsRaw !== undefined) {
            const rawDomains = dcRaw.domains || domainsRaw;
            const domains: { [name: string]: Domain } = {};
            rawDomains
                .filter((domainRaw: any) => {
                    if (domainRaw?._links?.parentClass) {
                        return domainRaw._links.parentClass.href === this.href;
                    } else {
                        return false;
                    }
                })
                .forEach((domainRaw: any) => {
                    let href;
                    let id;
                    if (domainRaw?._links?.self) {
                        href = domainRaw._links.self.href;
                        id = href.replace(/.*\/(.*)$/, '$1');
                    }
                    if (!id) {
                        id = domainRaw.name;
                    }
                    domains[id] = new Domain({
                        id,
                        name: domainRaw.name,
                        href,
                        coreObject: this.coreObject
                    });
                    domains[id].parseResponse(domainRaw, dcRaw.scenarios);
                });
            this.domains = domains;
        }
        if (dcRaw.hasOwnProperty('classVariables')) {
            const classVariables: { [name: string]: ItemType } = {};
            if (dcRaw.hasOwnProperty('classVariables')) {
                dcRaw.classVariables.forEach((variableRaw: any) => {
                    let href;
                    if (variableRaw?._links?.self) {
                        href = variableRaw._links.self.href;
                    }
                    const variable = new Variable({
                        name: variableRaw.name,
                        href,
                        coreObject: this.coreObject
                    });
                    classVariables[variable.id] = variable;
                    classVariables[variable.id].parseResponse(variableRaw);
                });
            }
            this.classVariables = classVariables;
        }
        if (dcRaw.hasOwnProperty('cdashModelFields')) {
            const cdashModelFields: { [name: string]: ItemType } = {};
            if (dcRaw.hasOwnProperty('cdashModelFields')) {
                dcRaw.cdashModelFields.forEach((fieldRaw: any) => {
                    let href;
                    if (fieldRaw?._links?.self) {
                        href = fieldRaw._links.self.href;
                    }
                    const field = new Field({
                        name: fieldRaw.name,
                        href,
                        coreObject: this.coreObject
                    });
                    cdashModelFields[field.id] = field;
                    cdashModelFields[field.id].parseResponse(fieldRaw);
                });
            }
            this.cdashModelFields = cdashModelFields;
        }
    }

    /**
     * Get an object with all variables/fields for that data structure
     *
     * @param {Object} [options] Additional options.
     * @param {Boolean} [options.immediate=false] Include only class variables/model fields and exclude items from datasets or domains.
     * @returns {Object} An object with variables/fields
     */
    getItems(options = { immediate: false }): Items {
        let result: Items = {};
        if (this.datasets && !options.immediate) {
            Object.values(this.datasets).forEach(dataset => {
                result = { ...result, ...dataset.getItems() };
            });
        }
        if (this.domains && !options.immediate) {
            Object.values(this.domains).forEach(domain => {
                result = { ...result, ...domain.getItems() };
            });
        }
        if (this.classVariables) {
            Object.values(this.classVariables).forEach(variable => {
                result[variable.id] = variable;
            });
        }
        if (this.cdashModelFields) {
            Object.values(this.cdashModelFields).forEach(field => {
                result[field.id] = field;
            });
        }
        return result;
    }

    /**
     * Get an object with specified item name
     *
     * @property {String} name Variable/field name.
     *
     * @returns {Object|undefined} An object with variable/field if found
     */
    async getItem(name: string): Promise<ItemType | undefined> {
        let result;
        Object.values(this.getItems()).some(item => {
            if (item.name === name) {
                result = item;
                return true;
            }
            return false;
        });
        return result;
    }

    /**
     * Get an object with all datasets/domains
     *
     * @returns {Object} An object with datasets/domains
     */
    getItemGroups(): ItemGroups {
        let result = {};
        if (typeof this.domains === 'object' && Object.keys(this.domains).length > 0) {
            result = { ...result, ...this.domains };
        } else if (typeof this.datasets === 'object' && Object.keys(this.datasets).length > 0) {
            result = { ...result, ...this.datasets };
        }
        return result;
    }

    /**
     * Find all matching variables/fields. For example TRxxPGy matches TR01PG12.
     *
     * @param {String} name Variable/Field name.
     * @param {Object} [options]  Matching options.
     * @param {String} [options.mode=full] Match only full names, partial - match partial names.
     * @param {Boolean} [options.firstOnly=false] If true, returns only the first matching item, when false - returns all matching items.
     * @returns {Array} Array of matched items.
     */
    findMatchingItems(name: string, options: MatchingOptions): ItemType[] {
        // Default options
        const defaultedOptions = { ...defaultMatchingOptions, ...options };
        let result: ItemType[] = [];
        ['datasets', 'domains'].forEach((dataType: 'datasets' | 'domains') => {
            if (this[dataType]) {
                Object.values(this[dataType]).some((itemGroup: ItemGroup) => {
                    const matches = itemGroup.findMatchingItems(name, defaultedOptions);
                    if (matches.length > 0) {
                        result = result.concat(matches);
                        if (defaultedOptions.firstOnly) {
                            return true;
                        }
                    }
                    return false;
                });
            }
        });
        if (this.classVariables && !(defaultedOptions.firstOnly && result.length > 0)) {
            for (const variable of Object.values(this.classVariables)) {
                if (matchItem(name, variable, defaultedOptions.mode)) {
                    result.push(variable);
                    if (defaultedOptions.firstOnly) {
                        break;
                    }
                }
            }
        }
        if (this.cdashModelFields && !(defaultedOptions.firstOnly && result.length > 0)) {
            for (const field of Object.values(this.cdashModelFields)) {
                if (matchItem(name, field, defaultedOptions.mode)) {
                    result.push(field);
                    if (defaultedOptions.firstOnly) {
                        break;
                    }
                }
            }
        }
        return result;
    }
}

/**
 * ItemGroup constructor parameters.
 */
interface ItemGroupParameters {
    name?: string;
    label?: string;
    type?: string;
    id?: string;
    itemType?: 'fields' | 'analysisVariables' | 'datasetVariables';
    href?: string;
    coreObject?: CoreObject;
}

/**
 * ItemGroup class: base for Dataset, DataStructure, Domain
 */
abstract class ItemGroup extends BasicFunctions {
    /** CDISC Library attribute. */
    name?: string;
    /** CDISC Library attribute. */
    label?: string;
    /** CDISC Library attribute. Value of the _links.self.type. */
    type?: string;
    /** CLA Wrapper attribute. Item group class ID. */
    id?: string;
    /** CDISC Library attribute. */
    scenarios?: { [name: string]: Scenario };
    /** CDISC Library attribute. */
    fields?: { [name: string]: Field };
    /** CDISC Library attribute. */
    analysisVariables?: { [name: string]: Variable };
    /** CDISC Library attribute. */
    datasetVariables?: { [name: string]: Variable };
    /** CLA Wrapper attribute. Name of the item type (field, analysisVariable, datasetVariable). Corresponds to an object name of the classes which are extending ItemGroup class (Dataset, Domain, VariableSet). */
    itemType?: 'fields' | 'analysisVariables' | 'datasetVariables';

    constructor({ id, name, label, itemType, type, href, coreObject }: ItemGroupParameters = {}) {
        super();
        this.itemType = itemType;
        if (name) {
            this.name = name;
        } else {
            this.name = href.replace(/.*\/(.*)$/, '$1');
        }
        if (id) {
            this.id = id;
        } else {
            this.id = this.name;
        }
        this.label = label;
        this.href = href;
        this.type = type;
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to variable set.
     *
     * @param {Object} itemRaw CDISC API response.
     */
    parseItemGroupResponse(itemRaw: any): void {
        this.name = itemRaw.name;
        this.label = itemRaw.label;
        const items: Items = {};
        if (itemRaw.hasOwnProperty(this.itemType)) {
            itemRaw[this.itemType].forEach((itemRaw: any) => {
                let href;
                if (itemRaw?._links?.self) {
                    href = itemRaw._links.self.href;
                }
                let item;
                if (this.itemType === 'fields') {
                    item = new Field({
                        name: itemRaw.name,
                        href,
                        coreObject: this.coreObject
                    });
                    item.parseResponse(itemRaw);
                    items[item.id] = item;
                } else if (['analysisVariables', 'datasetVariables'].includes(this.itemType)) {
                    item = new Variable({
                        name: itemRaw.name,
                        href,
                        coreObject: this.coreObject
                    });
                    item.parseResponse(itemRaw);
                    items[item.id] = item;
                }
            });
        }
        if (itemRaw.hasOwnProperty('_links')) {
            if (itemRaw?._links?.self?.type) {
                this.type = itemRaw._links.self.type;
            }
        }
        this[this.itemType] = items;
    }

    /**
     * Get an object with all variables/fields for that item set. Note that for CDASHIG Scenarios have overlapping fields.
    *  Only one field is returned by this method.
     *
     * @returns {Object} An object with variables/fields.
     */
    getItems(): Items {
        let result: Items = {};
        if (this[this.itemType]) {
            Object.values(this[this.itemType]).forEach((item: ItemType) => {
                result[item.id] = item;
            });
        }
        if (this.scenarios) {
            Object.values(this.scenarios).forEach((scenario: Scenario) => {
                result = { ...result, ...scenario.getItems() };
            });
        }
        return result;
    }

    /**
     * Get an object with specified item name
     *
     * @property {String} name Variable/field name.
     *
     * @returns {Object|undefined} An object with variable/field if found
     */
    getItem(name: string): ItemType {
        let result;

        Object.values(this.getItems()).some(item => {
            if (item.name === name) {
                result = item;
                return true;
            }
            return false;
        });
        return result;
    }

    /**
     * Get an array with the list of names for all items.
     *
     * @returns {Array} An array with item names.
     */
    getNameList(): string[] {
        let result: string[] = [];
        if (this[this.itemType]) {
            Object.values(this[this.itemType]).forEach(item => {
                result.push(item.name);
            });
        }
        if (this.scenarios) {
            Object.values(this.scenarios).forEach(scenario => {
                result = result.concat(scenario.getNameList());
            });
            // Remove duplicates
            result = result.filter((item, pos) => {
                return result.indexOf(item) === pos;
            });
        }
        return result;
    }

    /**
     * Find all matching variables/fields. For example TRxxPGy matches TR01PG12.
     *
     * @param {String} name Variable/Field name.
     * @param {Object} [options]  Matching options. {@link MatchingOptions}
     * @returns {Array} Array of matched items.
     */
    findMatchingItems(name: string, options: MatchingOptions): ItemType[] {
        // Default options
        const defaultedOptions = { ...defaultMatchingOptions, ...options };
        let result: ItemType[] = [];
        if (this[this.itemType]) {
            Object.values(this[this.itemType]).some(variable => {
                if (matchItem(name, variable, defaultedOptions.mode)) {
                    result.push(variable);
                    if (defaultedOptions.firstOnly) {
                        return true;
                    }
                }
                return false;
            });
        }
        if (this.scenarios) {
            Object.values(this.scenarios).forEach(scenario => {
                result = result.concat(scenario.findMatchingItems(name, options));
            });
        }
        return result;
    }

    /**
     * Get items in a specific format.
     *
     * @param {String} format Specifies the output format. Possible values: json, csv.
     * @param {Boolean} [addItemGroupId=false] If set to true, itemGroup name is added to each records.
     * @param {Object} [additionalProps] If provided, these properties will be added.
     * @returns {String|Array} String with formatted items or an array with item details.
     */
    getFormattedItems(format: 'json' | 'csv', addItemGroupId = false, additionalProps?: object): string | object[] {
        const items = this.getItems();
        const result: object[] = [];
        Object.values(items).forEach((item: ItemType) => {
            let updatedItem: any = {};
            if (addItemGroupId) {
                updatedItem = { itemGroup: this.id, ...item };
            } else {
                updatedItem = { ...item };
            }
            if (additionalProps) {
                updatedItem = { ...additionalProps, ...updatedItem };
            }
            if ((item as Variable)?.valueList?.length > 0) {
                updatedItem.valueList = (item as Variable).valueList.join(',');
            }
            // Remove all properties, which are Objects
            for (const prop in updatedItem) {
                if (typeof updatedItem[prop] === 'object') {
                    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                    delete updatedItem[prop];
                }
            }
            result.push(updatedItem);
        });
        return convertToFormat(result, format);
    }
}

/**
 * Dataset constructor parameters.
 */
interface DatasetParameters {
    id?: string;
    name?: string;
    label?: string;
    type?: string;
    description?: object;
    dataStructure?: object;
    datasetVariables?: { [name: string]: Variable };
    href?: string;
    coreObject?: CoreObject;
}
/**
 * Dataset class.
 */
export class Dataset extends ItemGroup {
    /** CDISC Library attribute. */
    description?: object;
    /** CDISC Library attribute. */
    dataStructure?: object;
    constructor({ id, name, label, description, dataStructure, datasetVariables = {}, href, coreObject }: DatasetParameters = {}) {
        super({ id, name, label, itemType: 'datasetVariables', href, coreObject });
        this.description = description;
        this.dataStructure = dataStructure;
        this.datasetVariables = datasetVariables;
    }

    /**
     * Parse API response to dataset
     *
     * @param raw Raw CDISC API response
     */
    parseResponse(raw: any): void {
        this.parseItemGroupResponse(raw);
        this.description = raw.description;
        this.dataStructure = raw.dataStructure;
    }
}

/**
 * AnalysisVariableSet constructor parameters.
 */
interface AnalysisVariableSetParameters {
    id?: string;
    name?: string;
    label?: string;
    analysisVariables?: { [name: string]: Variable };
    href?: string;
    coreObject?: CoreObject;
}

/**
 * Analysis Variable Set class. Extends ItemGroup class.
 */
export class AnalysisVariableSet extends ItemGroup {
    constructor({ id, name, label, analysisVariables = {}, href, coreObject }: AnalysisVariableSetParameters = {}) {
        super({ id, name, label, itemType: 'analysisVariables', href, coreObject });
        this.analysisVariables = analysisVariables;
    }

    /**
     * Parse API response to variable set
     *
     * @param raw Raw CDISC API response
     */
    parseResponse(raw: any): void {
        this.parseItemGroupResponse(raw);
    }
}

/**
 * Domain constructor parameters.
 */
interface DomainParameters {
    name?: string;
    label?: string;
    type?: string;
    fields?: { [name: string]: Field };
    scenarios?: { [name: string]: Scenario };
    id?: string;
    href?: string;
    coreObject?: CoreObject;
}

/**
 * Domain class.
 */
export class Domain extends ItemGroup {
    constructor({ id, name, label, fields = {}, scenarios, href, coreObject }: DomainParameters = {}) {
        super({ id, name, label, itemType: 'fields', href, coreObject });
        this.fields = fields;
        this.scenarios = scenarios;
    }

    /**
     * Parse API response to domain
     *
     * @param raw Raw CDISC API response
     * @param scenariosRaw Object with scenarios
    */
    parseResponse(raw: any, scenariosRaw?: any): void {
        this.parseItemGroupResponse(raw);
        if (raw._links && Array.isArray(raw._links.scenarios)) {
            const scenarios: { [name: string]: Scenario } = {};
            raw._links.scenarios.forEach((scenarioRaw: any) => {
                const scenario = new Scenario({
                    href: scenarioRaw.href,
                    coreObject: this.coreObject,
                });
                if (Array.isArray(scenariosRaw)) {
                    scenariosRaw.some(scRaw => {
                        if (scRaw?._links?.self?.href === scenario.href) {
                            scenario.parseResponse(scRaw);
                            return true;
                        }
                        return false;
                    });
                }
                scenarios[scenario.id] = scenario;
            });
            this.scenarios = scenarios;
        }
    }
}

/**
 * Scenario constructor parameters.
 */
interface ScenarioParameters {
    id?: string;
    domain?: string;
    scenario?: string;
    type?: string;
    fields?: { [name: string]: Field };
    href?: string;
    coreObject?: CoreObject;
}

/**
 * Scenario class.
*/
export class Scenario extends BasicFunctions {
    /** CDISC Library attribute. */
    domain?: string;
    /** CDISC Library attribute. */
    scenario?: string;
    /** CDISC Library attribute. Value of the _links.self.type. */
    type?: string;
    /** CDISC Library attribute. */
    fields?: { [name: string]: Field };
    /** CLA Wrapper attribute. Item group class ID. */
    id?: string;

    constructor({ id, domain, scenario, type, fields = {}, href, coreObject }: ScenarioParameters = {}) {
        super();
        if (id) {
            this.id = id;
        } else if (href) {
            this.id = href.replace(/.*\/(.*)$/, '$1');
        }
        this.domain = domain;
        this.scenario = scenario;
        this.type = type;
        this.fields = fields;
        this.href = href;
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to domain
     *
     * @param raw Raw CDISC API response
     */
    parseResponse(raw: any): void {
        this.domain = raw.domain;
        this.scenario = raw.scenario;
        const items: { [name: string]: Field } = {};
        if (Array.isArray(raw.fields)) {
            raw.fields.forEach((itemRaw: any) => {
                let href;
                if (itemRaw?._links?.self) {
                    href = itemRaw._links.self.href;
                }
                const item = new Field({
                    name: itemRaw.name,
                    href,
                    coreObject: this.coreObject
                });
                item.parseResponse(itemRaw);
                items[item.id] = item;
            });
        }
        if (raw.hasOwnProperty('_links')) {
            if (raw?._links?.self?.type) {
                this.type = raw._links.self.type;
            }
        }
        this.fields = items;
    }

    /**
     * Get an object with all variables/fields for that item set.
     *
     * @returns {Object} An object with variables/fields.
     */
    getItems(): Items {
        return ((new Domain(this)).getItems());
    }

    /**
     * Get an array with the list of names for all items.
     *
     * @returns {Array} An array with item names.
     */
    getNameList(): string[] {
        return ((new Domain(this)).getNameList());
    }

    /**
     * Find all matching variables/fields. For example TRxxPGy matches TR01PG12.
     *
     * @param {String} name Variable/Field name.
     * @param {Object} [options]  Matching options. {@link MatchingOptions}
     * @returns {Array} Array of matched items.
     */
    findMatchingItems(name: string, options: MatchingOptions): ItemType[] {
        return ((new Domain(this)).findMatchingItems(name, options));
    }
}

/**
 * CodeList constructor parameters.
 */
interface CodeListParameters {
    conceptId?: string;
    name?: string;
    extensible?: boolean;
    submissionValue?: string;
    definition?: string;
    preferredTerm?: string;
    synonyms?: string[];
    terms?: Term[];
    href?: string;
    coreObject?: CoreObject;
}

/**
 * CodeList class.
 */
export class CodeList extends BasicFunctions {
    /** CDISC Library attribute. */
    conceptId?: string;
    /** CDISC Library attribute. */
    name?: string;
    /** CDISC Library attribute. */
    extensible?: boolean;
    /** CDISC Library attribute. */
    submissionValue?: string;
    /** CDISC Library attribute. */
    definition?: string;
    /** CDISC Library attribute. */
    preferredTerm?: string;
    /** CDISC Library attribute. */
    synonyms?: string[];
    /** CDISC Library attribute. */
    terms?: Term[];

    constructor({ conceptId, extensible, name, submissionValue, definition, preferredTerm, synonyms, terms = [], href, coreObject }: CodeListParameters = {}) {
        super();
        if (conceptId) {
            this.conceptId = conceptId;
        } else if (href) {
            this.conceptId = href.replace(/.*\/(.*)$/, '$1');
        }
        this.name = name;
        this.extensible = extensible;
        this.submissionValue = submissionValue;
        this.definition = definition;
        this.preferredTerm = preferredTerm;
        this.synonyms = synonyms;
        this.terms = terms;
        this.href = href;
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to codelist.
     *
     * @param {Object} clRaw Raw CDISC API response.
     * @param {boolean} nciSiteResponse Indicates whether the reponse is from the NCI site
     */
    parseResponse(clRaw: any, nciSiteResponse = false): void {
        if (!nciSiteResponse) {
            this.conceptId = clRaw.conceptId;
            this.name = clRaw.name;
            if (clRaw.extensible === 'true') {
                this.extensible = true;
            } else if (clRaw.extensible === 'false') {
                this.extensible = false;
            }
            this.submissionValue = clRaw.submissionValue;
            this.definition = clRaw.definition;
            this.preferredTerm = clRaw.preferredTerm;
            this.synonyms = clRaw.synonyms;
            this.terms = clRaw.terms;
        } else {
            this.conceptId = clRaw._ExtCodeID;
            this.name = clRaw._Name;
            if (clRaw._CodeListExtensible === 'Yes') {
                this.extensible = true;
            } else {
                this.extensible = false;
            }
            this.submissionValue = clRaw.CDISCSubmissionValue;
            this.definition = clRaw?.Description?.TranslatedText['#text'];
            this.preferredTerm = clRaw.PreferredTerm;
            if (clRaw.CDISCSynonym !== undefined) {
                if (Array.isArray(clRaw.CDISCSynonym)) {
                    this.synonyms = clRaw.CDISCSynonym;
                } else {
                    this.synonyms = [clRaw.CDISCSynonym];
                }
            }
            let EnumeratedItem = clRaw.EnumeratedItem;
            if (!Array.isArray(EnumeratedItem)) {
                EnumeratedItem = [EnumeratedItem];
            }
            this.terms = EnumeratedItem.map((item: any) => {
                let synonyms;
                if (item.CDISCSynonym !== undefined) {
                    if (Array.isArray(item.CDISCSynonym)) {
                        synonyms = item.CDISCSynonym;
                    } else {
                        synonyms = [item.CDISCSynonym];
                    }
                }
                return {
                    conceptId: item._ExtCodeID,
                    submissionValue: item._CodedValue,
                    definition: item.CDISCDefinition,
                    preferredTerm: item.PreferredTerm,
                    synonyms,
                };
            });
        }
    }

    /**
     * Get codelist terms in a specific format.
     *
     * @param {String} [format=json] Specifies the output format. Possible values: json, csv.
     * @returns {String} Formatted codeList terms.
     */
    getFormattedTerms(format: 'json' | 'csv' = 'json'): Term[] | string {
        return convertToFormat(this.terms, format);
    }

    /**
     * Get the list of codelist versions.
     *
     * @returns {Array} List of CT versions.
     */
    async getVersions(): Promise<string[]> {
        const result: string[] = [];
        if (this.href && this.conceptId) {
            // Get CT type from href for the root href
            const ctType = this.href.replace(/.*\/ct\/packages\/(.*?)-.*/, '$1');
            const rootHref = `/mdr/root/ct/${ctType}/codelists/` + this.conceptId;
            const response = await this.coreObject.apiRequest(rootHref);
            if (typeof response === 'object' && response._links && Array.isArray(response._links.versions)) {
                response._links.versions.forEach((version: any) => {
                    result.push(version.href.replace(/.*\/mdr\/ct\/packages\/(.*?)\/.*/, '$1'));
                });
            }
        }
        return result;
    }
}

/**
 * Item constructor parameters.
 */
interface ItemParameters {
    id?: string;
    ordinal?: string;
    name?: string;
    label?: string;
    simpleDatatype?: string;
    codelist?: string;
    codelistHref?: string;
    type?: string;
    href?: string;
    coreObject?: CoreObject;
}

/**
 * Item class
 */
abstract class Item extends BasicFunctions {
    id?: string;
    /** CDISC Library attribute. */
    ordinal?: string;
    /** CDISC Library attribute. */
    name?: string;
    /** CDISC Library attribute. */
    label?: string;
    /** CDISC Library attribute. */
    simpleDatatype?: string;
    /** CDISC Library attribute. C-Code of the codelist. */
    codelist?: string;
    /** CDISC Library attribute. */
    codelistHref?: string;
    /** CDISC Library attribute. Value of the _links.self.type. */
    type?: string;

    constructor({ id, ordinal, name, label, simpleDatatype, codelist, codelistHref, type, href, coreObject }: ItemParameters = {}) {
        super();
        if (id) {
            this.id = id;
        } else if (href !== undefined) {
            // Get datastructure/dataset/domain abbreviation
            if (/\/(?:datastructures|datasets|domains)\//.test(href)) {
                this.id = href.replace(/.*\/(?:datastructures|datasets|domains)\/(.*?)\/.*\/(.*)$/, '$1.$2');
            } else {
                this.id = href.replace(/.*\/(.*)$/, '$1');
            }
        }
        this.ordinal = ordinal;
        this.name = name;
        this.label = label;
        this.simpleDatatype = simpleDatatype;
        this.codelist = codelist;
        this.codelistHref = codelistHref;
        this.type = type;
        this.href = href;
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to item.
     *
     * @param {Object} itemRaw Raw CDISC API response.
     */
    parseItemResponse(itemRaw: any): void {
        this.ordinal = itemRaw.ordinal;
        this.name = itemRaw.name;
        this.label = itemRaw.label;
        this.simpleDatatype = itemRaw.simpleDatatype;
        if (itemRaw.hasOwnProperty('_links')) {
            if (itemRaw._links.codelist && Array.isArray(itemRaw._links.codelist) && itemRaw._links.codelist.length > 0 && itemRaw._links.codelist[0].href) {
                this.codelistHref = itemRaw._links.codelist[0].href;
                this.codelist = itemRaw._links.codelist[0].href.replace(/.*\/(\S+)/, '$1');
            } else if (itemRaw?._links?.codelist?.href) {
                this.codelistHref = itemRaw._links.codelist.href;
                this.codelist = itemRaw._links.codelist.href.replace(/.*\/(\S+)/, '$1');
            }
            if (itemRaw?._links?.self?.type) {
                this.type = itemRaw._links.self.type;
            }
        }
    }

    /**
     * Get a Codelist object corresponding to the codelist used by the item.
     *
     * @param {String} [ctVer] Version of the CT, for example 2015-06-26. If blank, the last (not necessarily the latest) version will be returned.
     * @returns {Object|undefined} Instance of the CodeList class if item has a codelist.
     */
    async getCodeList(ctVer: string): Promise<CodeList | undefined> {
        if (this.codelistHref) {
            const rootCodeListRaw: any = await this.getRawResponse(this.codelistHref);
            if (rootCodeListRaw === undefined) {
                return;
            }
            if (rootCodeListRaw?._links?.versions) {
                let href;
                if (ctVer) {
                    rootCodeListRaw._links.versions.some((version: any) => {
                        if (version.href.includes(ctVer)) {
                            href = version.href;
                            return true;
                        }
                        return false;
                    });
                } else {
                    href = rootCodeListRaw._links.versions[rootCodeListRaw._links.versions.length - 1].href;
                }
                if (href) {
                    const codelist = new CodeList({ href, coreObject: this.coreObject });
                    await codelist.load();
                    return codelist;
                }
            }
        }
    }
}

/**
 * Variable constructor parameters.
 */
interface VariableParameters {
    id?: string;
    ordinal?: string;
    name?: string;
    label?: string;
    description?: string;
    core?: string;
    simpleDatatype?: string;
    role?: string;
    roleDescription?: string;
    valueList?: string[];
    codelist?: string;
    codelistHref?: string;
    describedValueDomain?: string;
    type?: string;
    href?: string;
    coreObject?: CoreObject;
}

/**
 * Variable class
 */
export class Variable extends Item {
    /** CDISC Library attribute. */
    description?: string;
    /** CDISC Library attribute. */
    core?: string;
    /** CDISC Library attribute. */
    role?: string;
    /** CDISC Library attribute. In most cases identical to role, but in some cases contains further explanation of the role attribute. */
    roleDescription?: string;
    /** CDISC Library attribute. */
    valueList?: string[];
    /** CDISC Library attribute. */
    describedValueDomain?: string;

    constructor({
        id, ordinal, name, label, description, core, simpleDatatype, role, roleDescription,
        valueList = [], codelist, codelistHref, describedValueDomain, type, href, coreObject
    }: VariableParameters = {}) {
        super({ id, ordinal, name, label, simpleDatatype, codelist, codelistHref, type, href, coreObject });
        this.description = description;
        this.core = core;
        this.role = role;
        this.roleDescription = roleDescription;
        this.valueList = valueList;
        this.describedValueDomain = describedValueDomain;
    }

    /**
     * Parse API response to variable
     *
     * @param vRaw Raw CDISC API response
     */
    parseResponse(vRaw: any): void {
        this.parseItemResponse(vRaw);
        this.description = vRaw.description;
        this.core = vRaw.core;
        this.role = vRaw.role;
        this.roleDescription = vRaw.roleDescription;
        this.valueList = vRaw.valueList;
        this.describedValueDomain = vRaw.describedValueDomain;
    }
}

/**
 * Variable constructor parameters.
 */
interface FieldParameters {
    id?: string;
    ordinal?: string;
    name?: string;
    label?: string;
    definition?: string;
    questionText?: string;
    prompt?: string;
    completionInstructions?: string;
    implementationNotes?: string;
    mappingInstructions?: string;
    sdtmigDatasetMappingTargetsHref?: string;
    simpleDatatype?: string;
    codelist?: string;
    codelistHref?: string;
    type?: string;
    href?: string;
    coreObject?: CoreObject;
}

/**
 * CDASH Field class
 */
export class Field extends Item {
    /** CDISC Library attribute. */
    definition?: string;
    /** CDISC Library attribute. */
    questionText?: string;
    /** CDISC Library attribute. */
    prompt?: string;
    /** CDISC Library attribute. */
    completionInstructions?: string;
    /** CDISC Library attribute. */
    implementationNotes?: string;
    /** CDISC Library attribute. */
    mappingInstructions?: string;
    /** CDISC Library attribute. */
    sdtmigDatasetMappingTargetsHref?: string;

    constructor({
        id, ordinal, name, label, definition, questionText, prompt, completionInstructions, implementationNotes,
        simpleDatatype, mappingInstructions, sdtmigDatasetMappingTargetsHref, codelist, codelistHref, type, href, coreObject
    }: FieldParameters = {}
    ) {
        super({ id, ordinal, name, label, simpleDatatype, codelist, codelistHref, type, href, coreObject });
        this.definition = definition;
        this.questionText = questionText;
        this.prompt = prompt;
        this.completionInstructions = completionInstructions;
        this.implementationNotes = implementationNotes;
        this.mappingInstructions = mappingInstructions;
        this.sdtmigDatasetMappingTargetsHref = sdtmigDatasetMappingTargetsHref;
    }

    /**
     * Parse API response to field.
     *
     * @param {Object} fRaw Raw CDISC API response.
     */
    parseResponse(fRaw: any): void {
        this.parseItemResponse(fRaw);
        this.definition = fRaw.definition;
        this.questionText = fRaw.questionText;
        this.prompt = fRaw.prompt;
        this.completionInstructions = fRaw.completionInstructions;
        this.implementationNotes = fRaw.implementationNotes;
        this.mappingInstructions = fRaw.mappingInstructions;
        if (fRaw.hasOwnProperty('_links')) {
            if (fRaw?._links?.sdtmigDatasetMappingTargets?.href) {
                this.sdtmigDatasetMappingTargetsHref = fRaw._links.sdtmigDatasetMappingTargets.href;
            }
        }
    }
}
