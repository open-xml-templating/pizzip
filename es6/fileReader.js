"use strict";

const fs = require("node:fs");
const DataReader = require("./dataReader.js");

function FileReader(file, options = {}) {
	this.chunkSize = require("./chunk-size.js")(options.chunkSize);
	this.file = file;
	this.fd = fs.openSync(file, "r");
	this.length = fs.fstatSync(this.fd).size;
	this.index = 0;
	this.zero = 0;
	this.closed = false;
}

FileReader.prototype = new DataReader();

FileReader.prototype.byteAt = function (index) {
	const byte = Buffer.allocUnsafe(1);
	fs.readSync(this.fd, byte, 0, 1, this.zero + index);
	return byte[0];
};

FileReader.prototype.readData = function (size) {
	this.checkOffset(size);
	const data = Buffer.allocUnsafe(size);
	fs.readSync(this.fd, data, 0, size, this.zero + this.index);
	this.index += size;
	return data;
};

FileReader.prototype.lastIndexOfSignature = function (signature) {
	const size = Math.min(this.length, 0x10016);
	const offset = this.length - size;
	const data = Buffer.allocUnsafe(size);
	fs.readSync(this.fd, data, 0, size, offset);
	for (let i = data.length - 4; i >= 0; i--) {
		if (
			data[i] === signature.charCodeAt(0) &&
			data[i + 1] === signature.charCodeAt(1) &&
			data[i + 2] === signature.charCodeAt(2) &&
			data[i + 3] === signature.charCodeAt(3)
		) {
			return offset + i - this.zero;
		}
	}
	return -1;
};

FileReader.prototype.dispose = function () {
	if (this.closed) {
		return;
	}
	this.closed = true;
	fs.closeSync(this.fd);
};

FileReader.prototype.createReadStream = function (
	offset,
	size,
	chunkSize = this.chunkSize
) {
	if (this.closed) {
		throw new Error("ZIP file reader has been disposed");
	}
	if (!size) {
		return require("node:stream").Readable.from([]);
	}
	return fs.createReadStream(this.file, {
		start: offset,
		end: offset + size - 1,
		highWaterMark: chunkSize,
	});
};

FileReader.prototype.checkCRC32 = function (entry) {
	const crc32 = require("./crc32.js");
	let checksum = 0;
	let length = 0;
	function consume(chunk) {
		checksum = crc32(chunk, checksum);
		length += chunk.length;
		if (length > entry.uncompressedSize) {
			throw new Error("Bug : uncompressed data size mismatch");
		}
	}
	const inflater =
		entry.compressionMethod === "\x08\x00"
			? new (require("pako").Inflate)({ raw: true, chunkSize: this.chunkSize })
			: null;
	if (inflater) {
		inflater.onData = consume;
	}
	const buffer = Buffer.allocUnsafe(
		Math.min(this.chunkSize, entry.compressedSize)
	);
	let offset = 0;
	while (offset < entry.compressedSize) {
		const size = Math.min(buffer.length, entry.compressedSize - offset);
		const count = fs.readSync(
			this.fd,
			buffer,
			0,
			size,
			entry._fileOffset + offset
		);
		if (!count) {
			throw new Error("Corrupted zip : unexpected end of file");
		}
		offset += count;
		const chunk = buffer.subarray(0, count);
		if (inflater) {
			inflater.push(chunk, offset === entry.compressedSize);
			if (inflater.err) {
				throw new Error("Corrupted zip : " + inflater.msg);
			}
		} else {
			consume(chunk);
		}
	}
	if (length !== entry.uncompressedSize || (inflater && !inflater.ended)) {
		throw new Error("Bug : uncompressed data size mismatch");
	}
	if (checksum >>> 0 !== entry.crc32 >>> 0) {
		throw new Error("Corrupted zip : CRC32 mismatch");
	}
};

module.exports = FileReader;
