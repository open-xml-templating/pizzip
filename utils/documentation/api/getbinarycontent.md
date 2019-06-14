---

title: "getBinaryContent(path, callback)" layout: default

section: api
------------

**Description** : Use an AJAX call to fetch a file (HTTP GET) on the server that served the file. Cross domain requests will work if the browser support [them](http://caniuse.com/cors) but only if the server send the [right headers](https://developer.mozilla.org/en-US/docs/HTTP/Access_control_CORS). This function doesn't follow redirects : currently only `200 OK` are accepted.

**Arguments**

| name     | type     | description                      |
|----------|----------|----------------------------------|
| path     | String   | the path to the resource to GET. |
| callback | function | the callback function.           |

The callback function has the following signature : `function (err, data) {...}` :

| name | type               | description                               |
|------|--------------------|-------------------------------------------|
| err  | Error              | the error, if any.                        |
| data | ArrayBuffer/String | the data in a format suitable for PizZip. |

The data can be parsed by PizZip#load or used with PizZip#file to add a new file. With `PizZip#file` use `{binary:true}` as options.

**Returns** : Nothing.

**Throws** : Nothing.

<!--
__Complexity__ : **O(1)** everywhere but on IE <=9, **O(n)** on IE <=9, n being
the length of the fetched data.
-->

**Example**

```js
// loading a zip file
PizZipUtils.getBinaryContent("path/to/file.zip", function (err, data) {
   if(err) {
      throw err; // or handle the error
   }
   var zip = new PizZip(data);
});

// loading a file and add it in a zip file
PizZipUtils.getBinaryContent("path/to/picture.png", function (err, data) {
   if(err) {
      throw err; // or handle the error
   }
   var zip = new PizZip();
   zip.file("picture.png", data, {binary:true});
});
```
