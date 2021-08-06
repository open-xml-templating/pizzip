"use strict";
const support = require("./support.js");
const utils = require("./utils.js");
const crc32 = require("./crc32.js");
const signature = require("./signature.js");
const defaults = require("./defaults.js");
const base64 = require("./base64.js");
const compressions = require("./compressions.js");
const CompressedObject = require("./compressedObject.js");
const nodeBuffer = require("./nodeBuffer.js");
const utf8 = require("./utf8.js");
const StringWriter = require("./stringWriter.js");
const Uint8ArrayWriter = require("./uint8ArrayWriter.js");

/**
 * Returns the raw data of a ZipObject, decompress the content if necessary.
 * @param {ZipObject} file the file to use.
 * @return {String|ArrayBuffer|Uint8Array|Buffer} the data.
 */
function getRawData(file) {
	if (file._data instanceof CompressedObject) {
		file._data = file._data.getContent();
		file.options.binary = true;
		file.options.base64 = false;

		if (utils.getTypeOf(file._data) === "uint8array") {
			const copy = file._data;
			// when reading an arraybuffer, the CompressedObject mechanism will keep it and subarray() a Uint8Array.
			// if we request a file in the same format, we might get the same Uint8Array or its ArrayBuffer (the original zip file).
			file._data = new Uint8Array(copy.length);
			// with an empty Uint8Array, Opera fails with a "Offset larger than array size"
			if (copy.length !== 0) {
				file._data.set(copy, 0);
			}
		}
	}
	return file._data;
}

/**
 * Returns the data of a ZipObject in a binary form. If the content is an unicode string, encode it.
 * @param {ZipObject} file the file to use.
 * @return {String|ArrayBuffer|Uint8Array|Buffer} the data.
 */
function getBinaryData(file) {
	const result = getRawData(file),
		type = utils.getTypeOf(result);
	if (type === "string") {
		if (!file.options.binary) {
			// unicode text !
			// unicode string => binary string is a painful process, check if we can avoid it.
			if (support.nodebuffer) {
				return nodeBuffer(result, "utf-8");
			}
		}
		return file.asBinary();
	}
	return result;
}

// return the actual prototype of PizZip
const out = {
	/**
	 * Read an existing zip and merge the data in the current PizZip object.
	 * The implementation is in pizzip-load.js, don't forget to include it.
	 * @param {String|ArrayBuffer|Uint8Array|Buffer} stream  The stream to load
	 * @param {Object} options Options for loading the stream.
	 *  options.base64 : is the stream in base64 ? default : false
	 * @return {PizZip} the current PizZip object
	 */
	load() {
		throw new Error(
			"Load method is not defined. Is the file pizzip-load.js included ?"
		);
	},

	/**
	 * Filter nested files/folders with the specified function.
	 * @param {Function} search the predicate to use :
	 * function (relativePath, file) {...}
	 * It takes 2 arguments : the relative path and the file.
	 * @return {Array} An array of matching elements.
	 */
	filter(search) {
		const result = [];
		let filename, relativePath, file, fileClone;
		for (filename in this.files) {
			if (!this.files.hasOwnProperty(filename)) {
				continue;
			}
			file = this.files[filename];
			// return a new object, don't let the user mess with our internal objects :)
			fileClone = new ZipObject(
				file.name,
				file._data,
				utils.extend(file.options)
			);
			relativePath = filename.slice(this.root.length, filename.length);
			if (
				filename.slice(0, this.root.length) === this.root && // the file is in the current root
				search(relativePath, fileClone)
			) {
				// and the file matches the function
				result.push(fileClone);
			}
		}
		return result;
	},

	/**
	 * Add a file to the zip file, or search a file.
	 * @param   {string|RegExp} name The name of the file to add (if data is defined),
	 * the name of the file to find (if no data) or a regex to match files.
	 * @param   {String|ArrayBuffer|Uint8Array|Buffer} data  The file data, either raw or base64 encoded
	 * @param   {Object} o     File options
	 * @return  {PizZip|Object|Array} this PizZip object (when adding a file),
	 * a file (when searching by string) or an array of files (when searching by regex).
	 */
	file(name, data, o) {
		if (arguments.length === 1) {
			if (utils.isRegExp(name)) {
				const regexp = name;
				return this.filter(function (relativePath, file) {
					return !file.dir && regexp.test(relativePath);
				});
			}
			// text
			return (
				this.filter(function (relativePath, file) {
					return !file.dir && relativePath === name;
				})[0] || null
			);
		}
		// more than one argument : we have data !
		name = this.root + name;
		fileAdd.call(this, name, data, o);

		return this;
	},

	/**
	 * Add a directory to the zip file, or search.
	 * @param   {String|RegExp} arg The name of the directory to add, or a regex to search folders.
	 * @return  {PizZip} an object with the new directory as the root, or an array containing matching folders.
	 */
	folder(arg) {
		if (!arg) {
			return this;
		}

		if (utils.isRegExp(arg)) {
			return this.filter(function (relativePath, file) {
				return file.dir && arg.test(relativePath);
			});
		}

		// else, name is a new folder
		const name = this.root + arg;
		const newFolder = folderAdd.call(this, name);

		// Allow chaining by returning a new object with this folder as the root
		const ret = this.clone();
		ret.root = newFolder.name;
		return ret;
	},

	/**
	 * Delete a file, or a directory and all sub-files, from the zip
	 * @param {string} name the name of the file to delete
	 * @return {PizZip} this PizZip object
	 */
	remove(name) {
		name = this.root + name;
		let file = this.files[name];
		if (!file) {
			// Look for any folders
			if (name.slice(-1) !== "/") {
				name += "/";
			}
			file = this.files[name];
		}

		if (file && !file.dir) {
			// file
			delete this.files[name];
		} else {
			// maybe a folder, delete recursively
			const kids = this.filter(function (relativePath, file) {
				return file.name.slice(0, name.length) === name;
			});
			for (let i = 0; i < kids.length; i++) {
				delete this.files[kids[i].name];
			}
		}

		return this;
	},

	/**
	 * Generate the complete zip file
	 * @param {Object} options the options to generate the zip file :
	 * - base64, (deprecated, use type instead) true to generate base64.
	 * - compression, "STORE" by default.
	 * - type, "base64" by default. Values are : string, base64, uint8array, arraybuffer, blob.
	 * @return {String|Uint8Array|ArrayBuffer|Buffer|Blob} the zip file
	 */
	generate(options) {
		options = utils.extend(options || {}, {
			base64: true,
			compression: "STORE",
			compressionOptions: null,
			type: "base64",
			platform: "DOS",
			comment: null,
			mimeType: "application/zip",
			encodeFileName: utf8.utf8encode,
		});

		utils.checkSupport(options.type);

		// accept nodejs `process.platform`
		if (
			options.platform === "darwin" ||
			options.platform === "freebsd" ||
			options.platform === "linux" ||
			options.platform === "sunos"
		) {
			options.platform = "UNIX";
		}
		if (options.platform === "win32") {
			options.platform = "DOS";
		}

		const zipData = [],
			encodedComment = utils.transformTo(
				"string",
				options.encodeFileName(options.comment || this.comment || "")
			);
		let localDirLength = 0,
			centralDirLength = 0,
			writer,
			i;

		// first, generate all the zip parts.
		for (const name in this.files) {
			if (!this.files.hasOwnProperty(name)) {
				continue;
			}
			const file = this.files[name];

			const compressionName =
				file.options.compression || options.compression.toUpperCase();
			const compression = compressions[compressionName];
			if (!compression) {
				throw new Error(
					compressionName + " is not a valid compression method !"
				);
			}
			const compressionOptions =
				file.options.compressionOptions || options.compressionOptions || {};

			const compressedObject = generateCompressedObjectFrom.call(
				this,
				file,
				compression,
				compressionOptions
			);

			const zipPart = generateZipParts.call(
				this,
				name,
				file,
				compressedObject,
				localDirLength,
				options.platform,
				options.encodeFileName
			);
			localDirLength +=
				zipPart.fileRecord.length + compressedObject.compressedSize;
			centralDirLength += zipPart.dirRecord.length;
			zipData.push(zipPart);
		}

		let dirEnd = "";

		// end of central dir signature
		dirEnd =
			signature.CENTRAL_DIRECTORY_END +
			// number of this disk
			"\x00\x00" +
			// number of the disk with the start of the central directory
			"\x00\x00" +
			// total number of entries in the central directory on this disk
			decToHex(zipData.length, 2) +
			// total number of entries in the central directory
			decToHex(zipData.length, 2) +
			// size of the central directory   4 bytes
			decToHex(centralDirLength, 4) +
			// offset of start of central directory with respect to the starting disk number
			decToHex(localDirLength, 4) +
			// .ZIP file comment length
			decToHex(encodedComment.length, 2) +
			// .ZIP file comment
			encodedComment;

		// we have all the parts (and the total length)
		// time to create a writer !
		const typeName = options.type.toLowerCase();
		if (
			typeName === "uint8array" ||
			typeName === "arraybuffer" ||
			typeName === "blob" ||
			typeName === "nodebuffer"
		) {
			writer = new Uint8ArrayWriter(
				localDirLength + centralDirLength + dirEnd.length
			);
		} else {
			writer = new StringWriter(
				localDirLength + centralDirLength + dirEnd.length
			);
		}

		for (i = 0; i < zipData.length; i++) {
			writer.append(zipData[i].fileRecord);
			writer.append(zipData[i].compressedObject.compressedContent);
		}
		for (i = 0; i < zipData.length; i++) {
			writer.append(zipData[i].dirRecord);
		}

		writer.append(dirEnd);

		const zip = writer.finalize();

		switch (options.type.toLowerCase()) {
			// case "zip is an Uint8Array"
			case "uint8array":
			case "arraybuffer":
			case "nodebuffer":
				return utils.transformTo(options.type.toLowerCase(), zip);
			case "blob":
				return utils.arrayBuffer2Blob(
					utils.transformTo("arraybuffer", zip),
					options.mimeType
				);
			// case "zip is a string"
			case "base64":
				return options.base64 ? base64.encode(zip) : zip;
			default:
				// case "string" :
				return zip;
		}
	},

	/**
	 * @deprecated
	 * This method will be removed in a future version without replacement.
	 */
	crc32(input, crc) {
		return crc32(input, crc);
	},

	/**
	 * @deprecated
	 * This method will be removed in a future version without replacement.
	 */
	utf8encode(string) {
		return utils.transformTo("string", utf8.utf8encode(string));
	},

	/**
	 * @deprecated
	 * This method will be removed in a future version without replacement.
	 */
	utf8decode(input) {
		return utf8.utf8decode(input);
	},
};
/**
 * Transform this._data into a string.
 * @param {function} filter a function String -> String, applied if not null on the result.
 * @return {String} the string representing this._data.
 */
function dataToString(asUTF8) {
	let result = getRawData(this);
	if (result === null || typeof result === "undefined") {
		return "";
	}
	// if the data is a base64 string, we decode it before checking the encoding !
	if (this.options.base64) {
		result = base64.decode(result);
	}
	if (asUTF8 && this.options.binary) {
		// PizZip.prototype.utf8decode supports arrays as input
		// skip to array => string step, utf8decode will do it.
		result = out.utf8decode(result);
	} else {
		// no utf8 transformation, do the array => string step.
		result = utils.transformTo("string", result);
	}

	if (!asUTF8 && !this.options.binary) {
		result = utils.transformTo("string", out.utf8encode(result));
	}
	return result;
}
/**
 * A simple object representing a file in the zip file.
 * @constructor
 * @param {string} name the name of the file
 * @param {String|ArrayBuffer|Uint8Array|Buffer} data the data
 * @param {Object} options the options of the file
 */
function ZipObject(name, data, options) {
	this.name = name;
	this.dir = options.dir;
	this.date = options.date;
	this.comment = options.comment;
	this.unixPermissions = options.unixPermissions;
	this.dosPermissions = options.dosPermissions;

	this._data = data;
	this.options = options;

	/*
	 * This object contains initial values for dir and date.
	 * With them, we can check if the user changed the deprecated metadata in
	 * `ZipObject#options` or not.
	 */
	this._initialMetadata = {
		dir: options.dir,
		date: options.date,
	};
}

ZipObject.prototype = {
	/**
	 * Return the content as UTF8 string.
	 * @return {string} the UTF8 string.
	 */
	asText() {
		return dataToString.call(this, true);
	},
	/**
	 * Returns the binary content.
	 * @return {string} the content as binary.
	 */
	asBinary() {
		return dataToString.call(this, false);
	},
	/**
	 * Returns the content as a nodejs Buffer.
	 * @return {Buffer} the content as a Buffer.
	 */
	asNodeBuffer() {
		const result = getBinaryData(this);
		return utils.transformTo("nodebuffer", result);
	},
	/**
	 * Returns the content as an Uint8Array.
	 * @return {Uint8Array} the content as an Uint8Array.
	 */
	asUint8Array() {
		const result = getBinaryData(this);
		return utils.transformTo("uint8array", result);
	},
	/**
	 * Returns the content as an ArrayBuffer.
	 * @return {ArrayBuffer} the content as an ArrayBufer.
	 */
	asArrayBuffer() {
		return this.asUint8Array().buffer;
	},
};

/**
 * Transform an integer into a string in hexadecimal.
 * @private
 * @param {number} dec the number to convert.
 * @param {number} bytes the number of bytes to generate.
 * @returns {string} the result.
 */
function decToHex(dec, bytes) {
	let hex = "",
		i;
	for (i = 0; i < bytes; i++) {
		hex += String.fromCharCode(dec & 0xff);
		dec >>>= 8;
	}
	return hex;
}

/**
 * Transforms the (incomplete) options from the user into the complete
 * set of options to create a file.
 * @private
 * @param {Object} o the options from the user.
 * @return {Object} the complete set of options.
 */
function prepareFileAttrs(o) {
	o = o || {};
	if (o.base64 === true && (o.binary === null || o.binary === undefined)) {
		o.binary = true;
	}
	o = utils.extend(o, defaults);
	o.date = o.date || new Date();
	if (o.compression !== null) {
		o.compression = o.compression.toUpperCase();
	}

	return o;
}

/**
 * Add a file in the current folder.
 * @private
 * @param {string} name the name of the file
 * @param {String|ArrayBuffer|Uint8Array|Buffer} data the data of the file
 * @param {Object} o the options of the file
 * @return {Object} the new file.
 */
function fileAdd(name, data, o) {
	// be sure sub folders exist
	let dataType = utils.getTypeOf(data),
		parent;

	o = prepareFileAttrs(o);

	if (typeof o.unixPermissions === "string") {
		o.unixPermissions = parseInt(o.unixPermissions, 8);
	}

	// UNX_IFDIR  0040000 see zipinfo.c
	if (o.unixPermissions && o.unixPermissions & 0x4000) {
		o.dir = true;
	}
	// Bit 4    Directory
	if (o.dosPermissions && o.dosPermissions & 0x0010) {
		o.dir = true;
	}

	if (o.dir) {
		name = forceTrailingSlash(name);
	}

	if (o.createFolders && (parent = parentFolder(name))) {
		folderAdd.call(this, parent, true);
	}

	if (o.dir || data === null || typeof data === "undefined") {
		o.base64 = false;
		o.binary = false;
		data = null;
		dataType = null;
	} else if (dataType === "string") {
		if (o.binary && !o.base64) {
			// optimizedBinaryString == true means that the file has already been filtered with a 0xFF mask
			if (o.optimizedBinaryString !== true) {
				// this is a string, not in a base64 format.
				// Be sure that this is a correct "binary string"
				data = utils.string2binary(data);
			}
		}
	} else {
		// arraybuffer, uint8array, ...
		o.base64 = false;
		o.binary = true;

		if (!dataType && !(data instanceof CompressedObject)) {
			throw new Error(
				"The data of '" + name + "' is in an unsupported format !"
			);
		}

		// special case : it's way easier to work with Uint8Array than with ArrayBuffer
		if (dataType === "arraybuffer") {
			data = utils.transformTo("uint8array", data);
		}
	}

	const object = new ZipObject(name, data, o);
	this.files[name] = object;
	return object;
}

/**
 * Find the parent folder of the path.
 * @private
 * @param {string} path the path to use
 * @return {string} the parent folder, or ""
 */
function parentFolder(path) {
	if (path.slice(-1) === "/") {
		path = path.substring(0, path.length - 1);
	}
	const lastSlash = path.lastIndexOf("/");
	return lastSlash > 0 ? path.substring(0, lastSlash) : "";
}

/**
 * Returns the path with a slash at the end.
 * @private
 * @param {String} path the path to check.
 * @return {String} the path with a trailing slash.
 */
function forceTrailingSlash(path) {
	// Check the name ends with a /
	if (path.slice(-1) !== "/") {
		path += "/"; // IE doesn't like substr(-1)
	}
	return path;
}
/**
 * Add a (sub) folder in the current folder.
 * @private
 * @param {string} name the folder's name
 * @param {boolean=} [createFolders] If true, automatically create sub
 *  folders. Defaults to false.
 * @return {Object} the new folder.
 */
function folderAdd(name, createFolders) {
	createFolders = typeof createFolders !== "undefined" ? createFolders : false;

	name = forceTrailingSlash(name);

	// Does this folder already exist?
	if (!this.files[name]) {
		fileAdd.call(this, name, null, {
			dir: true,
			createFolders,
		});
	}
	return this.files[name];
}

/**
 * Generate a PizZip.CompressedObject for a given zipOject.
 * @param {ZipObject} file the object to read.
 * @param {PizZip.compression} compression the compression to use.
 * @param {Object} compressionOptions the options to use when compressing.
 * @return {PizZip.CompressedObject} the compressed result.
 */
function generateCompressedObjectFrom(file, compression, compressionOptions) {
	const result = new CompressedObject();
	let content;

	// the data has not been decompressed, we might reuse things !
	if (file._data instanceof CompressedObject) {
		result.uncompressedSize = file._data.uncompressedSize;
		result.crc32 = file._data.crc32;

		if (result.uncompressedSize === 0 || file.dir) {
			compression = compressions.STORE;
			result.compressedContent = "";
			result.crc32 = 0;
		} else if (file._data.compressionMethod === compression.magic) {
			result.compressedContent = file._data.getCompressedContent();
		} else {
			content = file._data.getContent();
			// need to decompress / recompress
			result.compressedContent = compression.compress(
				utils.transformTo(compression.compressInputType, content),
				compressionOptions
			);
		}
	} else {
		// have uncompressed data
		content = getBinaryData(file);
		if (!content || content.length === 0 || file.dir) {
			compression = compressions.STORE;
			content = "";
		}
		result.uncompressedSize = content.length;
		result.crc32 = crc32(content);
		result.compressedContent = compression.compress(
			utils.transformTo(compression.compressInputType, content),
			compressionOptions
		);
	}

	result.compressedSize = result.compressedContent.length;
	result.compressionMethod = compression.magic;

	return result;
}

/**
 * Generate the UNIX part of the external file attributes.
 * @param {Object} unixPermissions the unix permissions or null.
 * @param {Boolean} isDir true if the entry is a directory, false otherwise.
 * @return {Number} a 32 bit integer.
 *
 * adapted from http://unix.stackexchange.com/questions/14705/the-zip-formats-external-file-attribute :
 *
 * TTTTsstrwxrwxrwx0000000000ADVSHR
 * ^^^^____________________________ file type, see zipinfo.c (UNX_*)
 *     ^^^_________________________ setuid, setgid, sticky
 *        ^^^^^^^^^________________ permissions
 *                 ^^^^^^^^^^______ not used ?
 *                           ^^^^^^ DOS attribute bits : Archive, Directory, Volume label, System file, Hidden, Read only
 */
function generateUnixExternalFileAttr(unixPermissions, isDir) {
	let result = unixPermissions;
	if (!unixPermissions) {
		// I can't use octal values in strict mode, hence the hexa.
		//  040775 => 0x41fd
		// 0100664 => 0x81b4
		result = isDir ? 0x41fd : 0x81b4;
	}

	return (result & 0xffff) << 16;
}

/**
 * Generate the DOS part of the external file attributes.
 * @param {Object} dosPermissions the dos permissions or null.
 * @param {Boolean} isDir true if the entry is a directory, false otherwise.
 * @return {Number} a 32 bit integer.
 *
 * Bit 0     Read-Only
 * Bit 1     Hidden
 * Bit 2     System
 * Bit 3     Volume Label
 * Bit 4     Directory
 * Bit 5     Archive
 */
function generateDosExternalFileAttr(dosPermissions) {
	// the dir flag is already set for compatibility

	return (dosPermissions || 0) & 0x3f;
}

/**
 * Generate the various parts used in the construction of the final zip file.
 * @param {string} name the file name.
 * @param {ZipObject} file the file content.
 * @param {PizZip.CompressedObject} compressedObject the compressed object.
 * @param {number} offset the current offset from the start of the zip file.
 * @param {String} platform let's pretend we are this platform (change platform dependents fields)
 * @param {Function} encodeFileName the function to encode the file name / comment.
 * @return {object} the zip parts.
 */
function generateZipParts(
	name,
	file,
	compressedObject,
	offset,
	platform,
	encodeFileName
) {
	const useCustomEncoding = encodeFileName !== utf8.utf8encode,
		encodedFileName = utils.transformTo("string", encodeFileName(file.name)),
		utfEncodedFileName = utils.transformTo(
			"string",
			utf8.utf8encode(file.name)
		),
		comment = file.comment || "",
		encodedComment = utils.transformTo("string", encodeFileName(comment)),
		utfEncodedComment = utils.transformTo("string", utf8.utf8encode(comment)),
		useUTF8ForFileName = utfEncodedFileName.length !== file.name.length,
		useUTF8ForComment = utfEncodedComment.length !== comment.length,
		o = file.options;

	let dosTime,
		dosDate,
		extraFields = "",
		unicodePathExtraField = "",
		unicodeCommentExtraField = "",
		dir,
		date;

	// handle the deprecated options.dir
	if (file._initialMetadata.dir !== file.dir) {
		dir = file.dir;
	} else {
		dir = o.dir;
	}

	// handle the deprecated options.date
	if (file._initialMetadata.date !== file.date) {
		date = file.date;
	} else {
		date = o.date;
	}

	let extFileAttr = 0;
	let versionMadeBy = 0;
	if (dir) {
		// dos or unix, we set the dos dir flag
		extFileAttr |= 0x00010;
	}
	if (platform === "UNIX") {
		versionMadeBy = 0x031e; // UNIX, version 3.0
		extFileAttr |= generateUnixExternalFileAttr(file.unixPermissions, dir);
	} else {
		// DOS or other, fallback to DOS
		versionMadeBy = 0x0014; // DOS, version 2.0
		extFileAttr |= generateDosExternalFileAttr(file.dosPermissions, dir);
	}

	// date
	// @see http://www.delorie.com/djgpp/doc/rbinter/it/52/13.html
	// @see http://www.delorie.com/djgpp/doc/rbinter/it/65/16.html
	// @see http://www.delorie.com/djgpp/doc/rbinter/it/66/16.html

	dosTime = date.getHours();
	dosTime <<= 6;
	dosTime |= date.getMinutes();
	dosTime <<= 5;
	dosTime |= date.getSeconds() / 2;

	dosDate = date.getFullYear() - 1980;
	dosDate <<= 4;
	dosDate |= date.getMonth() + 1;
	dosDate <<= 5;
	dosDate |= date.getDate();

	if (useUTF8ForFileName) {
		// set the unicode path extra field. unzip needs at least one extra
		// field to correctly handle unicode path, so using the path is as good
		// as any other information. This could improve the situation with
		// other archive managers too.
		// This field is usually used without the utf8 flag, with a non
		// unicode path in the header (winrar, winzip). This helps (a bit)
		// with the messy Windows' default compressed folders feature but
		// breaks on p7zip which doesn't seek the unicode path extra field.
		// So for now, UTF-8 everywhere !
		unicodePathExtraField =
			// Version
			decToHex(1, 1) +
			// NameCRC32
			decToHex(crc32(encodedFileName), 4) +
			// UnicodeName
			utfEncodedFileName;

		extraFields +=
			// Info-ZIP Unicode Path Extra Field
			"\x75\x70" +
			// size
			decToHex(unicodePathExtraField.length, 2) +
			// content
			unicodePathExtraField;
	}

	if (useUTF8ForComment) {
		unicodeCommentExtraField =
			// Version
			decToHex(1, 1) +
			// CommentCRC32
			decToHex(this.crc32(encodedComment), 4) +
			// UnicodeName
			utfEncodedComment;

		extraFields +=
			// Info-ZIP Unicode Path Extra Field
			"\x75\x63" +
			// size
			decToHex(unicodeCommentExtraField.length, 2) +
			// content
			unicodeCommentExtraField;
	}

	let header = "";

	// version needed to extract
	header += "\x0A\x00";
	// general purpose bit flag
	// set bit 11 if utf8
	header +=
		!useCustomEncoding && (useUTF8ForFileName || useUTF8ForComment)
			? "\x00\x08"
			: "\x00\x00";
	// compression method
	header += compressedObject.compressionMethod;
	// last mod file time
	header += decToHex(dosTime, 2);
	// last mod file date
	header += decToHex(dosDate, 2);
	// crc-32
	header += decToHex(compressedObject.crc32, 4);
	// compressed size
	header += decToHex(compressedObject.compressedSize, 4);
	// uncompressed size
	header += decToHex(compressedObject.uncompressedSize, 4);
	// file name length
	header += decToHex(encodedFileName.length, 2);
	// extra field length
	header += decToHex(extraFields.length, 2);

	const fileRecord =
		signature.LOCAL_FILE_HEADER + header + encodedFileName + extraFields;

	const dirRecord =
		signature.CENTRAL_FILE_HEADER +
		// version made by (00: DOS)
		decToHex(versionMadeBy, 2) +
		// file header (common to file and central directory)
		header +
		// file comment length
		decToHex(encodedComment.length, 2) +
		// disk number start
		"\x00\x00" +
		// internal file attributes
		"\x00\x00" +
		// external file attributes
		decToHex(extFileAttr, 4) +
		// relative offset of local header
		decToHex(offset, 4) +
		// file name
		encodedFileName +
		// extra field
		extraFields +
		// file comment
		encodedComment;

	return {
		fileRecord,
		dirRecord,
		compressedObject,
	};
}

module.exports = out;
