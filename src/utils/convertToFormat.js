const json2csv = require('json2csv');

function convertToFormat (object, format) {
    if (format === 'csv') {
        return json2csv.parse(object);
    } else if (format === 'json') {
        return JSON.stringify(object, null, 2);
    }
}

module.exports = convertToFormat;
