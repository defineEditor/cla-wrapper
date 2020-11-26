const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });
let product;
let analysisVariableSet;

beforeAll(async () => {
    product = await cl.getFullProduct('adamig11');
    const dataStructure = await product.getItemGroup('BDS');
    analysisVariableSet = dataStructure.analysisVariableSets.AnalysisParameter;
});

describe('Analysis Variable Set', () => {
    it('Find matching items', async () => {
        const items1 = analysisVariableSet.findMatchingItems('PARAMCD');
        expect(items1[0].name).toBe('PARAMCD');
        const items2 = analysisVariableSet.findMatchingItems('AVAL', { mode: 'partial' });
        expect(items2[0].name).toMatchSnapshot();
        const items3 = analysisVariableSet.findMatchingItems('AVAL', { mode: 'partial', firstOnly: true });
        expect(items3.length).toBe(1);
    });
    it('Get items', async () => {
        const items = await analysisVariableSet.getItems();
        expect(Object.keys(items).length).toBe(26);
    });
    it('Get item', async () => {
        const item = await analysisVariableSet.getItem('PARAMCD');
        expect(item.name).toBe('PARAMCD');
    });
    it('Get formatted items', async () => {
        const items = analysisVariableSet.getFormattedItems('csv', true);
        expect(items).toMatchSnapshot();
    });
    it('Get name list sets', async () => {
        const result = analysisVariableSet.getNameList();
        expect(result).toMatchSnapshot();
    });
});
