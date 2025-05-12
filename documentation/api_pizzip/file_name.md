---
title: "file(name)"
layout: default
section: api
---

**Description** : Get a file with the specified name. You can specify folders
in the name : the folder separator is a forward slash ("/").

**Arguments**

| name | type   | description           |
| ---- | ------ | --------------------- |
| name | string | the name of the file. |

**Returns** : An instance of [ZipObject]({{site.baseurl}}/documentation/api_zipobject.html) representing
the file if any, `null` otherwise.

**Throws** : Nothing.

<!-- __Complexity__ : This is a simple lookup in **O(1)**. -->

**Examples**

```js
var zip = new PizZip();
zip.file("file.txt", "content");

zip.file("file.txt").name; // "file.txt"
zip.file("file.txt").asText(); // "content"
zip.file("file.txt").options.dir; // false

// utf8 example
var zip = new PizZip(zipFromAjaxWithUTF8);
zip.file("amount.txt").asText(); // "€15"
zip.file("amount.txt").asArrayBuffer(); // an ArrayBuffer containing €15 encoded as utf8
zip.file("amount.txt").asUint8Array(); // an Uint8Array containing €15 encoded as utf8

// with folders
zip.folder("sub").file("file.txt", "content");
zip.file("sub/file.txt"); // the file
// or
zip.folder("sub").file("file.txt"); // the file
```
