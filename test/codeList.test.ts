const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: cdiscLibraryUrl});
let product;
let codeList;

beforeAll(async () => {
    product = await cl.getFullProduct('adamct20190329');
    codeList = await product.getCodeList('C81224');
});

describe('Dataset', () => {
    it('Get versions', async () => {
        const result = await codeList.getVersions();
        expect(Object.keys(result).length).toBeGreaterThan(5);
    });
    it('Get formatted terms', async () => {
        const result = codeList.getFormattedTerms('csv', true);
        expect(result).toMatchSnapshot();
    });
});
