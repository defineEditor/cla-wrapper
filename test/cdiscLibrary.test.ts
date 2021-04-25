const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: cdiscLibraryUrl});

beforeAll(async () => {
    cl.reset();
});

describe('CDISC Library', () => {
    it('Can connect to the CDISC Library', async () => {
        const connected = await cl.checkConnection();
        expect(connected.statusCode).toBe(200);
    });
    it('Get a basic product', async () => {
        const product = await cl.getFullProduct('adamig1.0', true);
        expect(product.toSimpleObject()).toMatchSnapshot();
    });
    it('Get a full product', async () => {
        const product = await cl.getFullProduct('adamct-2014-09-26');
        expect(product.toSimpleObject()).toMatchSnapshot();
    });
    it('Get an itemGroup', async () => {
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
        const adamDss = await cl.getItemGroups('adamig1.1');
        expect(Object.values(adamDss).map(ds => ds.toSimpleObject())).toMatchSnapshot();
    });
    it('Get last updated info', async () => {
        const lastUpdated = await cl.getLastUpdated();
        expect(Object.keys(lastUpdated)).toMatchSnapshot();
    });
    it('Product classes', async () => {
        const pc = await cl.getProductClasses();
        const pcList = await cl.getProductClassList();
        expect(Object.keys(pc)).toMatchSnapshot();
        expect(Object.keys(pcList)).toMatchSnapshot();
    });
    it('Product details', async () => {
        const pdShort = await cl.getProductDetails({ type: 'short', format: 'csv' });
        let pdLong = await cl.getProductDetails({ type: 'long', format: 'json' });
        pdLong = pdLong.filter(pd => ['adam-2-1', 'adamig-1-1', 'sdtmig-3-3', 'sdtm-1-7', 'cdashig-2-0'].includes(pd.id))
        expect(typeof pdShort === 'string').toBe(true);
        expect(pdShort.substring(0,11)).toMatchSnapshot();
        expect(pdLong).toMatchSnapshot();
    });
    it('Product Group List', async () => {
        const pgList = await cl.getProductGroupList();
        expect(pgList[0]).toMatchSnapshot();
    });
    it('Product Group', async () => {
        const pg = await cl.getProductGroup('sdtm');
        expect(pg.name).toBe('sdtm');
    });
    it('Product ID by Alias', async () => {
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
        const stats = await cl.getTrafficStats();
        expect(/^\d.*/.test(stats)).toBe(true);
    });
});
