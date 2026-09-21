"use strict";

const base64 = require("./base64.js");

/**
Usage:
   zip = new PizZip();
   zip.file("hello.txt", "Hello, World!").file("tempfile", "nothing");
   zip.folder("images").file("smile.gif", base64Data, {base64: true});
   zip.file("Xmas.txt", "Ho ho ho !", {date : new Date("December 25, 2007 00:00:01")});
   zip.remove("tempfile");

   base64zip = zip.generate();

**/

/**
 * Representation a of zip file in js
 * @constructor
 * @param {String=|ArrayBuffer=|Uint8Array=} data the data to load, if any (optional).
 * @param {Object=} options the options for creating this objects (optional).
 */
function PizZip(data, options) {
	// if this constructor is used without `new`, it adds `new` before itself:
	if (!(this instanceof PizZip)) {
		return new PizZip(data, options);
	}

	// object containing the files :
	// {
	//   "folder/" : {...},
	//   "folder/data.txt" : {...}
	// }
	this.files = {};

	this.comment = null;
	this._chunkSize = require("./chunk-size.js")(options && options.chunkSize);
	this._storage = null;
	this._readers = new Set();
	if (options && options.storage && options.storage.type === "filesystem") {
		this._storage = new (require("./filesystem-storage.js"))({
			...options.storage,
			chunkSize: this._chunkSize,
		});
	}
	this.dispose = function () {
		for (const reader of this._readers) {
			reader.dispose();
		}
		this._readers.clear();
		if (this._storage) {
			this._storage.dispose();
		}
	};

	// Where we are in the hierarchy
	this.root = "";
	if (data) {
		try {
			this.load(data, options);
		} catch (error) {
			this.dispose();
			throw error;
		}
	}
	this.clone = function () {
		const newObj = new PizZip();
		Object.keys(this.files).forEach((file) => {
			newObj.file(file, this.files[file].asUint8Array());
		});
		return newObj;
	};
	this.shallowClone = function () {
		const newObj = new PizZip();
		for (const i in this) {
			if (typeof this[i] !== "function") {
				newObj[i] = this[i];
			}
		}
		return newObj;
	};
}
PizZip.prototype = require("./object.js");
PizZip.prototype.load = require("./load.js");
PizZip.prototype.loadFile = require("./loadFile.js");
PizZip.support = require("./support.js");
PizZip.defaults = require("./defaults.js");

/**
 * @deprecated
 * This namespace will be removed in a future version without replacement.
 */
PizZip.utils = require("./deprecatedPublicUtils.js");

PizZip.base64 = {
	/**
	 * @deprecated
	 * This method will be removed in a future version without replacement.
	 */
	encode(input) {
		return base64.encode(input);
	},
	/**
	 * @deprecated
	 * This method will be removed in a future version without replacement.
	 */
	decode(input) {
		return base64.decode(input);
	},
};
PizZip.compressions = require("./compressions.js");
PizZip.prototype.generateNodeStream = require("./node-stream.js");
module.exports = PizZip;
module.exports.default = PizZip;
