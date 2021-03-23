cla-wrapper
===========
Javascript wrapper for the [CDISC Library API](https://www.cdisc.org/cdisc-library/api-documentation#/).
# Installation
To add CLA Wrapper to your project, run
```
npm install cla-wrapper
```
# Usage and Documentation
In order to use the API you need CDISC Library credentials(Basic Auth) or API key(OAuth2). See [CDISC page](https://www.cdisc.org/cdisc-library) for more details.

Create an instance of a CdiscLibrary class and use it to access CDISC Library.
```
// Connect to the CDISC Library using API key
let cl = new CdiscLibrary({ apiKey: 'apiKey' }});
// Get the VS dataset
let vs = await cl.getItemGroup('VS','sdtmig33');
```
See the wrapper [documentation](https://defineeditor.github.io/cla-wrapper/index.html) for details.

## Authors

* [**Dmitry Kolosov**](https://www.linkedin.com/in/dmitry-kolosov-91751413/)
* [**Sergei Krivtcov**](https://www.linkedin.com/in/sergey-krivtsov-677419b4/)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
