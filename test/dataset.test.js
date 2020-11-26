const { CdiscLibrary } = require('../src/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });
let product;
let dataset;

beforeAll(async () => {
    product = await cl.getFullProduct('sendig31');
    dataset = await product.getItemGroup('EX');
});

describe('Dataset', () => {
    it('Find matching items', async () => {
        const items1 = dataset.findMatchingItems('USUBJID');
        const items2 = dataset.findMatchingItems('EX', { mode: 'partial' });
        expect(items2[0].name).toMatchSnapshot();
        expect(items1[0].name).toBe('USUBJID');
        const items3 = dataset.findMatchingItems('EX', { mode: 'partial', firstOnly: true });
        expect(items3.length).toBe(1);
    });
    it('Get items', async () => {
        const items = await dataset.getItems();
        expect(Object.keys(items).length).toBe(30);
    });
    it('Get item', async () => {
        const item = await dataset.getItem('USUBJID');
        expect(item.name).toBe('USUBJID');
    });
    it('Get formatted items', async () => {
        const items = dataset.getFormattedItems('csv', true);
        expect(items).toMatchSnapshot();
    });
    it('Get name list sets', async () => {
        const result = dataset.getNameList();
        expect(result).toMatchSnapshot();
    });
});
