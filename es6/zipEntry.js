"use strict";
const StringReader = require("./stringReader.js");
const utils = require("./utils.js");
const CompressedObject = require("./compressedObject.js");
const pizzipProto = require("./object.js");
const support = require("./support.js");

const MADE_BY_DOS = 0x00;
const MADE_BY_UNIX = 0x03;

// class ZipEntry {{{
/**
 * An entry in the zip file.
 * @constructor
 * @param {Object} options Options of the current file.
 * @param {Object} loadOptions Options for loading the stream.
 */
function ZipEntry(options, loadOptions) {
	this.options = options;
	this.loadOptions = loadOptions;
}
ZipEntry.prototype = {
	/**
	 * say if the file is encrypted.
	 * @return {boolean} true if the file is encrypted, false otherwise.
	 */
	isEncrypted() {
		// bit 1 is set
		return (this.bitFlag & 0x0001) === 0x0001;
	},
	/**
	 * say if the file has utf-8 filename/comment.
	 * @return {boolean} true if the filename/comment is in utf-8, false otherwise.
	 */
	useUTF8() {
		// bit 11 is set
		return (this.bitFlag & 0x0800) === 0x0800;
	},
	/**
	 * Prepare the function used to generate the compressed content from this ZipFile.
	 * @param {DataReader} reader the reader to use.
	 * @param {number} from the offset from where we should read the data.
	 * @param {number} length the length of the data to read.
	 * @return {Function} the callback to get the compressed content (the type depends of the DataReader class).
	 */
	prepareCompressedContent(reader, from, length) {
		return function () {
			const previousIndex = reader.index;
			reader.setIndex(from);
			const compressedFileData = reader.readData(length);
			reader.setIndex(previousIndex);

			return compressedFileData;
		};
	},
	/**
	 * Prepare the function used to generate the uncompressed content from this ZipFile.
	 * @param {DataReader} reader the reader to use.
	 * @param {number} from the offset from where we should read the data.
	 * @param {number} length the length of the data to read.
	 * @param {PizZip.compression} compression the compression used on this file.
	 * @param {number} uncompressedSize the uncompressed size to expect.
	 * @return {Function} the callback to get the uncompressed content (the type depends of the DataReader class).
	 */
	prepareContent(reader, from, length, compression, uncompressedSize) {
		return function () {
			const compressedFileData = utils.transformTo(
				compression.uncompressInputType,
				this.getCompressedContent()
			);
			const uncompressedFileData = compression.uncompress(compressedFileData);

			if (uncompressedFileData.length !== uncompressedSize) {
				throw new Error("Bug : uncompressed data size mismatch");
			}

			return uncompressedFileData;
		};
	},
	/**
	 * Read the local part of a zip file and add the info in this object.
	 * @param {DataReader} reader the reader to use.
	 */
	readLocalPart(reader) {
		// we already know everything from the central dir !
		// If the central dir data are false, we are doomed.
		// On the bright side, the local part is scary  : zip64, data descriptors, both, etc.
		// The less data we get here, the more reliable this should be.
		// Let's skip the whole header and dash to the data !
		reader.skip(22);
		// in some zip created on windows, the filename stored in the central dir contains \ instead of /.
		// Strangely, the filename here is OK.
		// I would love to treat these zip files as corrupted (see http://www.info-zip.org/FAQ.html#backslashes
		// or APPNOTE#4.4.17.1, "All slashes MUST be forward slashes '/'") but there are a lot of bad zip generators...
		// Search "unzip mismatching "local" filename continuing with "central" filename version" on
		// the internet.
		//
		// I think I see the logic here : the central directory is used to display
		// content and the local directory is used to extract the files. Mixing / and \
		// may be used to display \ to windows users and use / when extracting the files.
		// Unfortunately, this lead also to some issues : http://seclists.org/fulldisclosure/2009/Sep/394
		this.fileNameLength = reader.readInt(2);
		const localExtraFieldsLength = reader.readInt(2); // can't be sure this will be the same as the central dir
		this.fileName = reader.readData(this.fileNameLength);
		reader.skip(localExtraFieldsLength);

		if (this.compressedSize === -1 || this.uncompressedSize === -1) {
			throw new Error(
				"Bug or corrupted zip : didn't get enough informations from the central directory " +
					"(compressedSize == -1 || uncompressedSize == -1)"
			);
		}

		const compression = utils.findCompression(this.compressionMethod);
		if (compression === null) {
			// no compression found
			throw new Error(
				"Corrupted zip : compression " +
					utils.pretty(this.compressionMethod) +
					" unknown (inner file : " +
					utils.transformTo("string", this.fileName) +
					")"
			);
		}
		this.decompressed = new CompressedObject();
		this.decompressed.compressedSize = this.compressedSize;
		this.decompressed.uncompressedSize = this.uncompressedSize;
		this.decompressed.crc32 = this.crc32;
		this.decompressed.compressionMethod = this.compressionMethod;
		this.decompressed.getCompressedContent = this.prepareCompressedContent(
			reader,
			reader.index,
			this.compressedSize,
			compression
		);
		this.decompressed.getContent = this.prepareContent(
			reader,
			reader.index,
			this.compressedSize,
			compression,
			this.uncompressedSize
		);

		// we need to compute the crc32...
		if (this.loadOptions.checkCRC32) {
			this.decompressed = utils.transformTo(
				"string",
				this.decompressed.getContent()
			);
			if (pizzipProto.crc32(this.decompressed) !== this.crc32) {
				throw new Error("Corrupted zip : CRC32 mismatch");
			}
		}
	},

	/**
	 * Read the central part of a zip file and add the info in this object.
	 * @param {DataReader} reader the reader to use.
	 */
	readCentralPart(reader) {
		this.versionMadeBy = reader.readInt(2);
		this.versionNeeded = reader.readInt(2);
		this.bitFlag = reader.readInt(2);
		this.compressionMethod = reader.readString(2);
		this.date = reader.readDate();
		this.crc32 = reader.readInt(4);
		this.compressedSize = reader.readInt(4);
		this.uncompressedSize = reader.readInt(4);
		this.fileNameLength = reader.readInt(2);
		this.extraFieldsLength = reader.readInt(2);
		this.fileCommentLength = reader.readInt(2);
		this.diskNumberStart = reader.readInt(2);
		this.internalFileAttributes = reader.readInt(2);
		this.externalFileAttributes = reader.readInt(4);
		this.localHeaderOffset = reader.readInt(4);

		if (this.isEncrypted()) {
			throw new Error("Encrypted zip are not supported");
		}

		this.fileName = reader.readData(this.fileNameLength);
		this.readExtraFields(reader);
		this.parseZIP64ExtraField(reader);
		this.fileComment = reader.readData(this.fileCommentLength);
	},

	/**
	 * Parse the external file attributes and get the unix/dos permissions.
	 */
	processAttributes() {
		this.unixPermissions = null;
		this.dosPermissions = null;
		const madeBy = this.versionMadeBy >> 8;

		// Check if we have the DOS directory flag set.
		// We look for it in the DOS and UNIX permissions
		// but some unknown platform could set it as a compatibility flag.
		this.dir = !!(this.externalFileAttributes & 0x0010);

		if (madeBy === MADE_BY_DOS) {
			// first 6 bits (0 to 5)
			this.dosPermissions = this.externalFileAttributes & 0x3f;
		}

		if (madeBy === MADE_BY_UNIX) {
			this.unixPermissions = (this.externalFileAttributes >> 16) & 0xffff;
			// the octal permissions are in (this.unixPermissions & 0x01FF).toString(8);
		}

		// fail safe : if the name ends with a / it probably means a folder
		if (!this.dir && this.fileNameStr.slice(-1) === "/") {
			this.dir = true;
		}
	},

	/**
	 * Parse the ZIP64 extra field and merge the info in the current ZipEntry.
	 */
	parseZIP64ExtraField() {
		if (!this.extraFields[0x0001]) {
			return;
		}

		// should be something, preparing the extra reader
		const extraReader = new StringReader(this.extraFields[0x0001].value);

		// I really hope that these 64bits integer can fit in 32 bits integer, because js
		// won't let us have more.
		if (this.uncompressedSize === utils.MAX_VALUE_32BITS) {
			this.uncompressedSize = extraReader.readInt(8);
		}
		if (this.compressedSize === utils.MAX_VALUE_32BITS) {
			this.compressedSize = extraReader.readInt(8);
		}
		if (this.localHeaderOffset === utils.MAX_VALUE_32BITS) {
			this.localHeaderOffset = extraReader.readInt(8);
		}
		if (this.diskNumberStart === utils.MAX_VALUE_32BITS) {
			this.diskNumberStart = extraReader.readInt(4);
		}
	},
	/**
	 * Read the central part of a zip file and add the info in this object.
	 * @param {DataReader} reader the reader to use.
	 */
	readExtraFields(reader) {
		const start = reader.index;
		let extraFieldId, extraFieldLength, extraFieldValue;

		this.extraFields = this.extraFields || {};

		while (reader.index < start + this.extraFieldsLength) {
			extraFieldId = reader.readInt(2);
			extraFieldLength = reader.readInt(2);
			extraFieldValue = reader.readString(extraFieldLength);

			this.extraFields[extraFieldId] = {
				id: extraFieldId,
				length: extraFieldLength,
				value: extraFieldValue,
			};
		}
	},
	/**
	 * Apply an UTF8 transformation if needed.
	 */
	handleUTF8() {
		const decodeParamType = support.uint8array ? "uint8array" : "array";
		if (this.useUTF8()) {
			this.fileNameStr = pizzipProto.utf8decode(this.fileName);
			this.fileCommentStr = pizzipProto.utf8decode(this.fileComment);
		} else {
			const upath = this.findExtraFieldUnicodePath();
			if (upath !== null) {
				this.fileNameStr = upath;
			} else {
				const fileNameByteArray = utils.transformTo(
					decodeParamType,
					this.fileName
				);
				this.fileNameStr = this.loadOptions.decodeFileName(fileNameByteArray);
			}

			const ucomment = this.findExtraFieldUnicodeComment();
			if (ucomment !== null) {
				this.fileCommentStr = ucomment;
			} else {
				const commentByteArray = utils.transformTo(
					decodeParamType,
					this.fileComment
				);
				this.fileCommentStr = this.loadOptions.decodeFileName(commentByteArray);
			}
		}
	},

	/**
	 * Find the unicode path declared in the extra field, if any.
	 * @return {String} the unicode path, null otherwise.
	 */
	findExtraFieldUnicodePath() {
		const upathField = this.extraFields[0x7075];
		if (upathField) {
			const extraReader = new StringReader(upathField.value);

			// wrong version
			if (extraReader.readInt(1) !== 1) {
				return null;
			}

			// the crc of the filename changed, this field is out of date.
			if (pizzipProto.crc32(this.fileName) !== extraReader.readInt(4)) {
				return null;
			}

			return pizzipProto.utf8decode(
				extraReader.readString(upathField.length - 5)
			);
		}
		return null;
	},

	/**
	 * Find the unicode comment declared in the extra field, if any.
	 * @return {String} the unicode comment, null otherwise.
	 */
	findExtraFieldUnicodeComment() {
		const ucommentField = this.extraFields[0x6375];
		if (ucommentField) {
			const extraReader = new StringReader(ucommentField.value);

			// wrong version
			if (extraReader.readInt(1) !== 1) {
				return null;
			}

			// the crc of the comment changed, this field is out of date.
			if (pizzipProto.crc32(this.fileComment) !== extraReader.readInt(4)) {
				return null;
			}

			return pizzipProto.utf8decode(
				extraReader.readString(ucommentField.length - 5)
			);
		}
		return null;
	},
};
module.exports = ZipEntry;
