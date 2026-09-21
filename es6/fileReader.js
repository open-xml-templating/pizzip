"use strict";

const fs = require("node:fs");
const { Readable } = require("node:stream");
const DataReader = require("./dataReader.js");

function readExactly(fd, buffer, offset, length, position) {
	let read = 0;
	while (read < length) {
		const count = fs.readSync(
			fd,
			buffer,
			offset + read,
			length - read,
			position + read
		);
		if (!count) {
			throw new Error("Corrupted zip : unexpected end of file");
		}
		read += count;
	}
}

function FileReader(file, options = {}) {
	this.chunkSize = require("./chunk-size.js")(options.chunkSize);
	this.file = file;
	this.fd = fs.openSync(file, "r");
	try {
		this.length = fs.fstatSync(this.fd).size;
	} catch (error) {
		fs.closeSync(this.fd);
		throw error;
	}
	this.index = 0;
	this.zero = 0;
	this.closed = false;
}

FileReader.prototype = new DataReader();
FileReader.prototype._pizzipFileReader = true;

FileReader.prototype.assertOpen = function () {
	if (this.closed) {
		throw new Error("ZIP file reader has been disposed");
	}
};

FileReader.prototype.byteAt = function (index) {
	this.assertOpen();
	const byte = Buffer.allocUnsafe(1);
	readExactly(this.fd, byte, 0, 1, this.zero + index);
	return byte[0];
};

FileReader.prototype.readData = function (size) {
	this.assertOpen();
	this.checkOffset(size);
	const data = Buffer.allocUnsafe(size);
	readExactly(this.fd, data, 0, size, this.zero + this.index);
	this.index += size;
	return data;
};

FileReader.prototype.lastIndexOfSignature = function (signature) {
	this.assertOpen();
	const size = Math.min(this.length, 0x10016);
	const offset = this.length - size;
	const data = Buffer.allocUnsafe(size);
	readExactly(this.fd, data, 0, size, offset);
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

function createFdReadStream(source, offset, size, chunkSize, disposedError) {
	if (source.closed) {
		throw new Error(disposedError);
	}
	if (!size) {
		return Readable.from([]);
	}
	let position = offset;
	let remaining = size;
	let pending = false;
	return new Readable({
		highWaterMark: chunkSize,
		read() {
			if (pending) {
				return;
			}
			if (source.closed) {
				this.destroy(new Error(disposedError));
				return;
			}
			if (remaining <= 0) {
				this.push(null);
				return;
			}
			pending = true;
			const buffer = Buffer.allocUnsafe(Math.min(chunkSize, remaining));
			fs.read(source.fd, buffer, 0, buffer.length, position, (error, count) => {
				pending = false;
				if (this.destroyed) {
					return;
				}
				if (source.closed) {
					this.destroy(new Error(disposedError));
					return;
				}
				if (error) {
					this.destroy(error);
					return;
				}
				if (!count) {
					this.destroy(new Error("Corrupted zip : unexpected end of file"));
					return;
				}
				position += count;
				remaining -= count;
				this.push(buffer.subarray(0, count));
			});
		},
	});
}

FileReader.prototype.createReadStream = function (
	offset,
	size,
	chunkSize = this.chunkSize
) {
	return createFdReadStream(
		this,
		offset,
		size,
		chunkSize,
		"ZIP file reader has been disposed"
	);
};

FileReader.prototype.checkCRC32 = function (entry) {
	this.assertOpen();
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
		readExactly(this.fd, buffer, 0, size, entry._fileOffset + offset);
		offset += size;
		const chunk = buffer.subarray(0, size);
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

FileReader.createFdReadStream = createFdReadStream;
module.exports = FileReader;
