---
title: "remove(name)"
layout: default
section: api
---

**Description** : Delete a file or folder (recursively).

**Arguments**

| name | type   | description                            |
| ---- | ------ | -------------------------------------- |
| name | string | the name of the file/folder to delete. |

**Returns** : The current PizZip object.

**Throws** : Nothing.

<!--
__Complexity__ : **O(k)** where k is the number of entry to delete (may be > 1
when removing a folder).
-->

**Example**

```js
var zip = new PizZip();
zip.file("Hello.txt", "Hello World\n");
zip.file("temp.txt", "nothing").remove("temp.txt");
// result : Hello.txt

zip.folder("css").file("style.css", "body {background: #FF0000}");
zip.remove("css");
//result : empty zip
```
