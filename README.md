cla-wrapper
===========
Javascript wrapper for [CDISC Library API](https://www.cdisc.org/cdisc-library/api-documentation#/).
# Installation
To add CLA Wrapper to your project, run
```
npm install cla-wrapper
```
# Usage and Documentation
In order to use the API you need CDISC Library credentials. See [CDISC page](https://www.cdisc.org/cdisc-library) for more details.

To add the cla wrapper to your project, run
```
npm install cla-wrapper
```
Create an instance of CdiscLibrary class and use it to access CDISC Library.
```
// Connect to the CDISC Library
let cl = new CdiscLibrary({username: 'login', password: 'pwd'}});
// Get the VS dataset
let vs = await cl.getItemGroup('VS','sdtmig33');
```
See API documentation for details.

## Authors

* [**Dmitry Kolosov**](https://www.linkedin.com/in/dmitry-kolosov-91751413/)
* [**Sergei Krivtcov**](https://www.linkedin.com/in/sergey-krivtsov-677419b4/)

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
