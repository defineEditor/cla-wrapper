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
});