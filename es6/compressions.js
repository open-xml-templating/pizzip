"use strict";
exports.STORE = {
	magic: "\x00\x00",
	compress(content) {
		return content; // no compression
	},
	uncompress(content) {
		return content; // no compression
	},
	compressInputType: null,
	uncompressInputType: null,
};
exports.DEFLATE = require("./flate.js");
