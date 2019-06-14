---
title: "PizZip.support"
layout: default
section: api
---

If the browser supports them, PizZip can take advantage of some "new" features :
ArrayBuffer, Blob, Uint8Array. To know if PizZip can use them, you can check the
PizZip.support object. It contains the following boolean properties :

* `arraybuffer` : true if PizZip can read and generate ArrayBuffer, false otherwise.
* `uint8array` : true if PizZip can read and generate Uint8Array, false otherwise.
* `blob` : true if PizZip can generate Blob, false otherwise.
* `nodebuffer` : true if PizZip can read and generate nodejs Buffer, false otherwise.


