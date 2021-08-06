"use strict";
const base64 = require("./base64.js");
const utf8 = require("./utf8.js");
const utils = require("./utils.js");
const ZipEntries = require("./zipEntries.js");
module.exports = function (data, options) {
	let i, input;
	options = utils.extend(options || {}, {
		base64: false,
		checkCRC32: false,
		optimizedBinaryString: false,
		createFolders: false,
		decodeFileName: utf8.utf8decode,
	});
	if (options.base64) {
		data = base64.decode(data);
	}

	const zipEntries = new ZipEntries(data, options);
	const files = zipEntries.files;
	for (i = 0; i < files.length; i++) {
		input = files[i];
		this.file(input.fileNameStr, input.decompressed, {
			binary: true,
			optimizedBinaryString: true,
			date: input.date,
			dir: input.dir,
			comment: input.fileCommentStr.length ? input.fileCommentStr : null,
			unixPermissions: input.unixPermissions,
			dosPermissions: input.dosPermissions,
			createFolders: options.createFolders,
		});
	}
	if (zipEntries.zipComment.length) {
		this.comment = zipEntries.zipComment;
	}

	return this;
};
