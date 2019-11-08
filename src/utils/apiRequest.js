const { promisify } = require('util');
const request = promisify(require('request'));

const apiRequest = async ({ username, password, url, headers = {}, cache }) => {
    let req = {
        url,
        headers: {
            ...headers,
            'Accept': 'application/json',
        },
        auth: {
            'user': username,
            'pass': password,
            'sendImmediately': false
        }
    };
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
