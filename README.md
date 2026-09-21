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

## Node.js streaming output

Use `generateNodeStream()` to write an archive without allocating the final output buffer:

```javascript
const { pipeline } = require("node:stream/promises");
const { createWriteStream } = require("node:fs");
const PizZip = require("pizzip");

const zip = new PizZip();
zip.file("Hello.txt", "Hello World\n");

await pipeline(
  zip.generateNodeStream({ compression: "DEFLATE" }),
  createWriteStream("example.zip")
);
```

Streaming output supports classic ZIP archives; sizes, offsets, and entry counts that require ZIP64 are rejected.

`generateNodeStream()`, `loadFile()`, and filesystem storage are Node.js-only. The browser build (`dist/pizzip.js`) keeps the in-memory `load()` / `generate()` API.

For disk-backed input, use `new PizZip().loadFile(path)`. To store added or loaded entries on disk, use `new PizZip(undefined, { storage: { type: "filesystem" } })`. Call `dispose()` after all reads and output streams have finished to release file readers and temporary storage.

### Large images and disk-backed archives

`loadFile()` keeps entry contents in the source file. `generateNodeStream()` reads disk-backed entries in chunks, including when changing compression methods. Checksums and compression are processed incrementally, so a large image does not have to be read back into memory in full.

```javascript
const zip = new PizZip(undefined, {
  storage: { type: "filesystem" },
  chunkSize: 1024 * 1024, // Default: 1 MiB.
});

try {
  zip.loadFile("input.docx", { checkCRC32: true });
  await pipeline(
    zip.generateNodeStream({ compression: "DEFLATE" }),
    createWriteStream("output.docx")
  );
} finally {
  zip.dispose();
}
```

`chunkSize` controls file-data reads, compression chunks, and maximum output write size. It must be an integer from 64 to 2,147,483,647 bytes. The constructor setting applies to disk checksum checks and streaming generation; `loadFile()` and `generateNodeStream()` can override it for that operation. Output `highWaterMark` defaults to the chosen chunk size and can be set separately.

This is a chunk-size setting, not a total memory limit: several pipeline buffers, compression state, and entry metadata also occupy memory. Keep the source file available and unchanged until generation finishes. Supplying a ZIP or image as a buffer already uses memory; synchronous `generate()` and extraction helpers such as `asNodeBuffer()` still return complete in-memory results. Use `loadFile()` and pipe `generateNodeStream()` directly to a file or network destination for bounded file-data buffering.

## License

PizZip is dual-licensed. You may use it under the MIT license _or_ the GPLv3 license. See [LICENSE.markdown](LICENSE.markdown).
