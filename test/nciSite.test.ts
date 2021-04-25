const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: cdiscLibraryUrl, useNciSiteForCt: true});
let product;
let codeList;

beforeAll(async () => {
    product = await cl.getFullProduct('adamct20190329');
    codeList = await product.getCodeList('C81223');
});

describe('Loading CT from NCI', () => {
    it('Get formatted terms', async () => {
        const result = codeList.getFormattedTerms('csv', true);
        expect(result).toMatchSnapshot();
    });
});
describe('Get CT from NCI site', () => {
    it('Get ADaM ct', async () => {
        cl.reset();
        const result = await cl.getCTFromNCISite(['/ADaM/Archive/']);
        expect(result['adamct-2019-12-20']).toMatchSnapshot();
    });
});