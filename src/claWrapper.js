const apiRequest = require('./utils/apiRequest.js');
const convertToFormat = require('./utils/convertToFormat.js');
const matchItem = require('./utils/matchItem.js');

/**
 * MatchingOptions
 * @typedef {Object} MatchingOptions
 */
const defaultMatchingOptions = { mode: 'full', firstOnly: false };

/**
 * GetItemGroupOptions
 * @typedef {Object} GetItemGroupOptions
 * @property {String} format - Specifies the output format. Possible values: json, csv.
 */
const defaultGetItemGroupOptions = {};

/**
 * GetItemGroupsOptions
 * @typedef {Object} GetItemGroupsOptions
 * @property {Boolean} type - Specifies whether a short or full description of itemGroups is required. Possible values: short, long (default).
 * @property {String} format - Specifies the output format. Possible values: json, csv.
 */
const defaultGetItemGroupsOptions = { type: 'long' };

class CoreObject {
    /**
     * CDISC Library Core Object which contains API request functions and technical information.
     * @param {String} username CDISC Library username.
     * @param {String} password CDISC Library password.
     * @param {String} [baseUrl=https://library.cdisc.org/api] A base URL for the library.
     * @param {Object} [cache] An optional object containing functions handling cache. This object must implement the following functions:
     * @param {Function} cache.match(request) Returns a Promise that resolves to the response associated with the matching request.
     * @param {Function} cache.put(request&#44;response) Takes both a request and its response and adds it to the given cache.
     * Response must contain the body attribute.
     * Do not create connection attribute in the cached response, in order to avoid traffic count.
     * @param {Object} [traffic] Object containing information about traffic used by the wrapper.
     * @param {Integer} traffic.incoming Inbound traffic
     * @param {Integer} traffic.outgoing Outbound traffic
     */
    constructor ({ username, password, baseUrl, cache, traffic } = {}) {
        this.username = username;
        this.password = password;
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
     * @param {String} endpoint CDISC Library API endpoint.
     * @param {Object} [options] Request options.
     * @param {Object} [options.headers] Additional headers for the request.
     * @param {Boolean} [options.returnRaw=false] If true, a raw response is returned. By default the response body is returned.
     * @param {Boolean} [options.noCache=false] If true, cache will not be used for that request.
     * @returns {Object} API response, if API request failed a blank object is returned.
     */
    async apiRequest (endpoint, options = {}) {
        // Default options
        let headers = options.headers;
        let returnRaw = options.returnRaw || false;
        let noCache = options.noCache || false;
        try {
            let response = await apiRequest({
                username: this.username,
                password: this.password,
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

class BasicFunctions {
    /**
     * Functions used in multiple classes
     */

    /**
     * Get raw API response
     *
     * @param {String} [href=this.href] CDISC Library API endpoint. If not specified, href attribute of the object is used.
     * @returns {Object|undefined} Returns a JSON response if the request was successfull, otherwise returns undefined.
     */
    async getRawResponse (href) {
        let link = href;
        if (href === undefined && this.href !== undefined) {
            link = this.href;
        }
        if (this.coreObject && link) {
            let response = await this.coreObject.apiRequest(link);
            if (typeof response === 'object') {
                return response;
            }
        }
    }

    /**
     * Load object from the CDISC Library
     *
     * @param {String} [href=this.href] CDISC Library API endpoint. If not specified, href attribute of the object is used.
     * @returns {boolean} Returns true in the object was successfully loaded, false otherwise
     */
    async load (href) {
        let response = await this.getRawResponse(href);
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
    toSimpleObject () {
        let result = {};
        for (let prop in this) {
            // Remove all techical or inherited properties
            if (prop !== 'coreObject' && this.hasOwnProperty(prop)) {
                result[prop] = this[prop];
            }
        }
        return result;
    }
}

class CdiscLibrary {
    /**
     * CDISC Library Main class
     * @param {Object} params
     * @param {String} params.username CDISC Library username.
     * @param {String} params.password CDISC Library password.
     * @param {String} [params.baseUrl=https://library.cdisc.org/api] A base URL for the library.
     * @param {Object} [cache] An optional object containing functions handling cache. This object must implement the following functions:
     * @param {Function} cache.match(request) Returns a Promise that resolves to the response associated with the matching request.
     * @param {Function} cache.put(request&#44;response) Takes both a request and its response and adds it to the given cache.
     * Response must contain the body attribute.
     * Do not create connection attribute in the cached response, in order to avoid traffic count.
     * @param {Object} [traffic] Object containing information about traffic used by the wrapper.
     * @param {Integer} traffic.incoming Inbound traffic
     * @param {Integer} traffic.outgoing Outbound traffic
     * @property {Object} productClasses An object with product classes.
     * @property {Object} coreObject CLA Wrapper attribute. Object used to send API requests and store technical information. Must be the same object for all classes within an instance of a CdiscLibrary class.
     */
    constructor ({ username, password, baseUrl, cache, traffic, productClasses } = {}) {
        this.coreObject = new CoreObject({ username, password, baseUrl, cache, traffic });
        this.productClasses = productClasses;
    }

    /**
     * Checks connection to the CDISC Library API
     *
     * @returns {Object} Returns response status code and description
     */
    async checkConnection () {
        let response;
        let result;
        try {
            response = await this.coreObject.apiRequest('/health', { returnRaw: true, noCache: true });
            result = { statusCode: response.statusCode };
        } catch (error) {
            response = { statusCode: -1, description: error.message };
        }
        if (response.statusCode === 200) {
            let data;
            try {
                data = JSON.parse(response.body);
                if (data.healthy === true) {
                    result.description = 'OK';
                } else if (data.healthy === false) {
                    result.statusCode = -1;
                    result.description = 'CDISC Library status is unhealthy';
                } else {
                    result.statusCode = -1;
                    result.description = 'Unexpected status from the /health endpoint';
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
     * Get product classes
     *
     * @returns {Object} Product classes
     */
    async getProductClasses () {
        if (this.productClasses) {
            return this.productClasses;
        }
        let productClasses = {};
        let dataRaw = await this.coreObject.apiRequest('/mdr/products');
        if (dataRaw.hasOwnProperty('_links')) {
            Object.keys(dataRaw._links).forEach(pcId => {
                if (pcId !== 'self') {
                    let pcRaw = dataRaw._links[pcId];
                    productClasses[pcId] = new ProductClass({ coreObject: this.coreObject });
                    productClasses[pcId].parseResponse(pcId, pcRaw);
                }
            });
            this.productClasses = productClasses;
        }
        return productClasses;
    }

    /**
     * Get a list of product class names
     *
     * @returns {Array} Array of product class names
     */
    async getProductClassList () {
        if (this.productClasses) {
            return Object.keys(this.productClasses);
        } else {
            return Object.keys(await this.getProductClasses());
        }
    }

    /**
     * Get a list of product group names
     *
     * @returns {Array} Array of product group names
     */
    async getProductGroupList () {
        let result = [];
        let pcList = await this.getProductClassList();
        pcList.forEach(pcId => {
            result = result.concat(this.productClasses[pcId].getProductGroupList());
        });
        return result;
    }

    /**
     * Get a list of product IDs
     *
     * @param {String} [format=json] Specifies the output format. Possible values: json, csv.
     * @returns {Object|String} List of product names (IDs)
     */
    async getProductList (format = 'json') {
        let result = [];
        let pcList = await this.getProductClassList();
        pcList.forEach(pcId => {
            result = result.concat(this.productClasses[pcId].getProductList());
        });
        return convertToFormat(result, format);
    }

    /**
     * Get an object with a loaded product
     *
     * @param {String} alias Product alias. Examples: sdtmig3-3, sdtm1.7, adamig11.
     * @param {Boolean} [loadBasicInfo] If true, will load only basic product details. By default a full product is loaded.
     * @returns {Object} Product
     */
    async getFullProduct (alias, loadBasicInfo) {
        let result;
        let pcs = await this.getProductClasses();
        // Get IDs
        let productFullId = await this.getProductIdByAlias(alias);
        if (productFullId) {
            let pgs = pcs[productFullId.productClassId].productGroups;
            let pg = pgs[productFullId.productGroupId];
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
     * @param name {String} Dataset name.
     * @param productAlias {String} Product name alias. Examples: sdtmig3-3, sdtm1.7, adamig11.
     * @param options {GetItemGroupOptions}
     * @returns {Object} Dataset/DataStructure/Domain
     */
    async getItemGroup (name, productAlias, options) {
        let result;
        let defaultedOptions = { ...defaultGetItemGroupOptions, ...options };
        if (!this.productClasses) {
            await this.getProductClasses();
        }
        for (let productClass of Object.values(this.productClasses)) {
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
     * @param options {GetItemGroupsOptions}
     * @returns {Object} An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the itemGroup information from the CDISC Library.
     */
    async getItemGroups (productAlias, options) {
        let defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        let result;
        if (!this.productClasses) {
            await this.getProductClasses();
        }
        for (let productClass of Object.values(this.productClasses)) {
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
     * @param {Object} options Detail options
     * @param {String} [options.type=short] Short/extended list of product attributes. Possible values: short, long
     * @param {String} [options.format=json] Output format. Possible values: json, csv.
     * @returns {Object|String} Product list with details
     */
    async getProductDetails ({ type = 'short', format = 'json' } = {}) {
        let result = [];
        let productClasses = await this.getProductClasses();
        Object.values(productClasses).forEach(pc => {
            Object.values(pc.getProductGroups()).forEach(pg => {
                Object.values(pg.getProducts()).forEach(product => {
                    let productDetails = {};
                    if (type === 'short') {
                        productDetails.id = product.id;
                        productDetails.label = product.label;
                    } else if (type === 'long') {
                        for (let prop in product) {
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
     * @param {String} [type=all] Type of the traffic. Possible values: all, incoming, outgoin.
     * @param {String} [format=char] Output format. If char is used, the result will be returned in a human-readable format (34kb, 5.3MB). Possible values: char, num.
     * @returns {String|Integer} Traffic used in a human-readable format or number of bytes
     */
    getTrafficStats (type = 'all', format = 'char') {
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
     * @param {String} name Product name alias
     * @returns {Object|undefined} Product, product group, product class IDs
     */
    async getProductIdByAlias (alias) {
        let result;
        let productClasses = this.productClasses;
        if (!productClasses) {
            productClasses = await this.getProductClasses();
        }
        Object.keys(productClasses).some(pcId => {
            let res = productClasses[pcId].getProductIdByAlias(alias);
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
    reset () {
        delete this.productClasses;
        this.productClasses = undefined;
    }
}

class ProductClass extends BasicFunctions {
    /**
     * Product class
     * @extends BasicFunctions
     *
     * @property {String} name Product class name.
     * @property {Object} productGroups An object with Product Groups.
     * @property {Object} coreObject CLA Wrapper attribute. Object used to send API requests and store technical information. Must be the same object for all classes within an instance of a CdiscLibrary class.
     */
    constructor ({ name, productGroups, coreObject } = {}) {
        super();
        this.name = name;
        this.productGroups = productGroups;
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to product classes
     *
     * @param {String} name Product class name.
     * @param {Oject} pcRaw Raw CDISC API response.
     */
    parseResponse (name, pcRaw) {
        this.name = name;
        let productGroups = {};
        if (pcRaw.hasOwnProperty('_links')) {
            Object.keys(pcRaw._links).forEach(pgId => {
                if (pgId !== 'self') {
                    let pgRaw = pcRaw._links[pgId];
                    productGroups[pgId] = new ProductGroup({ coreObject: this.coreObject });
                    productGroups[pgId].parseResponse(pgId, pgRaw);
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
    getProductGroups () {
        if (this.productGroups) {
            return this.productGroups;
        } else {
            return {};
        }
    }

    /**
     * Get a list of product group names
     *
     * @returns {Array} Array of product groups
     */
    getProductGroupList () {
        if (this.productGroups) {
            return Object.keys(this.productGroups);
        } else {
            return [];
        }
    }

    /**
     * Get a list of product IDs
     *
     * @param {String} [format=json] Specifies the output format. Possible values: json, csv.
     * @returns {Object|String} List of product names (IDs)
     */
    getProductList (format = 'json') {
        let result = [];
        let pgList = this.getProductGroupList();
        pgList.forEach(pgId => {
            result = result.concat(this.getProductGroups()[pgId].getProductList());
        });
        return convertToFormat(result, format);
    }

    /**
     * Get a dataset/dataStructure/domain for a specific product
     *
     * @param {String} name Dataset name
     * @param {String} productAlias  Product name alias. Examples: sdtmig3-3, sdtm1.7, adamig11.
     * @param {GetItemGroupOptions} options
     * @returns {Object} Dataset/DataStruture/Domain
     */
    async getItemGroup (name, productAlias, options) {
        let result;
        let defaultedOptions = { ...defaultGetItemGroupOptions, ...options };
        for (let productGroup of Object.values(this.productGroups)) {
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
     * @param {GetItemGroupsOptions} options
     * @returns {Object} An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the dataset information from the CDISC Library.
     */
    async getItemGroups (productAlias, options) {
        let defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        let result;
        for (let productGroup of Object.values(this.productGroups)) {
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
     * @param {String} name Product name alias
     * @returns {Object|undefined} Product and product group IDs
     */
    getProductIdByAlias (alias) {
        let result;
        let productGroups = this.getProductGroups();
        Object.keys(productGroups).some(pgId => {
            let res = productGroups[pgId].getProductIdByAlias(alias);
            if (res !== undefined) {
                result = { productGroupId: pgId, ...res };
                return true;
            }
        });
        return result;
    }
}

class ProductGroup extends BasicFunctions {
    /**
     * Product Group class
     * @extends BasicFunctions
     *
     * @property {String} name Product group name.
     * @property {Object} products An object with products.
     * @property {Object} coreObject CLA Wrapper attribute. Object used to send API requests and store technical information. Must be the same object for all classes within an instance of a CdiscLibrary class.
     */
    constructor ({ name, products = {}, coreObject } = {}) {
        super();
        this.name = name;
        this.products = products;
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to product groups
     *
     * @param name {String} name
     * @param pgRaw {String} Raw CDISC API response
     */
    parseResponse (name, pgRaw) {
        this.name = name;
        let products = {};
        pgRaw.forEach(gRaw => {
            let product = new Product({ ...gRaw, coreObject: this.coreObject });
            products[product.id] = product;
        });
        this.products = products;
    }

    /**
     * Get oll products for this product group
     *
     * @returns {Object} Products
     */
    getProducts () {
        if (this.products) {
            return this.products;
        } else {
            return {};
        }
    }

    /**
     * Get a list of product IDs
     *
     * @param {String} [format=json] Specifies the output format. Possible values: json, csv.
     * @returns {Object|String} List of product names (IDs)
     */
    getProductList (format = 'json') {
        let result;
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
     * @param {String} name Product name alias
     * @returns {Object|undefined} Product ID
     */
    getProductIdByAlias (alias) {
        let productId;
        if (this.products) {
            let productList = this.getProductList();
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
     * @param {Boolean} [loadBasicInfo] If true, will load only basic product details. By default a full product is loaded.
     * @returns {Object} Product
     */
    async getFullProduct (alias, loadBasicInfo) {
        let product;
        let idObj = this.getProductIdByAlias(alias);
        if (idObj !== undefined) {
            let id = idObj.productId;
            if (loadBasicInfo === true) {
                return this.products[id];
            } else {
                let productRaw = await this.coreObject.apiRequest(this.products[id].href);
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
     * @param {GetItemGroupOptions} options
     * @returns {Object} Dataset/DataStruture/Domain
     */
    async getItemGroup (name, productAlias, options) {
        let defaultedOptions = { ...defaultGetItemGroupOptions, ...options };
        let idObj = this.getProductIdByAlias(productAlias);
        if (idObj) {
            return this.products[idObj.productId].getItemGroup(name, defaultedOptions);
        }
    }

    /**
     * Get an object with all datasets/domains/dataStructure
     * <br> This method does not update the main object
     *
     * @param {GetItemGroupsOptions} options
     * @returns {Object} An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the dataset information from the CDISC Library.
     */
    async getItemGroups (productAlias, options) {
        let defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        let idObj = this.getProductIdByAlias(productAlias);
        if (idObj) {
            let id = idObj.productId;
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

class Product extends BasicFunctions {
    /**
     * Product class
     * @extends BasicFunctions
     *
     * @property {String} id CLA Wrapper attribute. Data structure ID.
     * @property {String} name CDISC Library attribute.
     * @property {String} label CDISC Library attribute.
     * @property {String} title CDISC Library attribute.
     * @property {String} type CDISC Library attribute.
     * @property {String} description CDISC Library attribute.
     * @property {String} effectiveDate CDISC Library attribute.
     * @property {String} registrationStatus CDISC Library attribute.
     * @property {String} version CDISC Library attribute.
     * @property {Object} dataClasses CDISC Library attribute. Corresponds to CDISC Library classes attribute.
     * @property {Object} dataStructures CDISC Library attribute.
     * @property {Object} codelists CDISC Library attribute.
     * @property {String} href CDISC Library attribute.
     * @property {String} model CLA Wrapper attribute. Model of the product (e.g., ADaM, SDTM, SEND, CDASH)
     * @property {String} datasetType CLA Wrapper attribute. Name of the attribute which contains child groups (e.g., dataStructures, dataClasses, domains, codelits)
     * @property {Boolean} fullyLoaded CLA Wrapper attribute. Set to TRUE when the product is fully loaded, FALSE otherwise.
     * @property {Object} coreObject CLA Wrapper attribute. Object used to send API requests and store technical information. Must be the same object for all classes within an instance of a CdiscLibrary class.
     */
    constructor ({
        id, name, title, label, type, description, source, effectiveDate,
        registrationStatus, version, dataClasses, dataStructures, codelists, href,
        coreObject, model, datasetType, fullyLoaded = false,
    } = {}) {
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
    }

    /**
     * Parse API response to product
     *
     * @param {Object} pRaw Raw CDISC API response
     */
    parseResponse (pRaw) {
        this.name = pRaw.name;
        this.description = pRaw.description;
        this.source = pRaw.source;
        this.effectiveDate = pRaw.effectiveDate;
        this.registrationStatus = pRaw.registrationStatus;
        this.version = pRaw.version;
        if (pRaw.hasOwnProperty('dataStructures')) {
            let dataStructures = {};
            pRaw.dataStructures.forEach(dataStructureRaw => {
                let href;
                if (dataStructureRaw._links && dataStructureRaw._links.self) {
                    href = dataStructureRaw._links.self.href;
                }
                let dataStructure = new DataStructure({
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
            let dataClasses = {};
            pRaw.classes.forEach(dataClassRaw => {
                let href;
                if (dataClassRaw._links && dataClassRaw._links.self) {
                    href = dataClassRaw._links.self.href;
                }
                let dataClass = new DataClass({
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
            let codelists = {};
            pRaw.codelists.forEach(codeListRaw => {
                let href;
                if (codeListRaw._links && codeListRaw._links.self) {
                    href = codeListRaw._links.self.href;
                }
                let codeList = new CodeList({
                    name: codeListRaw.name,
                    href,
                    coreObject: this.coreObject
                });
                codeList.parseResponse(codeListRaw);
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
    async getItems () {
        if (this.fullyLoaded === true) {
            return this.getCurrentItems();
        } else {
            // Load the full product
            let productRaw = await this.coreObject.apiRequest(this.href);
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
    getCurrentItems () {
        let sourceObject;
        let result = {};
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
     * @param {GetItemGroupsOptions} options
     * @returns {Object} An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the dataset information from the CDISC Library.
     */
    async getItemGroups (options) {
        let defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        let result = {};
        if (defaultedOptions.type !== 'short') {
            if (this.fullyLoaded === true) {
                result = this.getCurrentItemGroups();
            } else {
                // Load the full product
                let productRaw = await this.coreObject.apiRequest(this.href);
                this.parseResponse(productRaw);
                this.fullyLoaded = true;
            }
        } else {
            if (this.fullyLoaded === true) {
                let itemGroups = this.getCurrentItemGroups();
                Object.values(itemGroups).forEach(itemGroup => {
                    result[itemGroup.name] = { name: itemGroup.name, label: itemGroup.label };
                });
            } else {
                let datasetsHref = `${this.href}/${this.datasetType.toLowerCase()}`;
                let itemGroupsRaw = await this.coreObject.apiRequest(datasetsHref);
                if (itemGroupsRaw && itemGroupsRaw._links && itemGroupsRaw._links[this.datasetType]) {
                    itemGroupsRaw._links[this.datasetType].forEach(dsRaw => {
                        let name = dsRaw.href.replace(/.*\/(.*)$/, '$1');
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
                let formatted = [];
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
    getCurrentItemGroups () {
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
     * @param {GetItemGroupOptions} options
     * @returns {Object} Dataset/DataStruture/Domain
     */
    async getItemGroup (name, options) {
        let result;
        let defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        // Check if dataset is already present;
        let loadedDatasets = this.getCurrentItemGroups();
        let datasetId;
        Object.values(loadedDatasets).some(dataset => {
            if (dataset.name.toUpperCase() === name.toUpperCase()) {
                datasetId = dataset.id;
                return true;
            }
        });
        if (datasetId) {
            result = loadedDatasets[datasetId];
        } else {
            let href = `${this.href}/${this.datasetType.toLowerCase()}/${name.toUpperCase()}`;
            let dsRaw = await this.coreObject.apiRequest(href);
            if (dsRaw === null) {
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
                    let dcRaw = dsRaw._links.parentClass;
                    let dataClass = new DataClass({
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
     * @param {Object} [options]  Matching options.
     * @param {String} [options.mode=full] Match only full names, partial - match partial names.
     * @param {Boolean} [options.firstOnly=false] If true, returns only the first matching item, when false - returns all matching items.
     * @returns {Array} Array of matched items.
     */
    findMatchingItems (name, options) {
        // Default options
        let defaultedOptions = { ...defaultMatchingOptions, ...options };
        let result = [];
        let sourceObject;
        if (this.dataStructures) {
            sourceObject = this.dataStructures;
        } else if (this.dataClasses) {
            sourceObject = this.dataClasses;
        }
        if (sourceObject) {
            Object.values(sourceObject).some(obj => {
                let matches = obj.findMatchingItems(name, defaultedOptions);
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
     * @param {Boolean} [options.short] Keep only preferred term and ID in the result.
     * @param {String} [options.format=json] Specifies the output format. Possible values: json, csv.
     * @returns {Array} Array of codelist IDs and titles.
     */
    async getCodeListList (options = {}) {
        let result = [];
        if (!this.codelists) {
            let codeListsHref = `${this.href}/codelists`;
            let clRaw = await this.coreObject.apiRequest(codeListsHref);
            if (clRaw.hasOwnProperty('_links') && clRaw._links.hasOwnProperty('codelists')) {
                let codelists = {};
                clRaw._links.codelists.forEach(codeListRaw => {
                    let codeList = new CodeList({
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
            if (options.short) {
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
    async getCodeList (codeListId, options = {}) {
        let ct;
        if (this.codelists && this.codelists[codeListId]) {
            ct = this.codelists[codeListId];
        }
        // If not found, try to loaded it. Even when found it is possible that the codelist is not fully loaded
        if ((ct === undefined && !this.fullyLoaded) || (ct && ct.terms.length < 1)) {
            let href = this.href + '/codelists/' + codeListId;
            let codeList = new CodeList({
                href,
                coreObject: this.coreObject
            });
            let loaded = await codeList.load();
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

class DataStructure extends BasicFunctions {
    /**
     * Data Structure class
     * @extends BasicFunctions
     *
     * @property {String} id CLA Wrapper attribute. Data structure ID.
     * @property {String} name CDISC Library attribute.
     * @property {String} label CDISC Library attribute.
     * @property {String} description CDISC Library attribute.
     * @property {String} className CDISC Library attribute.
     * @property {Object} analysisVariableSets CDISC Library attribute.
     * @property {String} href CDISC Library attribute.
     * @property {Object} coreObject CLA Wrapper attribute. Object used to send API requests and store technical information. Must be the same object for all classes within an instance of a CdiscLibrary class.
     */
    constructor ({ name, label, description, className, analysisVariableSets, href, coreObject } = {}) {
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
    parseResponse (dsRaw) {
        this.name = dsRaw.name;
        this.label = dsRaw.label || dsRaw.title;
        this.description = dsRaw.description;
        this.className = dsRaw.className;
        let analysisVariableSets = {};
        if (dsRaw.hasOwnProperty('analysisVariableSets')) {
            dsRaw.analysisVariableSets.forEach(analysisVariableSetRaw => {
                let href;
                let id;
                if (analysisVariableSetRaw._links && analysisVariableSetRaw._links.self) {
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
    getItems () {
        let result = {};
        if (this.analysisVariableSets) {
            Object.values(this.analysisVariableSets).forEach(analysisVariableSet => {
                result = { ...result, ...analysisVariableSet.getItems() };
            });
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
    findMatchingItems (name, options) {
        // Default options
        let defaultedOptions = { ...defaultMatchingOptions, ...options };
        let result = [];
        if (this.analysisVariableSets) {
            Object.values(this.analysisVariableSets).some(analysisVariableSet => {
                let matches = analysisVariableSet.findMatchingItems(name, defaultedOptions);
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
     * Get items in a specific format.
     *
     * @param {String} format Specifies the output format. Possible values: json, csv.
     * @param {Boolean} [addItemGroupId=false] If set to true, itemGroup name is added to each records.
     * @returns {String|Array} String with formatted items or an array with item details.
     */
    getFormattedItems (format, addItemGroupId = false) {
        let result = [];
        if (this.analysisVariableSets) {
            Object.values(this.analysisVariableSets).forEach(analysisVariableSet => {
                result = result.concat(analysisVariableSet.getFormattedItems('json', addItemGroupId, { dataStructure: this.id }));
            });
            return convertToFormat(result, format);
        }
    }

    /**
     * Get an array or object with variable sets and their descriptions in a specific format.
     *
     * @param {Object} [options]  Format options.
     * @param {Bool} [options.descriptions=false] Will return an object with variable set IDs and their labels.
     * @returns {Object|Array} List of variable sets.
     */
    getVariableSetList (options = {}) {
        const analysisVariableSets = this.analysisVariableSets || {};
        if (typeof options === 'object' && options.descriptions) {
            let result = {};
            Object.keys(analysisVariableSets).forEach(id => {
                result[id] = analysisVariableSets[id].label;
            });
            return result;
        } else {
            return Object.keys(analysisVariableSets);
        }
    }
}

class DataClass extends BasicFunctions {
    /**
     * Dataset Class class
     * @extends BasicFunctions
     *
     * @property {String} id CLA Wrapper attribute. Data class ID.
     * @property {String} ordinal CDISC Library attribute.
     * @property {String} name CDISC Library attribute.
     * @property {String} label CDISC Library attribute.
     * @property {String} description CDISC Library attribute.
     * @property {Object} datasets CDISC Library attribute.
     * @property {Object} domains CDISC Library attribute.
     * @property {Object} classVariables CDISC Library attribute.
     * @property {Object} cdashModelFields CDISC Library attribute.
     * @property {Object} analysisVariableSets CDISC Library attribute.
     * @property {String} href CDISC Library attribute.
     * @property {Object} coreObject CLA Wrapper attribute. Object used to send API requests and store technical information. Must be the same object for all classes within an instance of a CdiscLibrary class.
     */
    constructor ({ ordinal, name, label, description, datasets, domains, classVariables, cdashModelFields, href, coreObject } = {}) {
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
     * @param {Object} domainsRaw Raw CDISC API response with domains, used for CDASH endpoints
     */
    parseResponse (dcRaw, domainsRaw) {
        this.name = dcRaw.name;
        this.ordinal = dcRaw.ordinal;
        this.label = dcRaw.label;
        this.description = dcRaw.description;
        if (!this.href && dcRaw._links && dcRaw._links.self) {
            this.href = dcRaw._links.self.href;
        }
        if (dcRaw.hasOwnProperty('datasets')) {
            let datasets = {};
            dcRaw.datasets.forEach(datasetRaw => {
                let href;
                let id;
                if (datasetRaw._links && datasetRaw._links.self) {
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
            let rawDomains = dcRaw.domains || domainsRaw;
            let domains = {};
            rawDomains
                .filter(domainRaw => {
                    if (domainRaw._links && domainRaw._links.parentClass) {
                        return domainRaw._links.parentClass.href === this.href;
                    }
                })
                .forEach(domainRaw => {
                    let href;
                    let id;
                    if (domainRaw._links && domainRaw._links.self) {
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
            let classVariables = {};
            if (dcRaw.hasOwnProperty('classVariables')) {
                dcRaw.classVariables.forEach(variableRaw => {
                    let href;
                    if (variableRaw._links && variableRaw._links.self) {
                        href = variableRaw._links.self.href;
                    }
                    let variable = new Variable({
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
            let cdashModelFields = {};
            if (dcRaw.hasOwnProperty('cdashModelFields')) {
                dcRaw.cdashModelFields.forEach(fieldRaw => {
                    let href;
                    if (fieldRaw._links && fieldRaw._links.self) {
                        href = fieldRaw._links.self.href;
                    }
                    let field = new Field({
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
    getItems (options = { immediate: false }) {
        let result = {};
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
     * Get an object with all datasets/domains
     *
     * @returns {Object} An object with datasets/domains
     */
    getItemGroups () {
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
    findMatchingItems (name, options) {
        // Default options
        let defaultedOptions = { ...defaultMatchingOptions, ...options };
        let result = [];
        if (this.datasets) {
            Object.values(this.datasets).some(dataset => {
                let matches = dataset.findMatchingItems(name, defaultedOptions);
                if (matches.length > 0) {
                    result = result.concat(matches);
                    if (defaultedOptions.firstOnly === true) {
                        return true;
                    }
                }
            });
        }
        if (this.classVariables && !(defaultedOptions.firstOnly && result.length > 0)) {
            for (let variable of Object.values(this.classVariables)) {
                if (matchItem(name, variable, defaultedOptions.mode)) {
                    result.push(variable);
                    if (defaultedOptions.firstOnly === true) {
                        break;
                    }
                }
            }
        }
        if (this.cdashModelFields && !(defaultedOptions.firstOnly && result.length > 0)) {
            for (let field of Object.values(this.cdashModelFields)) {
                if (matchItem(name, field, defaultedOptions.mode)) {
                    result.push(field);
                    if (defaultedOptions.firstOnly === true) {
                        break;
                    }
                }
            }
        }
        return result;
    }
}

class ItemGroup extends BasicFunctions {
    /**
     * Item Set class: base for Dataset, DataStructure, Domain
     * @extends BasicFunctions
     *
     * @property {String} name CDISC Library attribute.
     * @property {String} label CDISC Library attribute.
     * @property {String} type CDISC Library attribute. Value of the _links.self.type.
     * @property {String} href CDISC Library attribute.
     * @property {String} id CLA Wrapper attribute. Item group class ID.
     * @property {String} itemType CLA Wrapper attribute. Name of the item type (field, analysisVariable, datasetVariable). Corresponds to an object name of the classes which are extending ItemGroup class (Dataset, Domain, VariableSet).
     * @property {Object} coreObject CLA Wrapper attribute. Object used to send API requests and store technical information. Must be the same object for all classes within an instance of a CdiscLibrary class.
     */
    constructor ({ id, name, label, itemType, type, href, coreObject } = {}) {
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
    parseItemGroupResponse (itemRaw) {
        this.name = itemRaw.name;
        this.label = itemRaw.label;
        let items = {};
        if (itemRaw.hasOwnProperty(this.itemType)) {
            itemRaw[this.itemType].forEach(itemRaw => {
                let href;
                if (itemRaw._links && itemRaw._links.self) {
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
            if (itemRaw._links.self && itemRaw._links.self.type) {
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
    getItems () {
        let result = {};
        if (this[this.itemType]) {
            Object.values(this[this.itemType]).forEach(item => {
                result[item.id] = item;
            });
        }
        if (this.scenarios) {
            Object.values(this.scenarios).forEach(scenario => {
                result = { ...result, ...scenario.getItems() };
            });
        }
        return result;
    }

    /**
     * Get an array with the list of names for all items.
     *
     * @returns {Array} An array with item names.
     */
    getNameList () {
        let result = [];
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
     * @param {Object} [options]  Matching options.
     * @param {String} [options.mode=full] Match only full names, partial - match partial names.
     * @param {Boolean} [options.firstOnly=false] If true, returns only the first matching item, when false - returns all matching items.
     * @returns {Array} Array of matched items.
     */
    findMatchingItems (name, options) {
        // Default options
        let defaultedOptions = { ...defaultMatchingOptions, ...options };
        let result = [];
        if (this[this.itemType]) {
            Object.values(this[this.itemType]).some(variable => {
                if (matchItem(name, variable, defaultedOptions.mode)) {
                    result.push(variable);
                    if (defaultedOptions.firstOnly === true) {
                        return true;
                    }
                }
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
    getFormattedItems (format, addItemGroupId = false, additionalProps) {
        let items = this.getItems();
        let result = [];
        Object.values(items).forEach(item => {
            let updatedItem = {};
            if (addItemGroupId === true) {
                updatedItem = { itemGroup: this.id, ...item };
            } else {
                updatedItem = { ...item };
            }
            if (additionalProps) {
                updatedItem = { ...additionalProps, ...updatedItem };
            }
            if (item.valueList && item.valueList.length > 0) {
                updatedItem.valueList = item.valueList.join(',');
            }
            // Remove all properties, which are Objects
            for (let prop in updatedItem) {
                if (typeof updatedItem[prop] === 'object') {
                    delete updatedItem[prop];
                }
            }
            result.push(updatedItem);
        });
        return convertToFormat(result, format);
    }
}

class Dataset extends ItemGroup {
    /**
     * Dataset class. Extends ItemGroup class.
     * @extends ItemGroup
     *
     * @property {Object} description CDISC Library attribute.
     * @property {Object} dataStructure CDISC Library attribute.
     * @property {Object} datasetVariables CDISC Library attribute.
     */
    constructor ({ id, name, label, description, dataStructure, datasetVariables = {}, href, coreObject } = {}) {
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
    parseResponse (raw) {
        this.parseItemGroupResponse(raw);
        this.description = raw.description;
        this.dataStructure = raw.dataStructure;
    }
}

class AnalysisVariableSet extends ItemGroup {
    /**
     * Analysis Variable Set class. Extends ItemGroup class.
     * @extends ItemGroup
     *
     * @property {Object} analysisVariables CDISC Library attribute.
     */
    constructor ({ id, name, label, analysisVariables = {}, href, coreObject } = {}) {
        super({ id, name, label, itemType: 'analysisVariables', href, coreObject });
        this.analysisVariables = analysisVariables;
    }

    /**
     * Parse API response to variable set
     *
     * @param raw Raw CDISC API response
     */
    parseResponse (raw) {
        this.parseItemGroupResponse(raw);
    }
}

class Domain extends ItemGroup {
    /**
     * Domain class. Extends ItemGroup class.
     * @extends ItemGroup
     *
     * @property {Object} fields CDISC Library attribute.
     * @property {Object} scenarios CDISC Library attribute. Value of _links.scenarios.
     */
    constructor ({ id, name, label, fields = {}, scenarios, href, coreObject } = {}) {
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
    parseResponse (raw, scenariosRaw) {
        this.parseItemGroupResponse(raw);
        if (raw._links && Array.isArray(raw._links.scenarios)) {
            let scenarios = {};
            raw._links.scenarios.forEach(scenarioRaw => {
                let scenario = new Scenario({
                    href: scenarioRaw.href,
                    coreObject: this.coreObject,
                });
                if (Array.isArray(scenariosRaw)) {
                    scenariosRaw.some(scRaw => {
                        if (scRaw._links && scRaw._links.self && scRaw._links.self.href === scenario.href) {
                            scenario.parseResponse(scRaw);
                            return true;
                        }
                    });
                }
                scenarios[scenario.id] = scenario;
            });
            this.scenarios = scenarios;
        }
    }
}

class Scenario {
    /**
     * Scenario class.
     *
     * @property {Object} domain CDISC Library attribute.
     * @property {Object} scenario CDISC Library attribute.
     * @property {String} type CDISC Library attribute. Value of the _links.self.type.
     * @property {Object} fields CDISC Library attribute.
     * @property {String} id CLA Wrapper attribute. Item group class ID.
     */
    constructor ({ id, domain, scenario, type, fields = {}, href, coreObject } = {}) {
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
    parseResponse (raw) {
        this.domain = raw.domain;
        this.scenario = raw.scenario;
        let items = {};
        if (Array.isArray(raw.fields)) {
            raw.fields.forEach(itemRaw => {
                let href;
                if (itemRaw._links && itemRaw._links.self) {
                    href = itemRaw._links.self.href;
                }
                let item = new Field({
                    name: itemRaw.name,
                    href,
                    coreObject: this.coreObject
                });
                item.parseResponse(itemRaw);
                items[item.id] = item;
            });
        }
        if (raw.hasOwnProperty('_links')) {
            if (raw._links.self && raw._links.self.type) {
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
    getItems () {
        return ((new Domain(this)).getItems());
    }

    /**
     * Get an array with the list of names for all items.
     *
     * @returns {Array} An array with item names.
     */
    getNameList () {
        return ((new Domain(this)).getNameList());
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
    findMatchingItems (name, options) {
        return ((new Domain(this)).findMatchingItems(name, options));
    }
}

class CodeList extends BasicFunctions {
    /**
     * CodeList class
     * @extends BasicFunctions
     *
     * @property {String} conceptId CDISC Library attribute.
     * @property {String} name CDISC Library attribute.
     * @property {String} extensible CDISC Library attribute.
     * @property {String} submissionValue CDISC Library attribute.
     * @property {String} definition CDISC Library attribute.
     * @property {String} preferredTerm CDISC Library attribute.
     * @property {String} synonyms CDISC Library attribute.
     * @property {Object} terms CDISC Library attribute.
     * @property {String} href CDISC Library attribute.
     * @property {Object} coreObject CLA Wrapper attribute. Object used to send API requests and store technical information. Must be the same object for all classes within an instance of a CdiscLibrary class.
     */
    constructor ({ conceptId, extensible, name, submissionValue, definition, preferredTerm, synonyms, terms = [], href, coreObject } = {}) {
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
     */
    parseResponse (clRaw) {
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
    }

    /**
     * Get codelist terms in a specific format.
     *
     * @param {String} [format=json] Specifies the output format. Possible values: json, csv.
     * @returns {String} Formatted codeList terms.
     */
    getFormattedTerms (format = 'json') {
        return convertToFormat(this.terms, format);
    }
}

class Item extends BasicFunctions {
    /**
     * Item class
     * @extends BasicFunctions
     *
     * @property {String} ordinal CDISC Library attribute.
     * @property {String} name CDISC Library attribute.
     * @property {String} label CDISC Library attribute.
     * @property {String} simpleDatatype CDISC Library attribute.
     * @property {String} codelist CDISC Library attribute. C-Code of the codelist.
     * @property {String} codelistHref CDISC Library attribute.
     * @property {String} type CDISC Library attribute. Value of the _links.self.type.
     * @property {String} href CDISC Library attribute.
     * @property {Object} id CLA Wrapper attribute. Item ID.
     * @property {Object} coreObject CLA Wrapper attribute. Object used to send API requests and store technical information. Must be the same object for all classes within an instance of a CdiscLibrary class.
     */
    constructor ({ id, ordinal, name, label, simpleDatatype, codelist, codelistHref, type, href, coreObject } = {}) {
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
    parseItemResponse (itemRaw) {
        this.ordinal = itemRaw.ordinal;
        this.name = itemRaw.name;
        this.label = itemRaw.label;
        this.simpleDatatype = itemRaw.simpleDatatype;
        if (itemRaw.hasOwnProperty('_links')) {
            if (itemRaw._links.codelist && Array.isArray(itemRaw._links.codelist) && itemRaw._links.codelist.length > 0 && itemRaw._links.codelist[0].href) {
                this.codelistHref = itemRaw._links.codelist[0].href;
                this.codelist = itemRaw._links.codelist[0].href.replace(/.*\/(\S+)/, '$1');
            } else if (itemRaw._links.codelist && itemRaw._links.codelist.href) {
                this.codelistHref = itemRaw._links.codelist.href;
                this.codelist = itemRaw._links.codelist.href.replace(/.*\/(\S+)/, '$1');
            }
            if (itemRaw._links.self && itemRaw._links.self.type) {
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
    async getCodeList (ctVer) {
        if (this.codelistHref) {
            let rootCodeListRaw = await this.getRawResponse(this.codelistHref);
            if (rootCodeListRaw === undefined) {
                return;
            }
            if (rootCodeListRaw._links && rootCodeListRaw._links.versions) {
                let href;
                if (ctVer) {
                    rootCodeListRaw._links.versions.some(version => {
                        if (version.href.includes(ctVer)) {
                            href = version.href;
                            return true;
                        }
                    });
                } else {
                    href = rootCodeListRaw._links.versions[rootCodeListRaw._links.versions.length - 1].href;
                }
                if (href) {
                    let codelist = new CodeList({ href, coreObject: this.coreObject });
                    await codelist.load();
                    return codelist;
                }
            }
        }
    }
}

class Variable extends Item {
    /**
     * Variable class
     * @extends Item
     *
     * @property {String} description CDISC Library attribute.
     * @property {String} core CDISC Library attribute.
     * @property {String} role CDISC Library attribute.
     * @property {String} roleDescription CDISC Library attribute. In most cases identical to role, but in some cases contains further explanation of the role attribute.
     * @property {Array}  valueList CDISC Library attribute.
     * @property {String} describedValueDomain CDISC Library attribute.
     */
    constructor ({ id, ordinal, name, label, description, core, simpleDatatype, role, roleDescription,
        valueList = [], codelist, codelistHref, describedValueDomain, href, coreObject
    } = {}) {
        super({ id, ordinal, name, label, simpleDatatype, codelist, codelistHref, href, coreObject });
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
    parseResponse (vRaw) {
        this.parseItemResponse(vRaw);
        this.description = vRaw.description;
        this.core = vRaw.core;
        this.role = vRaw.role;
        this.roleDescription = vRaw.roleDescription;
        this.valueList = vRaw.valueList;
        this.describedValueDomain = vRaw.describedValueDomain;
    }
}

class Field extends Item {
    /**
     * CDASH Field class
     * @extends Item
     *
     * @property {String} definition CDISC Library attribute.
     * @property {String} questionText CDISC Library attribute.
     * @property {String} prompt CDISC Library attribute.
     * @property {String} completionInstructions CDISC Library attribute. In most cases identical to role, but in some cases contains further explanation of the role attribute.
     * @property {String} implementationNotes CDISC Library attribute.
     * @property {String} mappingInstructions CDISC Library attribute.
     * @property {String} sdtmigDatasetMappingTargetsHref CDISC Library attribute.
     */
    constructor ({ id, ordinal, name, label, definition, questionText, prompt, completionInstructions, implementationNotes,
        simpleDatatype, mappingInstructions, sdtmigDatasetMappingTargetsHref, codelist, codelistHref, href, coreObject } = {}
    ) {
        super({ id, ordinal, name, label, simpleDatatype, codelist, codelistHref, href, coreObject });
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
    parseResponse (fRaw) {
        this.parseItemResponse(fRaw);
        this.definition = fRaw.definition;
        this.questionText = fRaw.questionText;
        this.prompt = fRaw.prompt;
        this.completionInstructions = fRaw.completionInstructions;
        this.implementationNotes = fRaw.implementationNotes;
        this.mappingInstructions = fRaw.mappingInstructions;
        if (fRaw.hasOwnProperty('_links')) {
            if (fRaw._links.sdtmigDatasetMappingTargets && fRaw._links.sdtmigDatasetMappingTargets.href) {
                this.sdtmigDatasetMappingTargetsHref = fRaw._links.sdtmigDatasetMappingTargets.href;
            }
        }
    }
}

module.exports = {
    CdiscLibrary,
    ProductClass,
    ProductGroup,
    Product,
    DataStructure,
    Dataset,
    Domain,
    DataClass,
    AnalysisVariableSet,
    Variable,
    Field,
    CodeList,
};
