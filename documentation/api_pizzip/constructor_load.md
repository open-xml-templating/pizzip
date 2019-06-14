---
title: "new PizZip(data [,options]) or PizZip(data [,options])"
layout: default
section: api
---

This is a shortcut for

```js
var zip = new PizZip();
zip.load(data, options);
```

Please see the documentation of [load]({{site.baseurl}}/documentation/api_pizzip/load.html).

__Example__

```js
var zip = new PizZip(data, options);
// same as
var zip = PizZip(data, options);
```
