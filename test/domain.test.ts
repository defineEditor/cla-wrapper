const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: cdiscLibraryUrl});
let product;
let domain;

beforeAll(async () => {
    product = await cl.getFullProduct('sdtmig33');
    domain = await product.getItemGroup('DM');
});

describe('Domain', () => {
    it('Find matching items', async () => {
        const items1 = domain.findMatchingItems('SUBJID');
        expect(items1[0].name).toBe('SUBJID');
        const items2 = domain.findMatchingItems('DM', { mode: 'partial' });
        expect(items2[0].name).toMatchSnapshot();
        const items3 = domain.findMatchingItems('DM', { mode: 'partial', firstOnly: true });
        expect(items3.length).toBe(1);
    });
    it('Get items', async () => {
        const items = await domain.getItems();
        expect(Object.keys(items).length).toBe(30);
    });
    it('Get item', async () => {
        const item = await domain.getItem('SUBJID');
        expect(item.name).toBe('SUBJID');
    });
    it('Get formatted items', async () => {
        const items = domain.getFormattedItems('csv', true);
        expect(items).toMatchSnapshot();
    });
    it('Get name list sets', async () => {
        const result = domain.getNameList();
        expect(result).toMatchSnapshot();
    });
});
