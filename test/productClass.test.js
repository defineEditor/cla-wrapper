const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });
let pc;

beforeAll(async () => {
    pc = (await cl.getProductClasses())['data-analysis'];
});


describe('Data Class', () => {
    it('Get itemGroups', async () => {
        const adamDs = await pc.getItemGroups('adamig11');
        expect(Object.keys(adamDs)).toMatchSnapshot();
    });
    it('Get an itemGroup', async () => {
        const adamDs = await pc.getItemGroup('adsl', 'adamig1.1');
        expect(adamDs.name).toBe('ADSL');
    });
    it('Product Group List', async () => {
        const pgList = pc.getProductGroupList();
        expect(pgList[0]).toBe('adam');
    });
    it('Product Groups', async () => {
        const pg= pc.getProductGroups();
        expect(Object.keys(pg)[0]).toBe('adam');
    });
    it('Product Group', async () => {
        let newPc = (await cl.getProductClasses())['data-tabulation'];
        const pg = newPc.getProductGroup('sendig');
        expect(pg.name).toBe('sendig');
    });
    it('Product ID by Alias', async () => {
        const id = await pc.getProductIdByAlias('adamig1.0');
        expect(id.productId).toBe('adamig-1-0');
    });
    it('Product List', async () => {
        const pl = pc.getProductList();
        expect(pl.filter(productId => productId === 'adamig-1-0').length > 0).toBe(true);
    });
});
