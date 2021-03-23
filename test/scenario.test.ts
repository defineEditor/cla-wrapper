const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: cdiscLibraryUrl});
let product;
let scenario;

beforeAll(async () => {
    product = await cl.getFullProduct('cdashig111');
    const domain = await product.getItemGroup('DA');
    scenario = Object.values(domain.scenarios)[0];
});

describe('Scenario', () => {
    it('Find matching items', async () => {
        const items1 = scenario.findMatchingItems('DISPAMT.DACAT');
        expect(items1[0].name).toBe('DISPAMT.DACAT');
        const items2 = scenario.findMatchingItems('DA', { mode: 'partial' });
        expect(items2[0].name).toMatchSnapshot();
        const items3 = scenario.findMatchingItems('DA', { mode: 'partial', firstOnly: true });
        expect(items3.length).toBe(1);
    });
    it('Get items', async () => {
        const items = await scenario.getItems();
        expect(Object.keys(items).length).toBe(14);
    });
    it('Get name list sets', async () => {
        const result = scenario.getNameList();
        expect(result).toMatchSnapshot();
    });
});