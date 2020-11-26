/**
 * Convert an object to a simple object, removes methods and technical elements (e.g., coreObject).
 * @param object {String} - name to match
 *
 * @returns {Object} A new object
 */
const toSimpleObject = (obj) => {
    const result = {};
    for (const prop in obj) {
        // Remove all techical or inherited properties
        if (prop !== 'coreObject' && Object.prototype.hasOwnProperty.call(obj, prop)) {
            if (typeof obj[prop] === 'object') {
                if (typeof obj[prop].toSimpleObject === 'function') {
                    result[prop] = obj[prop].toSimpleObject();
                } else {
                    result[prop] = toSimpleObject(obj[prop]);
                }
            } else {
                result[prop] = obj[prop];
            }
        }
    }
    return result;
};

module.exports = toSimpleObject;
