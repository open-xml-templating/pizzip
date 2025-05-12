---
title: "folder(regex)"
layout: default
section: api
---

**Description** : Search a subdirectory in the current directory with a
[regular expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions).
The regex is tested against the relative path.

**Arguments**

| name  | type   | description       |
| ----- | ------ | ----------------- |
| regex | RegExp | the regex to use. |

**Returns** : An array of matching folders (an empty array if none matched).
Each maching folder is an instance of [ZipObject]({{site.baseurl}}/documentation/api_zipobject.html).

**Throws** : Nothing.

<!--
__Complexity__ : **O(k)** where k is the number of entries in the current PizZip
instance.
-->

**Example**

```js
var zip = new PizZip();
zip.folder("home/Pierre/videos");
zip.folder("home/Pierre/photos");
zip.folder("home/Jean/videos");
zip.folder("home/Jean/photos");

zip.folder(/videos/); // array of size 2

zip.folder("home/Jean").folder(/^vid/); // array of 1
```
