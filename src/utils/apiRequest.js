const { promisify } = require('util');
const request = promisify(require('request'));

const apiRequest = ({ username, password, url }) => {
    let options = {
        url,
        headers: {
            'Accept': 'application/json',
        },
        auth: {
            'user': username,
            'pass': password,
            'sendImmediately': false
        }
    };
    return request(options);
};

module.exports = apiRequest;
