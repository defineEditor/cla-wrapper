const { CdiscLibrary } = require('../src/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });
let product;
let field;

beforeAll(async () => {
    product = await cl.getFullProduct('sdtmig33');
    const domain = await product.getItemGroup('DM');
    field = domain.getItem('DTHFL');
});

describe('Analysis Variable Set', () => {
    it('Get codeList', async () => {
        const result = await field.getCodeList();
        expect(result.name).toBe('No Yes Response');
    });
});
