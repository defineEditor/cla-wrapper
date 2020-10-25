const { CdiscLibrary } = require('../src/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });

describe('Data Class', () => {
    it('Get itemGroups', async () => {
        const pc = (await cl.getProductClasses())['data-analysis'];
        const adamDs = await pc.getItemGroups('adamig11');
        expect(Object.keys(adamDs)).toMatchSnapshot();
    });
    it('Get an itemGroup', async () => {
        const pc = (await cl.getProductClasses())['data-analysis'];
        const adamDs = await pc.getItemGroup('adsl', 'adamig1.1');
        expect(adamDs.name).toBe('ADSL');
    });
    it('Product Group List', async () => {
        const pc = (await cl.getProductClasses())['data-analysis'];
        const pgList = await pc.getProductGroupList();
        expect(pgList[0]).toBe('adam');
    });
    it('Product Groups', async () => {
        const pc = (await cl.getProductClasses())['data-analysis'];
        const pg= await pc.getProductGroups();
        expect(Object.keys(pg)[0]).toBe('adam');
    });
    it('Product ID by Alias', async () => {
        const pc = (await cl.getProductClasses())['data-analysis'];
        const id = await pc.getProductIdByAlias('adamig1.0');
        expect(id.productId).toBe('adamig-1-0');
    });
    it('Product List', async () => {
        const pc = (await cl.getProductClasses())['data-analysis'];
        const pl = await pc.getProductList();
        expect(pl.filter(productId => productId === 'adamig-1-0').length > 0).toBe(true);
    });
});
