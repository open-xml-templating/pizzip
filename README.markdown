# PizZip

PizZip is a fork of JSZip version 2.x, because we want a synchronous Zip library.

A library for creating, reading and editing .zip files with Javascript, with a lovely and simple API.

```javascript
var zip = new PizZip();

zip.file("Hello.txt", "Hello World\n");

var img = zip.folder("images");
img.file("smile.gif", imgData, { base64: true });

var content = zip.generate({ type: "blob" });

// see FileSaver.js
saveAs(content, "example.zip");

/*
Results in a zip containing
Hello.txt
images/
    smile.gif
*/
```

## License

PizZip is dual-licensed. You may use it under the MIT license _or_ the GPLv3 license. See [LICENSE.markdown](LICENSE.markdown).
