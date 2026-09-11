"use strict";

const FileReader = require("./fileReader.js");

module.exports = function (file, options) {
	const reader = new FileReader(file, {
		chunkSize: require("./chunk-size.js")(
			options && options.chunkSize,
			this._chunkSize
		),
	});
	try {
		this.load(reader, options);
		this._readers.add(reader);
		return this;
	} catch (error) {
		reader.dispose();
		throw error;
	}
};
