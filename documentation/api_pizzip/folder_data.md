---
title: "folder(name)"
layout: default
section: api
---

**Description** : Create a directory if it doesn't exist, return a new PizZip
object with the new folder as root.

See also [the `dir` option of file()]({{site.baseurl}}/documentation/api_pizzip/file_data.html).

**Arguments**

| name | type   | description                |
| ---- | ------ | -------------------------- |
| name | string | the name of the directory. |

**Returns** : A new PizZip (for chaining), with the new folder as root.

**Throws** : Nothing.

<!-- __Complexity__ : **O(1)** -->

**Example**

```js
zip.folder("images");
zip.folder("css").file("style.css", "body {background: #FF0000}");
// or specify an absolute path (using forward slashes)
zip.file("css/font.css", "body {font-family: sans-serif}");

// result : images/, css/, css/style.css, css/font.css
```
