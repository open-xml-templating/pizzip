"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const CompressedObject = require("./compressedObject.js");
const utils = require("./utils.js");

function toBuffer(data) {
	if (Buffer.isBuffer(data)) {
		return data;
	}
	if (data instanceof Uint8Array) {
		return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	}
	if (typeof data === "string") {
		return Buffer.from(data, "binary");
	}
	return Buffer.from(data);
}

function DiskData(storage, offset, size) {
	this.storage = storage;
	this.offset = offset;
	this.size = size;
}

DiskData.prototype.getContent = function () {
	return this.storage.read(this.offset, this.size);
};

DiskData.prototype.createReadStream = function (chunkSize) {
	return this.storage.createReadStream(this.offset, this.size, chunkSize);
};

FilesystemStorage.prototype.createReadStream =
	require("./fileReader.js").prototype.createReadStream;

function FilesystemStorage(options) {
	const directory = options.directory || os.tmpdir();
	if (!fs.statSync(directory).isDirectory()) {
		throw new Error(
			"Filesystem ZIP storage directory does not exist: " + directory
		);
	}
	this.path = fs.mkdtempSync(path.join(directory, "pizzip-"));
	this.file = path.join(this.path, "entries");
	this.fd = fs.openSync(this.file, "w+");
	this.size = 0;
	this.closed = false;
	this.filter = options.filter || null;
}

FilesystemStorage.prototype.shouldStore = function (name) {
	return !this.filter || this.filter(name);
};

FilesystemStorage.prototype.write = function (data, encoding) {
	if (this.closed) {
		throw new Error("Filesystem ZIP storage has been disposed");
	}
	const offset = this.size;
	if (typeof data === "string") {
		const size = Buffer.byteLength(data, encoding);
		fs.writeSync(this.fd, data, offset, encoding);
		this.size += size;
		return new DiskData(this, offset, size);
	}
	const buffer = toBuffer(data);
	fs.writeSync(this.fd, buffer, 0, buffer.length, offset);
	this.size += buffer.length;
	return new DiskData(this, offset, buffer.length);
};

FilesystemStorage.prototype.read = function (offset, size) {
	if (this.closed) {
		throw new Error("Filesystem ZIP storage has been disposed");
	}
	const buffer = Buffer.allocUnsafe(size);
	fs.readSync(this.fd, buffer, 0, size, offset);
	return buffer;
};

FilesystemStorage.prototype.compressed = function (data, source) {
	const diskData = this.write(data);
	const compression = utils.findCompression(source.compressionMethod);
	const result = new CompressedObject();
	result.compressedSize = source.compressedSize;
	result.uncompressedSize = source.uncompressedSize;
	result.crc32 = source.crc32;
	result.compressionMethod = source.compressionMethod;
	result._fileReader = this;
	result._fileOffset = diskData.offset;
	result.getCompressedContent = function () {
		return diskData.getContent();
	};
	result.getContent = function () {
		const content = compression.uncompress(
			utils.transformTo(compression.uncompressInputType, diskData.getContent())
		);
		if (content.length !== result.uncompressedSize) {
			throw new Error("Bug : uncompressed data size mismatch");
		}
		return content;
	};
	return result;
};

FilesystemStorage.prototype.dispose = function () {
	if (this.closed) {
		return;
	}
	this.closed = true;
	fs.closeSync(this.fd);
	fs.rmSync(this.path, { recursive: true, force: true });
};

FilesystemStorage.DiskData = DiskData;
module.exports = FilesystemStorage;
