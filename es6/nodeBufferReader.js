"use strict";
const Uint8ArrayReader = require("./uint8ArrayReader.js");

function NodeBufferReader(data) {
	this.data = data;
	this.length = this.data.length;
	this.index = 0;
	this.zero = 0;
}
NodeBufferReader.prototype = new Uint8ArrayReader();

/**
 * @see DataReader.readData
 */
NodeBufferReader.prototype.readData = function (size) {
	this.checkOffset(size);
	const result = this.data.slice(
		this.zero + this.index,
		this.zero + this.index + size
	);
	this.index += size;
	return result;
};
module.exports = NodeBufferReader;
