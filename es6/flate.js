"use strict";
const USE_TYPEDARRAY =
	typeof Uint8Array !== "undefined" &&
	typeof Uint16Array !== "undefined" &&
	typeof Uint32Array !== "undefined";

const pako = require("pako/dist/pako.es5.min.js");
exports.uncompressInputType = USE_TYPEDARRAY ? "uint8array" : "array";
exports.compressInputType = USE_TYPEDARRAY ? "uint8array" : "array";

exports.magic = "\x08\x00";
exports.compress = function (input, compressionOptions) {
	return pako.deflateRaw(input, {
		level: compressionOptions.level || -1, // default compression
	});
};
exports.uncompress = function (input) {
	return pako.inflateRaw(input);
};
