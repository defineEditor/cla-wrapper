import requestLib from 'request';
import { promisify } from 'util';
import { ClCache } from '../interfaces/interfaces';

const request = promisify(requestLib);

interface ApiRequestParameters {
    username?: string;
    password?: string;
    apiKey?: string;
    url?: string;
    headers?: any;
    cache?: ClCache;
}

const apiRequest = async ({ username, password, apiKey, url, headers = {}, cache }: ApiRequestParameters): Promise<requestLib.Response> => {
    const req: any = {
        url,
        headers: {
            Accept: 'application/json',
            ...headers,
        },
    };
    if (apiKey !== undefined && apiKey !== '') {
        // OAuth2 authentication
        req.headers['api-key'] = apiKey;
    } else {
        // Basic authentication
        req.auth = {
            user: username,
            pass: password,
            sendImmediately: false
        };
    }
    if (headers.Accept && headers.Accept === 'application/vnd.ms-excel') {
        // Set encoding to null, as response is binary
        req.encoding = null;
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
