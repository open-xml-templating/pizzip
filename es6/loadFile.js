"use strict";

const FileReader = require("./fileReader.js");

module.exports = function (file, options) {
	const reader = new FileReader(file, {
		chunkSize:
			options && options.chunkSize !== undefined
				? options.chunkSize
				: this._chunkSize,
	});
	const snapshot = Object.assign({}, this.files);
	const comment = this.comment;
	try {
		this.load(reader, options);
		this._readers.add(reader);
		return this;
	} catch (error) {
		for (const name of Object.keys(this.files)) {
			delete this.files[name];
		}
		Object.assign(this.files, snapshot);
		this.comment = comment;
		reader.dispose();
		throw error;
	}
};
