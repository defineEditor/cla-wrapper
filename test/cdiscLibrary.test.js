const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });

describe('CDISC Library', () => {
    it('Can connect to the CDISC Library', async () => {
        cl.reset();
        const connected = await cl.checkConnection();
        expect(connected.statusCode).toBe(200);
    });
    it('Get a basic product', async () => {
        cl.reset();
        const product = await cl.getFullProduct('adamig1.0', true);
        expect(product.toSimpleObject()).toMatchSnapshot();
    });
    it('Get a full product', async () => {
        cl.reset();
        const product = await cl.getFullProduct('adamct-2014-09-26');
        expect(product.toSimpleObject()).toMatchSnapshot();
    });
    it('Get an itemGroup', async () => {
        cl.reset();
        const adamDs = await cl.getItemGroup('adsl', 'adamig1.1');
        expect(adamDs.toSimpleObject()).toMatchSnapshot();
        const sdtmDomain = await cl.getItemGroup('dm', 'sdtmig33');
        expect(sdtmDomain.toSimpleObject()).toMatchSnapshot();
        const sdtmDomainCsv = await cl.getItemGroup('ae', 'sdtmig33', { format: 'csv' });
        expect(sdtmDomainCsv).toMatchSnapshot();
        const cdashDomain = await cl.getItemGroup('ae', 'cdashig11');
        expect(cdashDomain.toSimpleObject()).toMatchSnapshot();
    });
    it('Get itemGroups', async () => {
        cl.reset();
        const adamDss = await cl.getItemGroups('adamig1.1');
        expect(Object.values(adamDss).map(ds => ds.toSimpleObject())).toMatchSnapshot();
    });
    it('Get last updated info', async () => {
        cl.reset();
        const lastUpdated = await cl.getLastUpdated();
        expect(Object.keys(lastUpdated)).toMatchSnapshot();
    });
    it('Product classes', async () => {
        cl.reset();
        const pc = await cl.getProductClasses();
        const pcList = await cl.getProductClassList();
        expect(Object.keys(pc)).toMatchSnapshot();
        expect(Object.keys(pcList)).toMatchSnapshot();
    });
    it('Product details', async () => {
        cl.reset();
        const pdShort = await cl.getProductDetails({ type: 'short', format: 'csv' });
        const pdLong = await cl.getProductDetails({ type: 'long', format: 'json' });
        expect(typeof pdShort === 'string').toBe(true);
        expect(pdShort.substring(0,95)).toMatchSnapshot();
        expect(pdLong[0]).toMatchSnapshot();
    });
    it('Product Group List', async () => {
        const pgList = await cl.getProductGroupList();
        expect(pgList[0]).toMatchSnapshot();
    });
    it('Product ID by Alias', async () => {
        cl.reset();
        let id = await cl.getProductIdByAlias('cdashig11');
        expect(id).toMatchSnapshot();
        id = await cl.getProductIdByAlias('adamig1.0');
        expect(id.productId).toBe('adamig-1-0');
        id = await cl.getProductIdByAlias('ADaM CT 2014-09-26');
        expect(id.productId).toBe('adamct-2014-09-26');
        id = await cl.getProductIdByAlias('sdtmig-3-3');
        expect(id.productId).toBe('sdtmig-3-3');
        id = await cl.getProductIdByAlias('SDTM-IG 3.2');
        expect(id.productId).toBe('sdtmig-3-2');
    });
    it('Traffic Stats', async () => {
        cl.reset();
        const stats = await cl.getTrafficStats();
        expect(/^\d.*/.test(stats)).toBe(true);
    });
});
