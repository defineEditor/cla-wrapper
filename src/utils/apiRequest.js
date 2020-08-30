const { promisify } = require('util');
const request = promisify(require('request'));

const apiRequest = async ({ username, password, apiKey, url, headers = {}, cache }) => {
    const req = {
        url,
        headers: {
            Accept: 'application/json',
            ...headers,
        },
    };
    if (apiKey !== undefined) {
        // OAuth2 authentication
        req.headers['Ocp-Apim-Subscription-Key'] = apiKey;
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
    let response = {};
    if (cache !== undefined && typeof cache.match === 'function') {
        // If cache function is available, check cache first
        response = await cache.match(req);
        if (response === undefined) {
            response = await request(req);
            // Add the reponse to cache
            if (response.statusCode === 200) {
                cache.put(req, response);
            }
        }
    } else {
        response = await request(req);
    }
    return response;
};

module.exports = apiRequest;
