import { parse } from 'json2csv';

const convertToFormat = (object: object, format: 'json' | 'csv'): any => {
    if (format === 'csv') {
        return parse(object);
    } else if (format === 'json' || format === undefined) {
        return object;
    }
};

export default convertToFormat;
