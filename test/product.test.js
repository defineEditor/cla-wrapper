const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });
let product;

beforeAll(async () => {
    product = await cl.getFullProduct('adamig11');
});

describe('Product', () => {
    it('Find matching items', async () => {
        const items1 = product.findMatchingItems('TR12PG1');
        expect(items1[0].name).toBe('TRxxPGy');
        const items2 = product.findMatchingItems('TRTA', { mode: 'partial'});
        expect(items2[0].name).toMatchSnapshot();
        const items3 = product.findMatchingItems('TRTA', { mode: 'partial', firstOnly: true });
        expect(items3.length).toBe(1);
    });
    it('Get an itemGroup', async () => {
        const bds = await product.getItemGroup('bds');
        expect(bds.name).toBe('BDS');
    });
    it('Get itemGroups', async () => {
        const itemGroups = await product.getItemGroups();
        expect(Object.keys(itemGroups).length).toBe(2);
    });
    it('Get items', async () => {
        const items = await product.getItems();
        expect(Object.keys(items).length).toBe(310);
    });
    it('Get current itemGroups', async () => {
        const itemGroups = await product.getCurrentItemGroups();
        expect(Object.keys(itemGroups).length).toBe(2);
    });
    it('Get current items', async () => {
        const items = await product.getCurrentItems();
        expect(Object.keys(items).length).toBe(310);
    });
    it('Get a codelist', async () => {
        product = await cl.getFullProduct('adamct-2019-03-29');
        const codeList = await product.getCodeList('C117745');
        expect(codeList.terms.length).toBe(3);
    });
    it('Get a list of codelists', async () => {
        product = await cl.getFullProduct('adamct-2019-03-29');
        const items = await product.getCodeListList();
        expect(items.length).toBe(9);
    });
});
