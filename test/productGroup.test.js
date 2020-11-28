const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });
let pg;

beforeAll(async () => {
    const pc = (await cl.getProductClasses())['data-tabulation'];
    pg = pc.getProductGroups()['sdtmig'];
});


describe('Product Group', () => {
    it('Get itemGroups', async () => {
        const domains = await pg.getItemGroups('sdtmig32');
        expect(Object.keys(domains)).toMatchSnapshot();
    });
    it('Get an itemGroup', async () => {
        const ae = await pg.getItemGroup('ae', 'sdtmig32');
        expect(ae.name).toBe('AE');
    });
    it('Product Group List', async () => {
        const pList = await pg.getProductList();
        expect(pList[0].startsWith('sdtmig')).toBe(true);
    });
    it('Product ID by Alias', async () => {
        let id = await pg.getProductIdByAlias('sdtmig33');
        expect(id.productId).toBe('sdtmig-3-3');
        id = await pg.getProductIdByAlias('sdtm-ig 3.2');
        expect(id.productId).toBe('sdtmig-3-2');
    });
    it('Product List', async () => {
        const pl = await pg.getProductList();
        expect(pl.indexOf('sdtmig-3-2') > 0).toBe(true);
    });
    it('Products', async () => {
        const ps = await pg.getProducts();
        expect(Object.keys(ps).indexOf('sdtmig-3-2') > 0).toBe(true);
    });
    it('Product', async () => {
        const product = await pg.getFullProduct('sdtmig-3-2');
        expect(product.name).toBe('SDTMIG v3.2');
    });
});
