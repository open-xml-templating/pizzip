"use strict";
const utils = require("./utils.js");

function CompressedObject() {
	this.compressedSize = 0;
	this.uncompressedSize = 0;
	this.crc32 = 0;
	this.compressionMethod = null;
	this.compressedContent = null;
}

CompressedObject.from = function (source, getCompressedContent) {
	const compression = utils.findCompression(source.compressionMethod);
	if (!compression) {
		throw new Error(
			"Corrupted zip : compression " +
				utils.pretty(source.compressionMethod) +
				" unknown"
		);
	}
	const result = new CompressedObject();
	result.compressedSize = source.compressedSize;
	result.uncompressedSize = source.uncompressedSize;
	result.crc32 = source.crc32;
	result.compressionMethod = source.compressionMethod;
	result.getCompressedContent = getCompressedContent;
	result.getContent = function () {
		const content = compression.uncompress(
			utils.transformTo(compression.uncompressInputType, getCompressedContent())
		);
		if (content.length !== result.uncompressedSize) {
			throw new Error("Bug : uncompressed data size mismatch");
		}
		return content;
	};
	return result;
};

CompressedObject.prototype = {
	/**
	 * Return the decompressed content in an unspecified format.
	 * The format will depend on the decompressor.
	 * @return {Object} the decompressed content.
	 */
	getContent() {
		return null; // see implementation
	},
	/**
	 * Return the compressed content in an unspecified format.
	 * The format will depend on the compressed conten source.
	 * @return {Object} the compressed content.
	 */
	getCompressedContent() {
		return null; // see implementation
	},
};
module.exports = CompressedObject;
