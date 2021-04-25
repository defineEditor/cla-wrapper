import requestLib from 'request';
import { promisify } from 'util';
import { ClCache } from '../interfaces/interfaces';

const request = promisify(requestLib);

interface ApiRequestParameters {
    apiKey?: string;
    baseUrl?: string;
    endpoint?: string;
    headers?: any;
    cache?: ClCache;
    useNciSiteForCt: boolean;
    nciSiteUrl: string;
    contentEncoding: string;
}

const nciSiteFolder = {
    adam: '/ADaM/Archive/',
    protocol: '/Protocol/Archive/',
    glossary: '/Glossary/Archive/',
    send: '/SEND/Archive/',
    sdtm: '/SDTM/Archive/',
    qs: '/SDTM/Archive/',
    'qs-ft': '/SDTM/Archive/',
    qrs: '/SDTM/Archive/',
    coa: '/SDTM/Archive/',
    cdash: '/SDTM/Archive/',
    'define-xml': '/Define-XML/Archive/',
};

const nciSitePrefix = {
    adam: 'ADaM Terminology',
    protocol: 'Protocol Terminology',
    glossary: 'CDISC Glossary Terminology',
    send: 'SEND Terminology',
    sdtm: 'SDTM Terminology',
    qs: 'QS Terminology',
    'qs-ft': 'QS-FT Terminology',
    qrs: 'QRS Terminology',
    coa: 'COA Terminology',
    cdash: 'CDASH Terminology',
    'define-xml': 'Define-XML Terminology',
};

type CodeListTypes = 'adam'|'cdash'|'define-xml'|'glossary'|'coa'|'protocol'|'qrs'|'qs'|'qs-ft'|'sdtm'|'send';

const apiRequest = async ({ apiKey, baseUrl, endpoint, headers = {}, cache, useNciSiteForCt, nciSiteUrl, contentEncoding }: ApiRequestParameters): Promise<requestLib.Response> => {
    let req: any;
    if (useNciSiteForCt &&
        /\/mdr\/ct\/packages\/(adam|cdash|define-xml|glossary|coa|protocol|qrs|qs|qs-ft|sdtm|send)ct-\d{4}-\d{2}-\d{2}$/.test(endpoint)
    ) {
        const type = endpoint.replace(/\/mdr\/ct\/packages\/(.*?)ct-\d{4}-\d{2}-\d{2}$/, '$1');
        const date = endpoint.replace(/\/mdr\/ct\/packages\/.*?ct-(\d{4}-\d{2}-\d{2})$/, '$1');
        const url = nciSiteUrl + nciSiteFolder[type as CodeListTypes] + nciSitePrefix[type as CodeListTypes] + ' ' + date + '.odm.xml';
        req = {
            url,
            headers: {
                Accept: 'text/xml',
                ...headers,
            },
        };
    } else if (useNciSiteForCt && endpoint.startsWith('\/nciSite\/')) {
        const page = endpoint.replace(/\/nciSite(\/.*?)$/, '$1');
        const url = nciSiteUrl + page;
        req = {
            url,
            headers: {
                Accept: 'text/html',
                ...headers,
            },
        };
    } else {
        const url = baseUrl + endpoint;
        req = {
            url,
            headers: {
                Accept: 'application/json',
                ...headers,
            },
        };
        if (apiKey !== undefined && apiKey !== '') {
            // OAuth2 authentication
            req.headers['api-key'] = apiKey;
        }
        if (headers.Accept && headers.Accept === 'application/vnd.ms-excel') {
            // Set encoding to null, as response is binary
            req.encoding = null;
        }
    }
    if (contentEncoding !== undefined) {
        req.headers['Content-Encoding'] = contentEncoding;
    }
    let response: any = {};
    if (cache !== undefined && typeof cache.match === 'function') {
        // If cache function is available, check cache first
        response = await cache.match(req);
        if (response === undefined) {
            response = await request(req);
            // Add the reponse to cache
            if (response.statusCode === 200) {
                await cache.put(req, response);
            }
        }
    } else {
        response = await request(req);
    }
    return response;
};

export default apiRequest;
