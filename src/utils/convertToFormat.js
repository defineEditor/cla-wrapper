const json2csv = require('json2csv');

function convertToFormat (object, format) {
    if (format === 'csv') {
        return json2csv.parse(object);
    } else if (format === 'json' || format === undefined) {
        return object;
    }
}

module.exports = convertToFormat;
