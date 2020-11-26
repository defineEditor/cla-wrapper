const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });
let product;
let dataClass;

beforeAll(async () => {
    product = await cl.getFullProduct('cdashig111');
    dataClass = product.dataClasses.Events;
});

describe('Dataclass', () => {
    it('Find matching items', async () => {
        const items1 = dataClass.findMatchingItems('AEACN');
        expect(items1[0].name).toBe('AEACN');
        const items2 = dataClass.findMatchingItems('AE', { mode: 'partial' });
        expect(items2[0].name).toMatchSnapshot();
        const items3 = dataClass.findMatchingItems('AE', { mode: 'partial', firstOnly: true });
        expect(items3.length).toBe(1);
    });
    it('Get items', async () => {
        const items = await dataClass.getItems();
        expect(Object.keys(items).length).toBe(86);
    });
    it('Get item', async () => {
        const item = await dataClass.getItem('AEACN');
        expect(item.name).toBe('AEACN');
    });
    it('Get itemGroups', async () => {
        const itemGroups = await dataClass.getItemGroups();
        expect(Object.keys(itemGroups).length).toBe(4);
    });
});
