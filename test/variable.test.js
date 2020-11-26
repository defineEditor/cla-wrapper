const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });
let product;
let variable;

beforeAll(async () => {
    product = await cl.getFullProduct('adamig11');
    const dataStructure = await product.getItemGroup('BDS');
    const analysisVariableSet = dataStructure.analysisVariableSets.AnalysisParameter;
    variable = analysisVariableSet.getItem('PARAMTYP');
});

describe('Analysis Variable Set', () => {
    it('Get codeList', async () => {
        const result = await variable.getCodeList();
        expect(result.name).toBe('Parameter Type');
    });
});
