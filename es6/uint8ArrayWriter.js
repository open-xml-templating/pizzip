"use strict";

const utils = require("./utils.js");

/**
 * An object to write any content to an Uint8Array.
 * @constructor
 * @param {number} length The length of the array.
 */
function Uint8ArrayWriter(length) {
	this.data = new Uint8Array(length);
	this.index = 0;
}
Uint8ArrayWriter.prototype = {
	/**
	 * Append any content to the current array.
	 * @param {Object} input the content to add.
	 */
	append(input) {
		if (input.length !== 0) {
			// with an empty Uint8Array, Opera fails with a "Offset larger than array size"
			input = utils.transformTo("uint8array", input);
			this.data.set(input, this.index);
			this.index += input.length;
		}
	},
	/**
	 * Finalize the construction an return the result.
	 * @return {Uint8Array} the generated array.
	 */
	finalize() {
		return this.data;
	},
};

module.exports = Uint8ArrayWriter;
