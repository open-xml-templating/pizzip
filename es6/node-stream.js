"use strict";

const {
	PassThrough,
	Readable,
	Transform,
	Writable,
	pipeline,
} = require("node:stream");
const { createDeflateRaw, createInflateRaw } = require("node:zlib");
const CompressedObject = require("./compressedObject.js");
const crc32 = require("./crc32.js");
const fileOrder = require("./file-order.js");

const STORE = 0;
const DEFLATE = 8;
const DATA_DESCRIPTOR = 0x0008;
const UTF8 = 0x0800;
const MAX_16 = 0xffff;
const MAX_32 = 0xffffffff;

function write16(buffer, value, offset) {
	if (value < 0 || value > MAX_16) {
		throw new RangeError("ZIP64 is required for this ZIP field");
	}
	buffer.writeUInt16LE(value, offset);
}

function write32(buffer, value, offset) {
	if (value < 0 || value > MAX_32) {
		throw new RangeError("ZIP64 is required for this ZIP field");
	}
	buffer.writeUInt32LE(value >>> 0, offset);
}

function dosDateTime(date) {
	const value = date || new Date();
	const year = Math.min(2107, Math.max(1980, value.getFullYear()));
	return {
		date:
			((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
		time:
			(value.getHours() << 11) |
			(value.getMinutes() << 5) |
			(value.getSeconds() >> 1),
	};
}

async function writeChunk(destination, chunk) {
	for (
		let offset = 0;
		offset < chunk.length;
		offset += destination._zipChunkSize
	) {
		await writeBuffer(
			destination,
			chunk.subarray(offset, offset + destination._zipChunkSize)
		);
	}
}

function writeBuffer(destination, chunk) {
	if (destination.destroyed) {
		return Promise.reject(new Error("ZIP stream was destroyed"));
	}
	if (destination.write(chunk)) {
		return Promise.resolve();
	}
	return new Promise((resolve, reject) => {
		function done(callback, value) {
			destination.removeListener("drain", onDrain);
			destination.removeListener("error", onError);
			destination.removeListener("close", onClose);
			callback(value);
		}
		function onDrain() {
			done(resolve);
		}
		function onError(error) {
			done(reject, error);
		}
		function onClose() {
			done(reject, new Error("ZIP stream closed before drain"));
		}
		destination.once("drain", onDrain);
		destination.once("error", onError);
		destination.once("close", onClose);
	});
}

function rawData(entry) {
	if (entry.dir) {
		return Buffer.alloc(0);
	}
	return entry.asNodeBuffer();
}

function asBuffer(value) {
	if (Buffer.isBuffer(value)) {
		return value;
	}
	if (value instanceof Uint8Array) {
		return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
	}
	if (typeof value === "string") {
		return Buffer.from(value, "binary");
	}
	throw new TypeError("ZIP entry has unsupported compressed data");
}

function isCompressed(data) {
	return data instanceof CompressedObject;
}

function compressionMethod(entry, options) {
	if (entry.dir) {
		return STORE;
	}
	const requested = entry.options.compression || options.compression;
	if (requested === "STORE") {
		return STORE;
	}
	if (requested === "DEFLATE") {
		return DEFLATE;
	}
	throw new Error(
		`${requested} is not a valid compression method for generateNodeStream`
	);
}

function* slices(data, chunkSize) {
	for (let offset = 0; offset < data.length; offset += chunkSize) {
		yield data.subarray(offset, offset + chunkSize);
	}
}

async function* entryChunks(entry, chunkSize) {
	const data = entry._data;
	if (isCompressed(data)) {
		if (data._fileReader && data._fileReader.createReadStream) {
			yield* data._fileReader.createReadStream(
				data._fileOffset,
				data.compressedSize,
				chunkSize
			);
		} else {
			yield* slices(asBuffer(data.getCompressedContent()), chunkSize);
		}
	} else if (data && data.createReadStream) {
		yield* data.createReadStream(chunkSize);
	} else {
		yield* slices(rawData(entry), chunkSize);
	}
}

function sourceFor(entry, reused, chunkSize) {
	return {
		stream: Readable.from(entryChunks(entry, chunkSize), {
			objectMode: false,
			highWaterMark: chunkSize,
		}),
		inflate:
			!reused &&
			isCompressed(entry._data) &&
			entry._data.compressionMethod === "\x08\x00",
	};
}

function utf8Flag(name, comment) {
	return Buffer.byteLength(name, "utf8") !== name.length ||
		Buffer.byteLength(comment, "utf8") !== comment.length
		? UTF8
		: 0;
}

function localHeader(entry) {
	const header = Buffer.alloc(30 + entry.name.length);
	header.writeUInt32LE(0x04034b50, 0);
	write16(header, entry.usesDescriptor ? 20 : 10, 4);
	write16(
		header,
		entry.flags | (entry.usesDescriptor ? DATA_DESCRIPTOR : 0),
		6
	);
	write16(header, entry.method, 8);
	write16(header, entry.time, 10);
	write16(header, entry.date, 12);
	write32(header, entry.usesDescriptor ? 0 : entry.crc32, 14);
	write32(header, entry.usesDescriptor ? 0 : entry.compressedSize, 18);
	write32(header, entry.usesDescriptor ? 0 : entry.uncompressedSize, 22);
	write16(header, entry.name.length, 26);
	write16(header, 0, 28);
	entry.name.copy(header, 30);
	return header;
}

function descriptor(entry) {
	const buffer = Buffer.alloc(16);
	buffer.writeUInt32LE(0x08074b50, 0);
	write32(buffer, entry.crc32, 4);
	write32(buffer, entry.compressedSize, 8);
	write32(buffer, entry.uncompressedSize, 12);
	return buffer;
}

function centralHeader(entry) {
	const buffer = Buffer.alloc(46 + entry.name.length + entry.comment.length);
	buffer.writeUInt32LE(0x02014b50, 0);
	write16(buffer, 0x0014, 4);
	write16(buffer, entry.usesDescriptor ? 20 : 10, 6);
	write16(
		buffer,
		entry.flags | (entry.usesDescriptor ? DATA_DESCRIPTOR : 0),
		8
	);
	write16(buffer, entry.method, 10);
	write16(buffer, entry.time, 12);
	write16(buffer, entry.date, 14);
	write32(buffer, entry.crc32, 16);
	write32(buffer, entry.compressedSize, 20);
	write32(buffer, entry.uncompressedSize, 24);
	write16(buffer, entry.name.length, 28);
	write16(buffer, 0, 30);
	write16(buffer, entry.comment.length, 32);
	write16(buffer, 0, 34);
	write16(buffer, 0, 36);
	write32(buffer, entry.dir ? 0x10 : entry.dosPermissions || 0, 38);
	write32(buffer, entry.offset, 42);
	entry.name.copy(buffer, 46);
	entry.comment.copy(buffer, 46 + entry.name.length);
	return buffer;
}

function endRecord(entries, size, offset, comment) {
	const buffer = Buffer.alloc(22 + comment.length);
	buffer.writeUInt32LE(0x06054b50, 0);
	write16(buffer, 0, 4);
	write16(buffer, 0, 6);
	write16(buffer, entries, 8);
	write16(buffer, entries, 10);
	write32(buffer, size, 12);
	write32(buffer, offset, 16);
	write16(buffer, comment.length, 20);
	comment.copy(buffer, 22);
	return buffer;
}

async function writeEntry(destination, entry, offset, options) {
	const name = Buffer.from(entry.name, "utf8");
	const comment = Buffer.from(entry.comment || "", "utf8");
	if (name.length > MAX_16 || comment.length > MAX_16) {
		throw new RangeError(
			"ZIP filename or comment exceeds the classic ZIP limit"
		);
	}
	const method = compressionMethod(entry, options);
	const reused =
		isCompressed(entry._data) &&
		entry._data.compressionMethod ===
			(method === STORE ? "\x00\x00" : "\x08\x00");
	const usesDescriptor = !reused;
	const dateTime = dosDateTime(entry.date);
	const metadata = {
		comment,
		compressedSize: reused ? entry._data.compressedSize : 0,
		crc32: reused ? entry._data.crc32 >>> 0 : 0,
		date: dateTime.date,
		dir: entry.dir,
		dosPermissions: entry.dosPermissions,
		flags: utf8Flag(entry.name, entry.comment || ""),
		method,
		name,
		offset,
		time: dateTime.time,
		uncompressedSize: reused ? entry._data.uncompressedSize : 0,
		usesDescriptor,
	};
	await writeChunk(destination, localHeader(metadata));
	const source = sourceFor(entry, reused, options.chunkSize);
	const stages = [source.stream];
	const streamOptions = {
		highWaterMark: options.chunkSize,
		chunkSize: options.chunkSize,
	};
	if (source.inflate) {
		stages.push(createInflateRaw(streamOptions));
	}
	if (!reused) {
		stages.push(
			new Transform({
				highWaterMark: options.chunkSize,
				transform(chunk, encoding, callback) {
					metadata.crc32 = crc32(chunk, metadata.crc32) >>> 0;
					metadata.uncompressedSize += chunk.length;
					if (
						isCompressed(entry._data) &&
						metadata.uncompressedSize > entry._data.uncompressedSize
					) {
						callback(new Error("Bug : uncompressed data size mismatch"));
						return;
					}
					if (metadata.uncompressedSize > MAX_32) {
						callback(new RangeError("ZIP64 is required for this ZIP field"));
						return;
					}
					callback(null, chunk);
				},
			})
		);
		if (method === DEFLATE) {
			const compressionOptions =
				entry.options.compressionOptions || options.compressionOptions;
			stages.push(
				createDeflateRaw({
					// Only level is part of the ZIP API; zlib flush/dictionary options
					// can produce data that ZIP readers cannot decompress.
					level: compressionOptions.level,
					...streamOptions,
				})
			);
		}
	}
	let written = 0;
	stages.push(
		new Writable({
			highWaterMark: options.chunkSize,
			write(chunk, encoding, callback) {
				written += chunk.length;
				if (written > MAX_32) {
					callback(new RangeError("ZIP64 is required for this ZIP field"));
					return;
				}
				writeChunk(destination, chunk).then(() => callback(), callback);
			},
		})
	);
	function onClose() {
		for (const stage of stages) {
			stage.destroy(new Error("ZIP stream was destroyed"));
		}
	}
	destination.once("close", onClose);
	try {
		await new Promise((resolve, reject) => {
			pipeline(...stages, (error) => (error ? reject(error) : resolve()));
			if (destination.destroyed) {
				onClose();
			}
		});
	} finally {
		destination.removeListener("close", onClose);
	}
	if (reused && written !== metadata.compressedSize) {
		throw new Error("Bug : compressed data size mismatch");
	}
	if (!reused) {
		if (
			isCompressed(entry._data) &&
			metadata.uncompressedSize !== entry._data.uncompressedSize
		) {
			throw new Error("Bug : uncompressed data size mismatch");
		}
		metadata.compressedSize = written;
		await writeChunk(destination, descriptor(metadata));
	}
	return metadata;
}

async function writeArchive(zip, destination, options) {
	const names = fileOrder(zip.files, options.fileOrder);
	if (names.length > MAX_16) {
		throw new RangeError("ZIP64 is required for more than 65535 entries");
	}
	let offset = 0;
	const entries = [];
	for (const name of names) {
		if (!Object.prototype.hasOwnProperty.call(zip.files, name)) {
			continue;
		}
		const entry = await writeEntry(
			destination,
			zip.files[name],
			offset,
			options
		);
		entries.push(entry);
		offset +=
			30 +
			entry.name.length +
			entry.compressedSize +
			(entry.usesDescriptor ? 16 : 0);
	}
	const centralOffset = offset;
	for (const entry of entries) {
		const header = centralHeader(entry);
		await writeChunk(destination, header);
		offset += header.length;
	}
	const comment = Buffer.from(options.comment || zip.comment || "", "utf8");
	if (comment.length > MAX_16) {
		throw new RangeError("ZIP comment exceeds the classic ZIP limit");
	}
	await writeChunk(
		destination,
		endRecord(entries.length, offset - centralOffset, centralOffset, comment)
	);
}

module.exports = function generateNodeStream(options = {}) {
	const chunkSize = require("./chunk-size.js")(
		options.chunkSize,
		this._chunkSize
	);
	const destination = new PassThrough({
		highWaterMark:
			options.highWaterMark === undefined ? chunkSize : options.highWaterMark,
	});
	destination._zipChunkSize = chunkSize;
	const settings = {
		chunkSize,
		comment: options.comment,
		compression: (options.compression || "STORE").toUpperCase(),
		compressionOptions: options.compressionOptions || {},
		fileOrder: options.fileOrder,
	};
	queueMicrotask(() => {
		writeArchive(this, destination, settings).then(
			() => destination.end(),
			(error) => destination.destroy(error)
		);
	});
	return destination;
};
