---
title: Changelog
layout: default
section: main
---

# v3.1.3

Update typescript typings to work correctly.

# v3.1.2

Add typescript typings

# v3.1.1

- Add zip.clone() function to deep clone a zip instance

- Remove usage of `new Buffer` in favor of `Buffer.from()` or `Buffer.alloc()`

# v3.1.0

Update pako to v2

When using new Pizzip(promise), show specific error message

# v3.0.5

Compile to es5

# v3.0.4

Add missing built files in dist

# v3.0.3

Migrate to babel, eslint, prettier and mocha

# v3.0.2

Export window.PizZipUtils in utils generated bundle

# v3.0.1

Update export to be able to do require("pizzip/utils");

# v3.0.0

Initial release of Pizzip

# v2.6.1 2016-07-28

- update pako to v1.0.2 to fix a DEFLATE bug (see [#322](https://github.com/Stuk/pizzip/pull/322)).

# v2.6.0 2016-03-23

- publish `dist/` files in the npm package (see [#225](https://github.com/Stuk/pizzip/pull/225)).
- update pako to v1.0.0 (see [#261](https://github.com/Stuk/pizzip/pull/261)).
- add support of Array in PizZip#load (see [#252](https://github.com/Stuk/pizzip/pull/252)).
- improve file name / comment encoding support (see [#211](https://github.com/Stuk/pizzip/pull/211)).
- handle prepended data (see [#266](https://github.com/Stuk/pizzip/pull/266)).
- improve platform coverage in tests (see [#233](https://github.com/Stuk/pizzip/pull/233) and [#269](https://github.com/Stuk/pizzip/pull/269)).

# v2.5.0 2015-03-10

- add support for custom mime-types (see [#199](https://github.com/Stuk/pizzip/issues/199)).
- add an option to set the DEFLATE level (see [#201](https://github.com/Stuk/pizzip/issues/201)).
- improve the error message with corrupted zip (see [#202](https://github.com/Stuk/pizzip/issues/202)).
- add support for UNIX / DOS permissions (see [#200](https://github.com/Stuk/pizzip/issues/200) and [#205](https://github.com/Stuk/pizzip/issues/205)).

# v2.4.0 2014-07-24

- update pako to 0.2.5 (see [#156](https://github.com/Stuk/pizzip/issues/156)).
- make PizZip work in a Firefox addon context (see [#151](https://github.com/Stuk/pizzip/issues/151)).
- add an option (`createFolders`) to control the subfolder generation (see [#154](https://github.com/Stuk/pizzip/issues/154)).
- allow `Buffer` polyfill in the browser (see [#139](https://github.com/Stuk/pizzip/issues/139)).

# v2.3.0 2014-06-18

- don't generate subfolders (see [#130](https://github.com/Stuk/pizzip/issues/130)).
- add comment support (see [#134](https://github.com/Stuk/pizzip/issues/134)).
- on `ZipObject#options`, the attributes `date` and `dir` have been deprecated and are now on `ZipObject` (see [the upgrade guide](http://stuk.github.io/pizzip/documentation/upgrade_guide.html)).
- on `ZipObject#options`, the attributes `base64` and `binary` have been deprecated (see [the upgrade guide](http://stuk.github.io/pizzip/documentation/upgrade_guide.html)).
- deprecate internal functions exposed in the public API (see [#123](https://github.com/Stuk/pizzip/issues/123)).
- improve UTF-8 support (see [#142](https://github.com/Stuk/pizzip/issues/142)).

# v2.2.2, 2014-05-01

- update pako to v0.2.1, fix an error when decompressing some files (see [#126](https://github.com/Stuk/pizzip/issues/126)).

# v2.2.1, 2014-04-23

- fix unreadable generated file on Windows 8 (see [#112](https://github.com/Stuk/pizzip/issues/112)).
- replace zlibjs with pako.

# v2.2.0, 2014-02-25

- make the `new` operator optional before the `PizZip` constructor (see [#93](https://github.com/Stuk/pizzip/pull/93)).
- update zlibjs to v0.2.0.

# v2.1.1, 2014-02-13

- use the npm package for zlib.js instead of the github url.

# v2.1.0, 2014-02-06

- split the files and use Browserify to generate the final file (see [#74](https://github.com/Stuk/pizzip/pull/74))
- packaging change : instead of 4 files (pizzip.js, pizzip-load.js, pizzip-inflate.js, pizzip-deflate.js) we now have 2 files : dist/pizzip.js and dist/pizzip.min.js
- add component/bower support
- rename variable: 'byte' is a reserved word (see [#76](https://github.com/Stuk/pizzip/pull/76))
- add support for the unicode path extra field (see [#82](https://github.com/Stuk/pizzip/pull/82))
- ensure that the generated files have a header with the licenses (see [#80](https://github.com/Stuk/pizzip/pull/80))

# v2.0.0, 2013-10-20

- `PizZipBase64` has been renamed to `PizZip.base64`.
- The `data` attribute on the object returned by `zip.file(name)` has been removed. Use `asText()`, `asBinary()`, `asUint8Array()`, `asArrayBuffer()` or `asNodeBuffer()`.

- [Fix issue with Android browser](https://github.com/Stuk/pizzip/pull/60)

- The compression/decompression methods now give their input type with the `compressInputType` and `uncompressInputType` attributes.
- Lazily decompress data when needed and [improve performance in general](https://github.com/Stuk/pizzip/pull/56)
- [Add support for `Buffer` in Node.js](https://github.com/Stuk/pizzip/pull/57).
- Package for CommonJS/npm.

# v1.0.1, 2013-03-04

- Fixed an issue when generating a compressed zip file with empty files or folders, see #33.
- With bad data (null or undefined), asText/asBinary/asUint8Array/asArrayBuffer methods now return an empty string, see #36.

# v1.0.0, 2013-02-14

- First release after a long period without version.
