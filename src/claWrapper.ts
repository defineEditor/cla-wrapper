const apiRequest = require('./utils/apiRequest.js');
const convertToFormat = require('./utils/convertToFormat.js');
const matchItem = require('./utils/matchItem.js');

/**
 * MatchingOptions
 */
interface MatchingOptions {
    /** Match only full names, partial - match partial names. */
    mode: 'full' | 'partial';
    /** If true, returns only the first matching item, when false - returns all matching items. */
    firstOnly: boolean;
}
const defaultMatchingOptions : MatchingOptions = { mode: 'full', firstOnly: false };

/**
 * GetItemGroupOptions
 */
interface GetItemGroupOptions {
    /** Specifies the output format. Possible values: json, csvj. */
    format?: 'csv' | 'json';
}
const defaultGetItemGroupOptions: GetItemGroupOptions = {};

/**
 * GetItemGroupsOptions
 */
interface GetItemGroupsOptions {
    /** Specifies whether a short or full description of itemGroups is required. Possible values: short, long (default). */
    type?: 'short' | 'long';
    /** Specifies the output format. Possible values: json, csv. */
    format?: 'csv' | 'json';
}
const defaultGetItemGroupsOptions: GetItemGroupsOptions = { type: 'long' };

/**
 * Information about traffic used by the wrapper
*/
interface Traffic {
    /** Inbound traffic. */
    incoming: number,
    /** Outbound traffic. */
    outgoing: number,
};

/**
 * Functions handling cache.
 */
interface ClCache {
    /** Returns a Promise that resolves to the response associated with the matching request. */
    match: (req: Request) => Promise<Request>,
    /**
     * Takes both a request and its response and adds it to the given cache.
     * Response must contain the body attribute.
     * Do not create connection attribute in the cached response, in order to avoid traffic count.
     */
    put: (req: Request, res: Response) => Promise<any>,
};

/**
 * Request options.
 */
interface ApiRequestOptions {
    /** Additional headers for the request. */
    headers?: object;
    /** If true, a raw response is returned. By default the response body is returned. */
    returnRaw?: boolean;
    /** If true, cache will not be used for that request. */
    noCache?: boolean;
}

interface ProductClasses {
    [name: string]: ProductClass
}

interface ProductDetailsShort {
    id: string;
    label: string;
}

interface ProductDetailsLong {
    [name: string]: any
}

type ProductDetails =
    ProductDetailsShort |
    ProductDetailsLong
;

/**
 * CoreObject constructor parameters.
 */
interface CoreObjectParameters {
    username?: string;
    password?: string;
    apiKey?: string;
    baseUrl?: string;
    cache?: ClCache;
    traffic?: Traffic;
}

class CoreObject {
    /**
     * CDISC Library Core Object which contains API request functions and technical information.
    */
    /**  CDISC Library username. Used in case of Basic Authentication. */
    username?: string;
    /**  CDISC Library password. Used in case of Basic Authentication. */
    password?: string;
    /**  CDISC Library API primary key. Used in case of OAuth2 Authentication. */
    apiKey?: string;
    /**  A base URL for the library. */
    baseUrl?: string;
    /** @ApiRequestOptions */
    cache?: ClCache;
    /** @Traffic */
    traffic?: Traffic;

    constructor ({
        username,
        password,
        apiKey,
        baseUrl,
        cache,
        traffic
    } : CoreObjectParameters) {
        this.username = username;
        this.password = password;
        this.apiKey = apiKey;
        this.cache = cache;
        if (baseUrl !== undefined) {
            this.baseUrl = baseUrl;
        } else {
            this.baseUrl = 'https://library.cdisc.org/api';
        }
        if (traffic !== undefined) {
            this.traffic = traffic;
        } else {
            this.traffic = {
                incoming: 0,
                outgoing: 0
            };
        }
    }

    /**
     * Make an API request
     *
     * @param endpoint CDISC Library API endpoint.
     * @param __namedParameters Request options {@link ApiRequestOptions}.
     * @returns API response, if API request failed a blank object is returned.
     */

    async apiRequest (endpoint: string, { headers, returnRaw = false, noCache = false} : ApiRequestOptions = {}) : Promise<any> {
        // Default options
        try {
            const response = await apiRequest({
                username: this.username,
                password: this.password,
                apiKey: this.apiKey,
                url: this.baseUrl + endpoint,
                headers,
                cache: noCache ? undefined : this.cache,
            });
            // Count traffic
            if (response.connection) {
                this.traffic.incoming += response.connection.bytesRead;
                this.traffic.outgoing += response.connection.bytesWritten;
            }
            if (returnRaw) {
                return response;
            }
            if (response.statusCode === 200) {
                return JSON.parse(response.body);
            } else if (response.statusCode) {
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
    abstract parseResponse(response: object, id?: string) : void;

    /**
     * Get raw API response
     *
     * @param href CDISC Library API endpoint. If not specified, href attribute of the object is used.
     * @returns Returns a JSON response if the request was successfull, otherwise returns undefined.
     */
    async getRawResponse (href?: string) : Promise<object|undefined> {
        let link = href;
        if (href === undefined && this.href !== undefined) {
            link = this.href;
        }
        if (this.coreObject && link) {
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
    async load (href?: string) : Promise<boolean> {
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
    toSimpleObject () : object {
        const result: { [name: string]: any} = {};
        for (const prop in this) {
            // Remove all techical or inherited properties
            if (prop !== 'coreObject' && this.hasOwnProperty(prop)) {
                result[prop] = this[prop];
            }
        }
        return result;
    }
}

/**
 * CdiscLibrary constructor parameters.
 */
interface CdiscLibraryParameters extends CoreObjectParameters {
    productClasses?: ProductClasses;
}

class CdiscLibrary {
    /**
     * CDISC Library Main class
    */

    /** CLA Wrapper attribute. {@link CoreObject} */
    coreObject: CoreObject;
    /** An object with product classes. */
    productClasses: ProductClasses;
    /*
     * @param {Object} params
     * @param {String} params.username {@link CoreObject.username}
     * @param {String} params.password {@link CoreObject.password}
     * @param {String} params.apiKey {@link CoreObject.apiKey}
     * @param {String} [params.baseUrl=https://library.cdisc.org/api] {@link CoreObject.baseUrl}
     * @param {Object} [cache] {@link CoreObject.cache}
     * @param {Object} [traffic] {@link CoreObject.traffic}
     */
    constructor ({ username, password, apiKey, baseUrl, cache, traffic, productClasses } : CdiscLibraryParameters = {}) {
        this.coreObject = new CoreObject({ username, password, apiKey, baseUrl, cache, traffic });
        this.productClasses = productClasses;
    }

    /**
     * Checks connection to the CDISC Library API
     *
     * @returns Returns response status code and description
     */
    async checkConnection () : Promise<object> {
        let response;
        let result : {
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
    async getLastUpdated () : Promise<object> {
        let response;
        let result : any = {};
        try {
            response = await this.coreObject.apiRequest('/mdr/lastupdated', { noCache: true });
            if (response !== undefined) {
                result = response;
                if (result._links) {
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
        if (this.productClasses) {
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
    async getProductClassList (): Promise<Array<string>> {
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
    async getProductGroupList () : Promise<Array<string>>  {
        let result: Array<string> = [];
        const pcList = await this.getProductClassList();
        pcList.forEach(pcId => {
            result = result.concat(this.productClasses[pcId].getProductGroupList());
        });
        return result;
    }

    /**
     * Get a list of product IDs
     *
     * @param format Specifies the output format. Possible values: json, csv.
     * @returns List of product names (IDs)
     */
    async getProductList (format = 'json') : Promise<Array<string>> {
        let result: Array<string> = [];
        const pcList = await this.getProductClassList();
        pcList.forEach(pcId => {
            result = result.concat(this.productClasses[pcId].getProductList() as Array<string>);
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
    async getFullProduct (alias: string, loadBasicInfo?: boolean) : Promise<any> {
        let result;
        const pcs = await this.getProductClasses();
        // Get IDs
        const productFullId = await this.getProductIdByAlias(alias);
        if (productFullId) {
            const pgs = pcs[productFullId.productClassId].productGroups;
            const pg = pgs[productFullId.productGroupId];
            if (loadBasicInfo === true) {
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
    async getItemGroup (name: string, productAlias: string, options: GetItemGroupOptions) : Promise<Domain|DataStructure|Dataset> {
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
     * @param alias Product alias
     * @param options @GetItemGroupsOptions
     * @returns An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the itemGroup information from the CDISC Library.
     */
    async getItemGroups (productAlias: string, options: GetItemGroupsOptions): Promise<{ [name: string] : Domain|DataStructure|Dataset }> {
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
    async getProductDetails ({ type = 'short', format = 'json' } : GetItemGroupsOptions  = {}) : Promise<Array<ProductDetails>> {
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
    async getProductIdByAlias (alias: string) : Promise<{productClassId: string; productGroupId: string; productId: string}|undefined> {
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
}

/**
 * Product class
 */

class ProductClass extends BasicFunctions {
    /** Product class name. */
    name: string;
    /** An object with Product Groups. */
    productGroups: { [name: string]: ProductGroup };
    constructor({ name, productGroups, coreObject }: { name?: string; productGroups?: { [name: string]: ProductGroup }, coreObject?: CoreObject } = {}) {
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
    parseResponse (pcRaw: any, name: string) : void {
        this.name = name;
        const productGroups : { [name: string] : ProductGroup } = {};
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
    getProductGroups () : { [name: string] : ProductGroup } {
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
    getProductGroupList (): Array<string> {
        if (this.productGroups) {
            return Object.keys(this.productGroups);
        } else {
            return [];
        }
    }

    /**
     * Get a list of product IDs
     *
     * @param Specifies the output format. Possible values: json, csv.
     * @returns List of product names (IDs)
     */
    getProductList (format: 'json' | 'csv' = 'json') : object | string {
        let result: Array<string> = [];
        const pgList = this.getProductGroupList();
        pgList.forEach(pgId => {
            result = result.concat(this.getProductGroups()[pgId].getProductList() as Array<string>);
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
    async getItemGroup (name: string, productAlias: string, options: GetItemGroupOptions) : Promise<Dataset|DataStructure|Domain> {
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
     * @param options @GetItemGroupsOptions
     * @returns An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the dataset information from the CDISC Library.
     */
    async getItemGroups (productAlias: string, options: GetItemGroupsOptions): Promise<{ [name: string]: Dataset|DataStructure|Domain }> {
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
        });
        return result;
    }
}

/**
 * Product Group class
 */

class ProductGroup extends BasicFunctions {
    /** Product group name. */
    name: string;
    /** An object with products.*/
    products: { [name: string] : Product };
    constructor ({ name, products = {}, coreObject } : { name?: string; products?: { [name: string] : Product }; coreObject?: CoreObject } = {}) {
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
    parseResponse (pgRaw: Array<object>, name: string) : void {
        this.name = name;
        const products = {};
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
    getProductList (format = 'json') : Array<string> | object {
        let result: Array<string> = [];
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
            const productList = this.getProductList() as Array<string>;
            // Try exact match first, then make it less strict
            productId = productList.find(id => (alias.toLowerCase() === id.toLowerCase()));
            // Remove - and .
            if (!productId) {
                productId = productList.find(id => (alias.toLowerCase().replace(/[-.]/g, '') === id.toLowerCase().replace(/[-.]/g, '')));
            }
            // Search by substring
            if (!productId) {
                productId = productList.find(id => (id.toLowerCase().replace(/[-.]/g, '')).includes(alias.toLowerCase().replace(/[-.]/g, '')));
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
            if (loadBasicInfo === true) {
                return this.products[id];
            } else {
                const productRaw = await this.coreObject.apiRequest(this.products[id].href);
                product = new Product({ ...this.products[id] });
                product.parseResponse(productRaw);
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
    async getItemGroup (name: string, productAlias: string, options?: GetItemGroupOptions) : Promise<Dataset|DataStructure|Domain> {
        const defaultedOptions = { ...defaultGetItemGroupOptions, ...options };
        const idObj = this.getProductIdByAlias(productAlias);
        if (idObj) {
            return this.products[idObj.productId].getItemGroup(name, defaultedOptions);
        }
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
    async getItemGroups (productAlias: string, options?: GetItemGroupsOptions): Promise<{ [name: string]: Dataset|DataStructure|Domain}> {
        const defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        const idObj = this.getProductIdByAlias(productAlias);
        if (idObj) {
            const id = idObj.productId;
            if (this.products[id].fullyLoaded !== true && defaultedOptions.type !== 'short') {
                // If the product is not fully loaded
                await this.getFullProduct(id);
                return this.products[id].getItemGroups(defaultedOptions);
            } else {
                // When a short description is required of the product is fully loaded
                return this.products[id].getItemGroups(defaultedOptions);
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
    model?: string;
    datasetType?: string;
    dependencies?: { [name: string]: ProductDependency };
    fullyLoaded?: boolean;
    coreObject?: CoreObject;
}

/**
 *
 * Product dependency.
 */
interface ProductDependency {
    id: string;
    href: string;
    title: string;
    class: string;
}

/**
 * Product class
 */
class Product extends BasicFunctions {
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
    datasetType?: string;
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

        if (this.model === 'ADaM' && !this.dataStructures) {
            this.dataStructures = {};
        }
        if (['SDTM', 'SEND', 'CDASH'].includes(this.model) && !this.dataClasses) {
            this.dataClasses = {};
        }
        this.fullyLoaded = fullyLoaded;
        this.dependencies = dependencies;
    }

    /**
     * Parse API response to product
     *
     * @param {Object} pRaw Raw CDISC API response
     */
    parseResponse (pRaw: any): void {
        this.name = pRaw.name;
        this.description = pRaw.description;
        this.source = pRaw.source;
        this.effectiveDate = pRaw.effectiveDate;
        this.registrationStatus = pRaw.registrationStatus;
        this.version = pRaw.version;
        if (pRaw.hasOwnProperty('dataStructures')) {
            const dataStructures = {};
            pRaw.dataStructures.forEach(dataStructureRaw => {
                let href;
                if (dataStructureRaw._links && dataStructureRaw._links.self) {
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
            pRaw.classes.forEach(dataClassRaw  => {
                let href;
                if (dataClassRaw._links && dataClassRaw._links.self) {
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
            const codelists = {};
            pRaw.codelists.forEach((codeListRaw: any) => {
                let href;
                if (codeListRaw._links && codeListRaw._links.self) {
                    href = codeListRaw._links.self.href;
                }
                const codeList = new CodeList({
                    name: codeListRaw.name,
                    href,
                    coreObject: this.coreObject
                });
                codeList.parseResponse(codeListRaw);
                codelists[codeList.conceptId] = codeList;
            });
            this.codelists = codelists;
        }
        if (pRaw._links) {
            const dependencies: { [name: string]: ProductDependency} = {};
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
    }

    /**
     * Get an object with all variables/fields for that product
     *
     * @returns {Object} An object with variables/fields
     */
    async getItems (): Promise<{ [name:string]: Variable|Item|Field }> {
        if (this.fullyLoaded === true) {
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
    getCurrentItems (): { [name:string]: Variable|Item|Field } {
        let sourceObject;
        let result: { [name:string]: Variable|Item|Field }   = {};
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
    async getItemGroups (options?: GetItemGroupsOptions): Promise<any> {
        const defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        let result: any = {};
        if (defaultedOptions.type !== 'short') {
            if (this.fullyLoaded === true) {
                result = this.getCurrentItemGroups();
            } else {
                // Load the full product
                const productRaw = await this.coreObject.apiRequest(this.href);
                this.parseResponse(productRaw);
                this.fullyLoaded = true;
            }
        } else {
            if (this.fullyLoaded === true) {
                const itemGroups = this.getCurrentItemGroups();
                Object.values(itemGroups).forEach(itemGroup => {
                    result[itemGroup.name] = { name: itemGroup.name, label: itemGroup.label };
                });
            } else {
                const datasetsHref = `${this.href}/${this.datasetType.toLowerCase()}`;
                const itemGroupsRaw = await this.coreObject.apiRequest(datasetsHref);
                if (itemGroupsRaw && itemGroupsRaw._links && itemGroupsRaw._links[this.datasetType]) {
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
                let formatted: Array<object> = [];
                Object.values(result).forEach(itemGroup => {
                    formatted = formatted.concat(itemGroup.getFormattedItems('json', true));
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
    getCurrentItemGroups (): { [name: string]: Dataset|DataStructure|Domain } {
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
    async getItemGroup (name: string, options?: GetItemGroupOptions) : Promise<Dataset|DataStructure|Domain> {
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
                if (dsRaw._links && dsRaw._links.parentClass) {
                    const dcRaw = dsRaw._links.parentClass;
                    const dataClass = new DataClass({
                        ...dcRaw,
                        coreObject: this.coreObject
                    });
                    dataClass.name = dataClass.id;
                    if (this.dataClasses && this.dataClasses.hasOwnProperty(dataClass.id)) {
                        // If the dataClass is already present, add the dataset to it
                        this.dataClasses[dataClass.id][this.datasetType][result.id] = result;
                    } else {
                        // Otherwise create a new data class
                        dataClass[this.datasetType] = { [result.id]: result };
                        this.dataClasses[dataClass.id] = dataClass;
                    }
                }
            }
        }
        if (defaultedOptions.format === undefined) {
            return result;
        } else {
            return result.getFormattedItems(defaultedOptions.format);
        }
    }

    /**
     * Find all matching variables/fields. For example TRxxPGy matches TR01PG12.
     *
     * @param {String} name Variable/Field name.
     * @param {Object} [options]  Matching options. {@link MatchingOptions}
     * @returns {Array} Array of matched items.
     */
    findMatchingItems (name: string, options?: MatchingOptions): Array<Variable|Item|Field> {
        // Default options
        const defaultedOptions = { ...defaultMatchingOptions, ...options };
        let result: Array<Variable|Item|Field> = [];
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
                    if (defaultedOptions.firstOnly === true) {
                        return true;
                    }
                }
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
    async getCodeListList (options: GetItemGroupsOptions = { type: 'long'}): Promise<Array<{ conceptId: string; preferredTerm: string; href?: string }>> {
        const result: Array<{ conceptId: string; preferredTerm: string; href?: string }> = [];
        if (!this.codelists) {
            const codeListsHref = `${this.href}/codelists`;
            const clRaw = await this.coreObject.apiRequest(codeListsHref);
            if (clRaw.hasOwnProperty('_links') && clRaw._links.hasOwnProperty('codelists')) {
                const codelists = {};
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
    async getCodeList (codeListId: string, options: GetItemGroupOptions = {}): Promise<CodeList> {
        let ct;
        if (this.codelists && this.codelists[codeListId]) {
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
}

class Dataset {

}

class DataStructure {

}

class Domain {

}

module.exports = {
    CoreObject,
};
