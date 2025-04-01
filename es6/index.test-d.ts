import PizZip from "./index.js";
import { expectType, expectError } from "tsd";
import * as fs from "fs";

const zip1 = new PizZip();

zip1.file(
  "smile.gif",
  "R0lGODdhBQAFAIACAAAAAP/eACwAAAAABQAFAAACCIwPkWerClIBADs=",
  { base64: true }
);

expectError(zip1.foo("xxx"));

var zip3 = new PizZip();
expectError(zip3.load());

var zip2 = new PizZip();
zip2.load("foobar");

const output = zip1.generate({
  type: "blob",
  mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  compression: "DEFLATE",
});

expectError(zip1.generate({ optionXYZ: true }));

const zip = new PizZip();

if (PizZip.support.blob) {
  /* amazing */
}

new PizZip("data", {
  base64: true,
  checkCRC32: true,
  createFolders: true,
  optimizedBinaryString: true,
  decodeFileName: (a) => "",
});

zip
  .file("Hello.txt", "Hello World\n")
  .file(
    "smile.gif",
    "R0lGODdhBQAFAIACAAAAAP/eACwAAAAABQAFAAACCIwPkWerClIBADs=",
    { base64: true }
  )
  .file("smile.gif", fs.readFileSync("smile.gif"))
  .file("Xmas.txt", "Ho ho ho !", {
    date: new Date("December 25, 2007 00:00:01"),
  })
  .file("folder/file.txt", "file in folder", { createFolders: true })
  .file("script.sh", "echo 'hello world'", { unixPermissions: "755" })
  .folder("css")
  .remove("css");

zip.load("content", { decodeFileName: (bytes) => "encoding" });
zip.file(/file/).map((z) => z);
zip.folder(/^vid/).map((z) => z);
zip.filter((relativePath, file) => true).map((z) => z);
zip.folder("subfolder").load("data");

const file = zip.file("");

if (file) {
  const nameTest: string = file.name;
  const textTest: string = file.asText();
  const binaryTest: string = file.asBinary();
  const arrBufTest: ArrayBuffer = file.asArrayBuffer();
  const uint8Test: Uint8Array = file.asUint8Array();
  const bufTest: Buffer = file.asNodeBuffer();
}

const noOptionsTest: string = zip.generate();
const noTypeTest: string = zip.generate({ base64: true });
const b64Test: string = zip.generate({
  type: "base64",
  compression: "DEFLATE",
});
const stringTest: string = zip.generate({
  type: "string",
  encodeFileName: (s) => new Buffer(s),
});
const arrBufTest: ArrayBuffer = zip.generate({
  type: "arraybuffer",
  mimeType: "",
});
const blobTest: Blob = zip.generate({
  type: "blob",
  compressionOptions: { level: 1 },
});
const bufTest: Buffer = zip.generate({ type: "nodebuffer", platform: "DOS" });
const unit8Test: Uint8Array = zip.generate({
  type: "uint8array",
  base64: true,
});

zip.generate({
  type: "nodebuffer",
  fileOrder: function (files) {
    return [];
  },
});
