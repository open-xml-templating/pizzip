---
title: "filter(predicate)"
layout: default
section: api
---

**Description** : Filter nested files/folders with the specified function.

**Arguments**

| name      | type     | description           |
| --------- | -------- | --------------------- |
| predicate | function | the predicate to use. |

The predicate has the following signature : `function (relativePath, file) {...}` :

| name         | type      | description                                                                                |
| ------------ | --------- | ------------------------------------------------------------------------------------------ |
| relativePath | string    | the filename and its path, reliatively to the current folder.                              |
| file         | ZipObject | the file being tested. See [ZipObject]({{site.baseurl}}/documentation/api_zipobject.html). |

The predicate must return true if the file should be included, false otherwise.

**Returns** : An array of matching ZipObject.

**Throws** : Nothing.

<!-- __Complexity__ : **O(k)** where k is the number of entries. -->

**Example**

```js
var zip = new PizZip().folder("dir");
zip.file("readme.txt", "content");
zip.filter(function (relativePath, file) {
  // relativePath == "readme.txt"
  // file = {name:"dir/readme.txt",options:{...},asText:function}
  return true / false;
});
```
