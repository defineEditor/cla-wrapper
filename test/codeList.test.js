const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: 'http://localhost:4600/api' });
let product;
let codeList;

beforeAll(async () => {
    product = await cl.getFullProduct('adamct20190329');
    codeList = await product.getCodeList('C81224');
});

describe('Dataset', () => {
    it('Get versions', async () => {
        // const result = await codeList.getVersions();
        const result = {};
        expect(Object.keys(result).length).toBe(30);
    });
    it('Get formatted terms', async () => {
        const result = codeList.getFormattedTerms('csv', true);
        expect(result).toMatchSnapshot();
    });
});
