/**
 * Match item (variable/field) against a standard item (variable/field)
 *
 * @param name {String} - name to match
 * @param item {Object} - instance of the Item class (or Variable/Field class which extend Item class)
 * @param mode {String} Matching mode: full - match only full names, partial - match partial names. Partial does not apply items using  '-' or '*' and falls back to full mode for these items.
 * @returns {Bool} True if matched, false otherwise
 */
const matchItem = (name, item, mode) => {
    let result = false;
    if (mode === 'full' || (mode === 'partial' && (item.name.includes('*') || item.name.includes('-')))) {
        // For *DT even in partial mode a full comparison is used, otherwise it makes no sense as everything will match *
        let pattern;
        if (/[-*wxyz]/.test(item.name)) {
            pattern = item.name;
            pattern = pattern.replace(/[xzw]/g, '\\d');
            pattern = pattern.replace(/y/g, '[1-9]?\\d');
            pattern = pattern.replace(/\*/g, '\\w+');
            pattern = pattern.replace(/-/g, '\\w');
        } else {
            pattern = item.name;
        }
        const regex = new RegExp('^' + pattern + '$', 'i');
        if (regex.test(name)) {
            result = true;
        }
    } else if (mode === 'partial') {
        if (item.name.includes(name)) {
            result = true;
        } else if (/[wxyz]/.test(item.name)) {
            if (/\d/.test(name) && /[wxz]/.test(item.name)) {
                const updatedName = name.replace(/\d/g, '1');
                const updatedAVName = item.name.replace(/[wxzy]/g, '1');
                if (updatedAVName.includes(updatedName)) {
                    result = true;
                }
            } else if (/\d/.test(name) && item.name.includes('y') && !/0\d/.test(name)) {
                const updatedName = name.replace(/\d{1,2}/g, '1');
                const updatedAVName = item.name.replace(/y/g, '1');
                if (updatedAVName.includes(updatedName)) {
                    result = true;
                }
            }
        }
    } else {
        throw new Error(`Unknown MODE parameter value (${mode}) for the findAllMatchingItems method`);
    }
    return result;
};

module.exports = matchItem;
