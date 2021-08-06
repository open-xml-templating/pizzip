"use strict";
const support = require("./support.js");
const compressions = require("./compressions.js");
const nodeBuffer = require("./nodeBuffer.js");
/**
 * Convert a string to a "binary string" : a string containing only char codes between 0 and 255.
 * @param {string} str the string to transform.
 * @return {String} the binary string.
 */
exports.string2binary = function (str) {
	let result = "";
	for (let i = 0; i < str.length; i++) {
		result += String.fromCharCode(str.charCodeAt(i) & 0xff);
	}
	return result;
};
exports.arrayBuffer2Blob = function (buffer, mimeType) {
	exports.checkSupport("blob");
	mimeType = mimeType || "application/zip";

	try {
		// Blob constructor
		return new Blob([buffer], {
			type: mimeType,
		});
	} catch (e) {
		try {
			// deprecated, browser only, old way
			const Builder =
				window.BlobBuilder ||
				window.WebKitBlobBuilder ||
				window.MozBlobBuilder ||
				window.MSBlobBuilder;
			const builder = new Builder();
			builder.append(buffer);
			return builder.getBlob(mimeType);
		} catch (e) {
			// well, fuck ?!
			throw new Error("Bug : can't construct the Blob.");
		}
	}
};
/**
 * The identity function.
 * @param {Object} input the input.
 * @return {Object} the same input.
 */
function identity(input) {
	return input;
}

/**
 * Fill in an array with a string.
 * @param {String} str the string to use.
 * @param {Array|ArrayBuffer|Uint8Array|Buffer} array the array to fill in (will be mutated).
 * @return {Array|ArrayBuffer|Uint8Array|Buffer} the updated array.
 */
function stringToArrayLike(str, array) {
	for (let i = 0; i < str.length; ++i) {
		array[i] = str.charCodeAt(i) & 0xff;
	}
	return array;
}

/**
 * Transform an array-like object to a string.
 * @param {Array|ArrayBuffer|Uint8Array|Buffer} array the array to transform.
 * @return {String} the result.
 */
function arrayLikeToString(array) {
	// Performances notes :
	// --------------------
	// String.fromCharCode.apply(null, array) is the fastest, see
	// see http://jsperf.com/converting-a-uint8array-to-a-string/2
	// but the stack is limited (and we can get huge arrays !).
	//
	// result += String.fromCharCode(array[i]); generate too many strings !
	//
	// This code is inspired by http://jsperf.com/arraybuffer-to-string-apply-performance/2
	let chunk = 65536;
	const result = [],
		len = array.length,
		type = exports.getTypeOf(array);
	let k = 0,
		canUseApply = true;
	try {
		switch (type) {
			case "uint8array":
				String.fromCharCode.apply(null, new Uint8Array(0));
				break;
			case "nodebuffer":
				String.fromCharCode.apply(null, nodeBuffer(0));
				break;
		}
	} catch (e) {
		canUseApply = false;
	}

	// no apply : slow and painful algorithm
	// default browser on android 4.*
	if (!canUseApply) {
		let resultStr = "";
		for (let i = 0; i < array.length; i++) {
			resultStr += String.fromCharCode(array[i]);
		}
		return resultStr;
	}
	while (k < len && chunk > 1) {
		try {
			if (type === "array" || type === "nodebuffer") {
				result.push(
					String.fromCharCode.apply(
						null,
						array.slice(k, Math.min(k + chunk, len))
					)
				);
			} else {
				result.push(
					String.fromCharCode.apply(
						null,
						array.subarray(k, Math.min(k + chunk, len))
					)
				);
			}
			k += chunk;
		} catch (e) {
			chunk = Math.floor(chunk / 2);
		}
	}
	return result.join("");
}

exports.applyFromCharCode = arrayLikeToString;

/**
 * Copy the data from an array-like to an other array-like.
 * @param {Array|ArrayBuffer|Uint8Array|Buffer} arrayFrom the origin array.
 * @param {Array|ArrayBuffer|Uint8Array|Buffer} arrayTo the destination array which will be mutated.
 * @return {Array|ArrayBuffer|Uint8Array|Buffer} the updated destination array.
 */
function arrayLikeToArrayLike(arrayFrom, arrayTo) {
	for (let i = 0; i < arrayFrom.length; i++) {
		arrayTo[i] = arrayFrom[i];
	}
	return arrayTo;
}

// a matrix containing functions to transform everything into everything.
const transform = {};

// string to ?
transform.string = {
	string: identity,
	array(input) {
		return stringToArrayLike(input, new Array(input.length));
	},
	arraybuffer(input) {
		return transform.string.uint8array(input).buffer;
	},
	uint8array(input) {
		return stringToArrayLike(input, new Uint8Array(input.length));
	},
	nodebuffer(input) {
		return stringToArrayLike(input, nodeBuffer(input.length));
	},
};

// array to ?
transform.array = {
	string: arrayLikeToString,
	array: identity,
	arraybuffer(input) {
		return new Uint8Array(input).buffer;
	},
	uint8array(input) {
		return new Uint8Array(input);
	},
	nodebuffer(input) {
		return nodeBuffer(input);
	},
};

// arraybuffer to ?
transform.arraybuffer = {
	string(input) {
		return arrayLikeToString(new Uint8Array(input));
	},
	array(input) {
		return arrayLikeToArrayLike(
			new Uint8Array(input),
			new Array(input.byteLength)
		);
	},
	arraybuffer: identity,
	uint8array(input) {
		return new Uint8Array(input);
	},
	nodebuffer(input) {
		return nodeBuffer(new Uint8Array(input));
	},
};

// uint8array to ?
transform.uint8array = {
	string: arrayLikeToString,
	array(input) {
		return arrayLikeToArrayLike(input, new Array(input.length));
	},
	arraybuffer(input) {
		return input.buffer;
	},
	uint8array: identity,
	nodebuffer(input) {
		return nodeBuffer(input);
	},
};

// nodebuffer to ?
transform.nodebuffer = {
	string: arrayLikeToString,
	array(input) {
		return arrayLikeToArrayLike(input, new Array(input.length));
	},
	arraybuffer(input) {
		return transform.nodebuffer.uint8array(input).buffer;
	},
	uint8array(input) {
		return arrayLikeToArrayLike(input, new Uint8Array(input.length));
	},
	nodebuffer: identity,
};

/**
 * Transform an input into any type.
 * The supported output type are : string, array, uint8array, arraybuffer, nodebuffer.
 * If no output type is specified, the unmodified input will be returned.
 * @param {String} outputType the output type.
 * @param {String|Array|ArrayBuffer|Uint8Array|Buffer} input the input to convert.
 * @throws {Error} an Error if the browser doesn't support the requested output type.
 */
exports.transformTo = function (outputType, input) {
	if (!input) {
		// undefined, null, etc
		// an empty string won't harm.
		input = "";
	}
	if (!outputType) {
		return input;
	}
	exports.checkSupport(outputType);
	const inputType = exports.getTypeOf(input);
	const result = transform[inputType][outputType](input);
	return result;
};

/**
 * Return the type of the input.
 * The type will be in a format valid for PizZip.utils.transformTo : string, array, uint8array, arraybuffer.
 * @param {Object} input the input to identify.
 * @return {String} the (lowercase) type of the input.
 */
exports.getTypeOf = function (input) {
	if (input == null) {
		return;
	}
	if (typeof input === "string") {
		return "string";
	}
	if (Object.prototype.toString.call(input) === "[object Array]") {
		return "array";
	}
	if (support.nodebuffer && nodeBuffer.test(input)) {
		return "nodebuffer";
	}
	if (support.uint8array && input instanceof Uint8Array) {
		return "uint8array";
	}
	if (support.arraybuffer && input instanceof ArrayBuffer) {
		return "arraybuffer";
	}
	if (input instanceof Promise) {
		throw new Error(
			"Cannot read data from a promise, you probably are running new PizZip(data) with a promise"
		);
	}
	if (input instanceof Date) {
		throw new Error(
			"Cannot read data from a Date, you probably are running new PizZip(data) with a date"
		);
	}
	if (typeof input === "object" && input.crc32 == null) {
		throw new Error(
			"Unsupported data given to new PizZip(data) (object given)"
		);
	}
};

/**
 * Throw an exception if the type is not supported.
 * @param {String} type the type to check.
 * @throws {Error} an Error if the browser doesn't support the requested type.
 */
exports.checkSupport = function (type) {
	const supported = support[type.toLowerCase()];
	if (!supported) {
		throw new Error(type + " is not supported by this browser");
	}
};
exports.MAX_VALUE_16BITS = 65535;
exports.MAX_VALUE_32BITS = -1; // well, "\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF" is parsed as -1

/**
 * Prettify a string read as binary.
 * @param {string} str the string to prettify.
 * @return {string} a pretty string.
 */
exports.pretty = function (str) {
	let res = "",
		code,
		i;
	for (i = 0; i < (str || "").length; i++) {
		code = str.charCodeAt(i);
		res += "\\x" + (code < 16 ? "0" : "") + code.toString(16).toUpperCase();
	}
	return res;
};

/**
 * Find a compression registered in PizZip.
 * @param {string} compressionMethod the method magic to find.
 * @return {Object|null} the PizZip compression object, null if none found.
 */
exports.findCompression = function (compressionMethod) {
	for (const method in compressions) {
		if (!compressions.hasOwnProperty(method)) {
			continue;
		}
		if (compressions[method].magic === compressionMethod) {
			return compressions[method];
		}
	}
	return null;
};
/**
 * Cross-window, cross-Node-context regular expression detection
 * @param  {Object}  object Anything
 * @return {Boolean}        true if the object is a regular expression,
 * false otherwise
 */
exports.isRegExp = function (object) {
	return Object.prototype.toString.call(object) === "[object RegExp]";
};

/**
 * Merge the objects passed as parameters into a new one.
 * @private
 * @param {...Object} var_args All objects to merge.
 * @return {Object} a new object with the data of the others.
 */
exports.extend = function () {
	const result = {};
	let i, attr;
	for (i = 0; i < arguments.length; i++) {
		// arguments is not enumerable in some browsers
		for (attr in arguments[i]) {
			if (
				arguments[i].hasOwnProperty(attr) &&
				typeof result[attr] === "undefined"
			) {
				result[attr] = arguments[i][attr];
			}
		}
	}
	return result;
};
