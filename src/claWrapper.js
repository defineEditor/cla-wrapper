const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
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
 * @property {Boolean} short - Specifies that only a short description of itemGroups is required
 * @property {String} format - Specifies the output format. Possible values: json, csv.
 */
const defaultGetItemGroupsOptions = { short: 'false' };

class CoreObject {
    /**
     * CDISC Library Core Object which contains API request functions and technical information
     */
    constructor ({ username, password, baseUrl } = {}) {
        this.username = username;
        this.password = password;
        if (baseUrl !== undefined) {
            this.baseUrl = baseUrl;
        } else {
            this.baseUrl = 'https://library.cdisc.org/api';
        }
        this.traffic = {
            incoming: 0,
            outgoing: 0
        };
    }

    /**
     * Make an API request
     *
     * @param endpoint CDISC Library API endpoint
     * @returns {Object|Number} API response, if API request failed, a status code is returned
     */
    async apiRequest (endpoint) {
        if (endpoint === '/mdr/products') {
            let data = await readFile(path.join(path.resolve(), '/data/mdrproducts.json'), 'utf8');
            return JSON.parse(data);
        } else if (endpoint === '/mdr/adam/adamig-1-1') {
            let data = await readFile(path.join(path.resolve(), '/data/adamig-1-1.json'), 'utf8');
            return JSON.parse(data);
        } else if (endpoint === '/mdr/sdtmig/3-3') {
            let data = await readFile(path.join(path.resolve(), '/data/sdtmig-3-3.json'), 'utf8');
            return JSON.parse(data);
        } else if (endpoint === '/mdr/cdash/1-0') {
            let data = await readFile(path.join(path.resolve(), '/data/cdash1-0.json'), 'utf8');
            return JSON.parse(data);
        } else if (endpoint === '/mdr/cdashig/2-0') {
            let data = await readFile(path.join(path.resolve(), '/data/cdashig2-0.json'), 'utf8');
            return JSON.parse(data);
        } else if (endpoint === '/mdr/sdtm/1-7') {
            let data = await readFile(path.join(path.resolve(), '/data/sdtm-1-7.json'), 'utf8');
            return JSON.parse(data);
        } else if (endpoint === '/mdr/sdtmig/3-3/datasets') {
            let data = await readFile(path.join(path.resolve(), '/data/sdtmig3-3.datasets.json'), 'utf8');
            return JSON.parse(data);
        } else if (endpoint === '/mdr/adam/adamig-1-1/datastructures/ADSL/variables/USUBJID') {
            let data = await readFile(path.join(path.resolve(), '/data/adamig-1-1.adsl.usubjid.json'), 'utf8');
            return JSON.parse(data);
        } else {
            let response = await apiRequest({ username: this.username, password: this.password, url: this.baseUrl + endpoint });
            // Count traffic
            if (response.connection) {
                this.traffic.incoming += response.connection.bytesRead;
                this.traffic.outgoing += response.connection.bytesWritten;
            }
            if (response.statusCode === 200) {
                return JSON.parse(response.body);
            } else if (response.statusCode !== undefined) {
                return response.statusCode;
            } else {
                throw new Error('Request failed with code. Response was: ' + response.body);
            }
        }
    }
}

class BasicFunctions {
    /**
     * Functions used in multiple classes
     */

    /**
     * Load object from the CDISC Library
     *
     * @param {String} [href] CDISC Library API endpoint
     * @returns {boolean} Rerutns true in the object was successfully loaded, false otherwise
     */
    async load (href) {
        let link = href;
        if (href === undefined && this.href !== undefined) {
            link = this.href;
        }
        if (this.coreObject && link) {
            let response = await this.coreObject.apiRequest(link);
            if (typeof response === 'object') {
                this.parseResponse(response);
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }
}

class CdiscLibrary {
    /**
     * CDISC Library Main class
     */
    constructor ({ username, password, baseUrl, productClasses } = {}) {
        this.coreObject = new CoreObject({ username, password, baseUrl });
        this.productClasses = productClasses;
    }

    /**
     * Checks connection to the CDISC Library API
     *
     * @returns {boolean} Rerutns true in case of success, throws an error otherwise
     */
    async checkConnection () {
        let response = await this.coreObject.apiRequest('/mdr/adam/adamig-1-1/datastructures/ADSL/variables/USUBJID');
        if (response && response.name === 'USUBJID') {
            return true;
        } else {
            throw new Error('Could not establish connection to the CDISC Library. Server response was: ' + response);
        }
    }

    /**
     * Get an object with product classes
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
            Object.keys(dataRaw['_links']).forEach(pcId => {
                if (pcId !== 'self') {
                    let pcRaw = dataRaw['_links'][pcId];
                    productClasses[pcId] = new ProductClass({ coreObject: this.coreObject });
                    productClasses[pcId].parseResponse(pcId, pcRaw);
                }
            });
        }
        this.productClasses = productClasses;
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
     * Get an object with product by name or alias
     *
     * @param alias Product alias. Examples: sdtmig3-3, sdtm1.7, adamig11.
     * @returns {Object} Product
     */
    async getFullProduct (alias) {
        let result;
        let pcs = await this.getProductClasses();
        // Get IDs
        let productFullId = {};
        Object.keys(pcs).some(pcId => {
            let pgs = pcs[pcId].getProductGroups();
            Object.keys(pgs).some(pgId => {
                // Find product by name
                let pId = pgs[pgId].getProductNameByAlias(alias);
                if (pId !== undefined) {
                    productFullId = {
                        productClassId: pcId,
                        productGroupId: pgId,
                        productId: pId,
                    };
                    return true;
                }
            });
        });
        if (productFullId.productClassId) {
            let pgs = pcs[productFullId.productClassId].productGroups;
            let pg = pgs[productFullId.productGroupId];
            result = await pg.getFullProduct(productFullId.productId);
        }
        return result;
    }

    /**
     * Get a dataset/dataStructure for a specific product
     *
     * @param name {String} Dataset name
     * @param options {GetItemGroupOptions}
     * @param productAlias {String} Product name alias. Examples: sdtmig3-3, sdtm1.7, adamig11.
     * @returns {Object} Dataset
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
     * Get an object with all datasets/domains/dataStructure
     * <br> This method does not update the main object
     *
     * @param options {GetItemGroupsOptions}
     * @returns {Object} An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the dataset information from the CDISC Library.
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
     * Get an object with all datasets/domains/dataStructure
     * <br> This method does not update the main object
     *
     * @param options {Object} Detail options
     * <br> type='short' {String} Short/extended list of product attributes. Possible values: short, long
     * <br> format='object' {String} Output format. Possible values: json, csv, object
     * @returns {Object|String} Product list with details
     */
    async getProductDetails ({ type = 'short', format = 'object' } = {}) {
        let result = [];
        await this.getProductClasses();
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
        if (format === 'object') {
            return result;
        } else {
            return convertToFormat(result, format);
        }
    }

    /**
     * Get traffic used by the library in a human-readable format
     *
     * @param type='all' {String} Type of the traffic. Possible values: all, incoming, outgoing
     * @param format='char' {String} Output format. Possible values: char, num
     * @returns {String|Integer} Traffic used in a human-readable format or number of bytes
     */
    getTraffic (type = 'all', format = 'char') {
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
}

class ProductClass extends BasicFunctions {
    /**
     * Product class
     * @extends BasicFunctions
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
     * @param name Product class name
     * @param pcRaw Raw CDISC API response
     */
    parseResponse (name, pcRaw) {
        this.name = name;
        let productGroups = {};
        if (pcRaw.hasOwnProperty('_links')) {
            Object.keys(pcRaw['_links']).forEach(pgId => {
                if (pgId !== 'self') {
                    let pgRaw = pcRaw['_links'][pgId];
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
     * Get a dataset/dataStructure for a specific product
     *
     * @param name {String} Dataset name
     * @param options {GetItemGroupOptions}
     * @param productAlias {String} Product name alias. Examples: sdtmig3-3, sdtm1.7, adamig11.
     * @returns {Object} Dataset
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
     * @param options {GetItemGroupsOptions}
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
}

class ProductGroup extends BasicFunctions {
    /**
     * Product Group class
     * @extends BasicFunctions
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
     * @returns {undefined}
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
     * Get an object with products
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
     * Get a list of product names
     *
     * @returns {Array} List of product names (IDs)
     */
    getProductList () {
        if (this.products) {
            return Object.keys(this.getProducts()).map(pId => this.products[pId].id);
        } else {
            return [];
        }
    }

    /**
     * Get a product name by alias or substring, e.g. adamig11 agamig1-1 adamig1.1 will return adamig-1-1
     *
     * @param name {String} Product name alias
     * @returns {?String} Product name
     */
    getProductNameByAlias (alias) {
        let productName;
        if (this.products) {
            let productList = this.getProductList();
            // Try exact match first, then make it less strict
            productName = productList.find(id => (alias.toLowerCase() === id.toLowerCase()));
            // Remove - and .
            if (!productName) {
                productName = productList.find(id => (alias.toLowerCase().replace(/[-.]/g, '') === id.toLowerCase().replace(/[-.]/g, '')));
            }
            // Search by substring
            if (!productName) {
                productName = productList.find(id => (id.toLowerCase().replace(/[-.]/g, '')).includes(alias.toLowerCase().replace(/[-.]/g, '')));
            }
        }
        return productName;
    }
    /**
     * Get an object with product by name
     *
     * @param name {String} Product name alias
     * @returns {Object} Product
     */
    async getFullProduct (alias) {
        let product;
        let id = this.getProductNameByAlias(alias);
        if (id !== undefined) {
            let productRaw = await this.coreObject.apiRequest(this.products[id].href);
            product = new Product({ ...this.products[id] });
            product.parseResponse(productRaw);
            product.fullyLoaded = true;
            this.products[id] = product;
        }
        return product;
    }

    /**
     * Get a dataset/dataStructure for a specific product
     *
     * @param name {String} Dataset name
     * @param options {GetItemGroupOptions}
     * @param productAlias {String} Product name alias. Examples: sdtmig3-3, sdtm1.7, adamig11.
     * @returns {Object} Dataset
     */
    async getItemGroup (name, productAlias, options) {
        let defaultedOptions = { ...defaultGetItemGroupOptions, ...options };
        let id = this.getProductNameByAlias(productAlias, defaultedOptions);
        if (id) {
            return this.products[id].getItemGroup(name, options);
        }
    }

    /**
     * Get an object with all datasets/domains/dataStructure
     * <br> This method does not update the main object
     *
     * @param options {GetItemGroupsOptions}
     * @returns {Object} An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the dataset information from the CDISC Library.
     */
    async getItemGroups (productAlias, options) {
        let defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        let id = this.getProductNameByAlias(productAlias);
        if (id) {
            if (this.products[id].fullyLoaded !== true && defaultedOptions.short !== true) {
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
     */
    constructor ({
        id, name, title, label, type, description, source, effectiveDate,
        registrationStatus, version, dataClasses, dataStructures, codelists, href,
        coreObject, model, datasetType, fullyLoaded = false,
    } = {}) {
        super();
        if (id) {
            this.id = id;
        } else if (href.startsWith('/mdr/ct/') || href.startsWith('/mdr/adam/')) {
            this.id = href.replace(/.*\/(.*)$/, '$1');
        } else {
            this.id = href.replace(/.*\/(.*)\/(.*)$/, '$1-$2');
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
            this.version = href.replace(/.*?(\d[\d-]*$)/, '$1').replace('-', '.');
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
            }
        }
        if (datasetType) {
            this.datasetType = datasetType;
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
     * @param pRaw {Object} Raw CDISC API response
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
                if (dataStructureRaw['_links'] && dataStructureRaw['_links'].self) {
                    href = dataStructureRaw['_links'].self.href;
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
                if (dataClassRaw['_links'] && dataClassRaw['_links'].self) {
                    href = dataClassRaw['_links'].self.href;
                }
                let dataClass = new DataClass({
                    name: dataClassRaw.name,
                    href,
                    coreObject: this.coreObject
                });
                dataClass.parseResponse(dataClassRaw);
                dataClasses[dataClass.id] = dataClass;
            });
            this.dataClasses = dataClasses;
        }
    }

    /**
     * Get an object with all variables/fields for that product
     *
     * @returns {Object} An object with variables
     */
    getItems () {
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
     * <br> This method does not update the main object in case options.short is enabled
     *
     * @param options {GetItemGroupsOptions}
     * @returns {Object} An object with datasets/domains/dataStructures
     * <br> In case options.short is set to true, only name and label for each itemGroup are returned.
     * This approach does not load the full product and loads only the dataset information from the CDISC Library.
     */
    async getItemGroups (options) {
        let defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        let result = {};
        if (defaultedOptions.short !== true) {
            if (this.fullyLoaded === true) {
                result = this.getLoadedItemGroups();
            } else {
                // Load the full product
                let productRaw = await this.coreObject.apiRequest(this.href);
                this.parseResponse(productRaw);
                this.fullyLoaded = true;
            }
        } else {
            if (this.fullyLoaded === true) {
                let itemGroups = this.getLoadedItemGroups();
                Object.values(itemGroups).forEach(itemGroup => {
                    result[itemGroup.name] = { name: itemGroup.name, label: itemGroup.label };
                });
            } else {
                let datasetsHref = `${this.href}/${this.datasetType.toLowerCase()}`;
                let itemGroupsRaw = await this.coreObject.apiRequest(datasetsHref);
                if (itemGroupsRaw && itemGroupsRaw['_links'] && itemGroupsRaw['_links'][this.datasetType]) {
                    itemGroupsRaw['_links'][this.datasetType].forEach(dsRaw => {
                        let name = dsRaw.href.replace(/.*\/(.*)$/, '$1');
                        result[name] = { name, label: dsRaw.title };
                    });
                }
            }
        }
        if (defaultedOptions.format === undefined) {
            return result;
        } else {
            if (defaultedOptions.short === true) {
                return convertToFormat(Object.values(result), defaultedOptions.format);
            } else {
                let formatted = [];
                Object.values(result).forEach(itemGroup => {
                    formatted = formatted.concat(itemGroup.getFormattedItems('object', true));
                });
                return convertToFormat(formatted, defaultedOptions.format);
            }
        }
    }

    /**
     * Get an object with all datasets/dataStructures for that product
     *
     * @returns {Object} An object with datasets
     */
    getLoadedItemGroups () {
        let result = {};
        if (this.dataStructures) {
            return this.dataStructures;
        } else if (this.dataClasses) {
            Object.values(this.dataClasses).forEach(obj => {
                if (this.model === 'CDASH') {
                    result = { ...result, ...obj.domains };
                } else if (this.model === 'SDTM' || this.model === 'SEND') {
                    result = { ...result, ...obj.datasets };
                }
            });
        }
        return result;
    }

    /**
     * Get a dataset/dataStructure/domain
     * @param name {String} Dataset name
     * @param options {GetItemGroupOptions}
     *
     * @returns {Object} Dataset/DataStructure/Domain
     */
    async getItemGroup (name, options) {
        let result;
        let defaultedOptions = { ...defaultGetItemGroupsOptions, ...options };
        // Check if dataset is already present;
        let loadedDatasets = this.getLoadedItemGroups();
        let datasetId;
        Object.values(loadedDatasets).some(dataset => {
            if (dataset.name === name) {
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
                if (dsRaw['_links'] && dsRaw['_links'].parentClass) {
                    let dcRaw = dsRaw['_links'].parentClass;
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
     * @param name {String} Variable/Field name
     * @param options {Object} Matching options. By default the following options are used: { mode: 'full', firstOnly: false }.
     * <br> mode {String} - match only full names, partial - match partial names
     * <br> firstOnly {Boolean} true - returns only the first matching item, false - returns all matching items
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
}

class DataStructure extends BasicFunctions {
    /**
     * Data Structure class
     * @extends BasicFunctions
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
     * @param dsRaw Raw CDISC API response
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
                if (analysisVariableSetRaw['_links'] && analysisVariableSetRaw['_links'].self) {
                    href = analysisVariableSetRaw['_links'].self.href;
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
     * @returns {Object} An object with variables
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
     * @param name {String} Variable/Field name
     * @param options {Object} Matching options. By default the following options are used: { mode: 'full', firstOnly: false }.
     * <br> mode {String} - match only full names, partial - match partial names
     * <br> firstOnly {Boolean} true - returns only the first matching item, false - returns all matching items
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
     * Get items in a specific format
     *
     * @param format {String} Specifies the output format. Possible values: json, csv, object.
     * @param addItemGroupId=false {Boolean} If set to true, itemGroup name is added to each records.
     * @returns {String|Array} String with formatted items or an array with item details.
     */
    getFormattedItems (format, addItemGroupId = false) {
        let result = [];
        if (this.analysisVariableSets) {
            Object.values(this.analysisVariableSets).forEach(analysisVariableSet => {
                result = result.concat(analysisVariableSet.getFormattedItems('object', addItemGroupId, { dataStructure: this.id }));
            });
            if (format === 'object') {
                return result;
            } else {
                return convertToFormat(result, format);
            }
        }
    }
}

class DataClass extends BasicFunctions {
    /**
     * Dataset Class class
     * @extends BasicFunctions
     */
    constructor ({ name, label, description, datasets, domains, classVariables, cdashModelFields, href, coreObject } = {}) {
        super();
        this.id = href.replace(/.*\/(.*)$/, '$1');
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
     * @param dcRaw Raw CDISC API response
     */
    parseResponse (dcRaw) {
        this.name = dcRaw.name;
        this.label = dcRaw.label;
        this.description = dcRaw.description;
        if (dcRaw.hasOwnProperty('datasets')) {
            let datasets = {};
            dcRaw.datasets.forEach(datasetRaw => {
                let href;
                let id;
                if (datasetRaw['_links'] && datasetRaw['_links'].self) {
                    href = datasetRaw['_links'].self.href;
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
        if (dcRaw.hasOwnProperty('classVariables')) {
            let classVariables = {};
            if (dcRaw.hasOwnProperty('classVariables')) {
                dcRaw.classVariables.forEach(variableRaw => {
                    let href;
                    if (variableRaw['_links'] && variableRaw['_links'].self) {
                        href = variableRaw['_links'].self.href;
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
                    if (fieldRaw['_links'] && fieldRaw['_links'].self) {
                        href = fieldRaw['_links'].self.href;
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
     * @returns {Object} An object with variables
     */
    getItems () {
        let result = {};
        if (this.datasets) {
            Object.values(this.datasets).forEach(dataset => {
                result = { ...result, ...dataset.getItems() };
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
     * Find all matching variables/fields. For example TRxxPGy matches TR01PG12.
     *
     * @param name {String} Variable/Field name
     * @param options {Object} Matching options. By default the following options are used: { mode: 'full', firstOnly: false }.
     * <br> mode {String} - match only full names, partial - match partial names
     * <br> firstOnly {Boolean} true - returns only the first matching item, false - returns all matching items
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
     */
    constructor ({ id, name, label, itemType, href, coreObject } = {}) {
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
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to variable set
     *
     * @param vsRaw Raw CDISC API response
     */
    parseResponse (itemRaw) {
        this.name = itemRaw.name;
        this.label = itemRaw.label;
        let items = {};
        if (itemRaw.hasOwnProperty(this.itemType)) {
            itemRaw[this.itemType].forEach(itemRaw => {
                let href;
                if (itemRaw['_links'] && itemRaw['_links'].self) {
                    href = itemRaw['_links'].self.href;
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
        this[this.itemType] = items;
    }

    /**
     * Get an object with all variables/fields for that item set
     *
     * @returns {Object} An object with variables
     */
    getItems () {
        let result = {};
        if (this[this.itemType]) {
            Object.values(this[this.itemType]).forEach(variable => {
                result[variable.id] = variable;
            });
        }
        return result;
    }

    /**
     * Find all matching variables/fields. For example TRxxPGy matches TR01PG12.
     *
     * @param name {String} Variable/field name
     * @param options {Object} Matching options. By default the following options are used: { mode: 'full', firstOnly: false }.
     * <br> mode {String} - match only full names, partial - match partial names
     * <br> firstOnly {Boolean} true - returns only the first matching item, false - returns all matching items
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
        return result;
    }

    /**
     * Get items in a specific format
     *
     * @param format {String} Specifies the output format. Possible values: json, csv, object.
     * @param addItemGroupId=false {Boolean} If set to true, itemGroup name is added to each records.
     * @param additionalProps {Object} If provided, these properties will be added.
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
        if (format === 'object') {
            return result;
        } else {
            return convertToFormat(result, format);
        }
    }
}

class Dataset extends ItemGroup {
    /**
     * Dataset class. Extends ItemGroup class. See {@link ItemGroup} for the list of available methods.
     * @extends ItemGroup
     */
    constructor ({ id, name, label, datasetVariables = {}, href, coreObject } = {}) {
        super({ id, name, label, itemType: 'datasetVariables', href, coreObject });
        this.datasetVariables = datasetVariables;
    }
}

class AnalysisVariableSet extends ItemGroup {
    /**
     * Analysis Variable Set class. Extends ItemGroup class. See {@link ItemGroup} for the list of available methods.
     * @extends ItemGroup
     */
    constructor ({ id, name, label, analysisVariables = {}, href, coreObject } = {}) {
        super({ id, name, label, itemType: 'analysisVariables', href, coreObject });
        this.analysisVariables = analysisVariables;
    }
}

class Domain extends ItemGroup {
    /**
     * Domain class. Extends ItemGroup class. See {@link ItemGroup} for the list of available methods.
     * @extends ItemGroup
     */
    constructor ({ id, name, label, fields = {}, href, coreObject } = {}) {
        super({ id, name, label, itemType: 'fields', href, coreObject });
        this.fields = fields;
    }
}

class Item extends BasicFunctions {
    /**
     * Item class
     * @extends BasicFunctions
     */
    constructor ({ id, ordinal, name, label, simpleDatatype, codelist, codelistHref, href, coreObject } = {}) {
        super();
        if (id) {
            this.id = id;
        } else {
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
        this.href = href;
        this.coreObject = coreObject;
    }

    /**
     * Parse API response to item
     *
     * @param itemRaw Raw CDISC API response
     */
    parseItemResponse (itemRaw) {
        this.ordinal = itemRaw.ordinal;
        this.name = itemRaw.name;
        this.label = itemRaw.label;
        this.simpleDatatype = itemRaw.simpleDatatype;
        if (itemRaw.hasOwnProperty('_links')) {
            if (itemRaw._links.codelist && itemRaw._links.codelist.href) {
                this.codelistHref = itemRaw._links.codelist.href;
                this.codelist = itemRaw._links.codelist.href.replace(/.*\/(\S+)/, '$1');
            }
        }
    }
}

class Variable extends Item {
    /**
     * Variable class
     * @extends Item
     */
    constructor ({ id, ordinal, name, label, description, core, simpleDatatype, valueList = [], codelist, codelistHref, describedValueDomain, href, coreObject } = {}) {
        super({ id, ordinal, name, label, simpleDatatype, codelist, codelistHref, href, coreObject });
        this.description = description;
        this.core = core;
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
        this.valueList = vRaw.valueList;
        this.describedValueDomain = vRaw.describedValueDomain;
    }
}

class Field extends Item {
    /**
     * CDASH Field class
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
     * Parse API response to variable
     *
     * @param fRaw Raw CDISC API response
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

class CodeList extends BasicFunctions {
    /**
     * CodeList class
     * @extends BasicFunctions
     */
    constructor ({ conceptId, extensible, name, submissionValue, definition, preferredTerm, synonyms, terms = [], href, coreObject } = {}) {
        super();
        this.conceptId = conceptId;
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
     * Parse API response to codelist
     *
     * @param clRaw Raw CDISC API response
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
     * Get codelist terms in a specific format
     *
     * @param format {String} Specifies the output format. Possible values: json, csv.
     * @returns {String} Formatted codeList terms.
     */
    getFormattedTerms (format = 'json') {
        if (['json', 'csv'].includes(format)) {
            convertToFormat(this.terms, format);
        } else {
            return this.terms;
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
