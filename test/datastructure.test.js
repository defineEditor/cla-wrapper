const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });
let product;
let dataStructure;

beforeAll(async () => {
    product = await cl.getFullProduct('adamig11');
    dataStructure = product.dataStructures.ADSL;
});

describe('Data structure', () => {
    it('Find matching items', async () => {
        const items1 = dataStructure.findMatchingItems('TR12PG1');
        expect(items1[0].name).toBe('TRxxPGy');
        const items2 = dataStructure.findMatchingItems('TRT', { mode: 'partial' });
        expect(items2[0].name).toMatchSnapshot();
        const items3 = dataStructure.findMatchingItems('TRT', { mode: 'partial', firstOnly: true });
        expect(items3.length).toBe(1);
    });
    it('Get items', async () => {
        const items = await dataStructure.getItems();
        expect(Object.keys(items).length).toBe(132);
    });
    it('Get item', async () => {
        const item = await dataStructure.getItem('USUBJID');
        expect(item.name).toBe('USUBJID');
    });
    it('Get formatted items', async () => {
        const items = dataStructure.getFormattedItems('csv', true);
        expect(items).toMatchSnapshot();
    });
    it('Get variable sets', async () => {
        const result = await dataStructure.getVariableSetList({ descriptions: true });
        const resultList = await dataStructure.getVariableSetList();
        expect(result).toMatchSnapshot();
        expect(resultList).toMatchSnapshot();
    });
});
