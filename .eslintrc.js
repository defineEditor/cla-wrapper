module.exports = {
    "env": {
        "browser": true,
        "es6": true,
        "node": true,
        "jest/globals": true
    },
    "extends": ["eslint:recommended", "standard"],
    "globals": {
        "Atomics": "readonly",
        "SharedArrayBuffer": "readonly"
    },
    "parserOptions": {
        "ecmaVersion": 11,
        "sourceType": "module"
    },
    plugins: ["jest", "standard"],
    "rules": {
        indent: ['error', 4, { SwitchCase: 1 }],
        'linebreak-style': ['error', 'unix'],
        semi: ['error', 'always'],
        'no-prototype-builtins': 0,
        'comma-dangle': 0,
    }
};
