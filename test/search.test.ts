const { CdiscLibrary } = require('../dist/classes/claWrapper');

const cl = new CdiscLibrary({ baseUrl: cdiscLibraryUrl});
let product;

beforeAll(async () => {
});

describe('Search', () => {
    it('Simple search', async () => {
        let result = await cl.search({ query: 'PARAMTYP', scopes: { product: 'ADaMIG v1.1' } });
        if (result?.hits[0]?.rawHit) {
            // Score can change over time
            result.hits[0].rawHit['@score.score'] = undefined;
        }
        expect(result).toMatchSnapshot();
    });
    it('Search with multiple scopes', async () => {
        let result = await cl.search({ query: 'PARAM', scopes: { product: 'ADaMIG v1.1', core: 'Required' } });
        expect(result.totalHits).toBe(2);
    });
    it('Do not load all ', async () => {
        let result = await cl.search({ query: 'PARAM', scopes: { product: 'ADaMIG v1.1' }, pageSize: 5, loadAll: false });
        expect(result.hits.length).toBe(5);
        expect(result.hasMore).toBe(true);
    });
    it('Load all ', async () => {
        let result = await cl.search({ query: 'PARAM', scopes: { product: 'ADaMIG v1.1' }, pageSize: 1, loadAll: true });
        expect(result.hits.length).toBe(22);
    });
    it('Get scopes', async () => {
        let result = await cl.getScopeList();
        expect(result.includes('type')).toBe(true);
    });
    it('Get scope values', async () => {
        let result = await cl.getScope('core');
        expect(result.includes('Permissible')).toBe(true);
    });
    it('Resolve a hit in ADaM', async () => {
        let result = await cl.search({ query: 'PARAM', scopes: { product: 'ADaMIG v1.1', type: 'Analysis Variable' } });
        let variable = await result.hits[0].resolve(cl);
        expect(variable.label).toBe('Parameter');
    });
    it('Resolve a hit in SDTM', async () => {
        let result = await cl.search({ query: 'LBTESTCD', scopes: { product: 'SDTMIG v3.2', type: 'SDTM Dataset Variable' } });
        let variable = await result.hits[0].resolve(cl);
        expect(variable.label).toBe('Lab Test or Examination Short Name');
    });
    it('Resolve a hit in CDASH', async () => {
        let result = await cl.search({ query: 'RACE', scopes: { product: 'CDASHIG v1.1', type: 'Data Collection Field' } });
        let field = await result.hits[0].resolve(cl);
        expect(field.prompt).toBe('Race');
    });
});