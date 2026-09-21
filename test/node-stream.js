"use strict";

const { strict: assert } = require("assert");
const PizZip = require("../es6/index.js");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function collect(stream) {
	const chunks = [];
	for await (const chunk of stream) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}

describe("PizZip Node streaming", () => {
	describe("chunked disk processing", () => {
		let directory;
		let zip;
		beforeEach(() => {
			directory = fs.mkdtempSync(path.join(os.tmpdir(), "pizzip-stream-test-"));
		});
		afterEach(() => {
			if (zip) {
				zip.dispose();
				zip = null;
			}
			fs.rmSync(directory, { recursive: true, force: true });
		});

		for (const inputCompression of ["STORE", "DEFLATE"]) {
			for (const outputCompression of ["STORE", "DEFLATE"]) {
				it(`loads and streams a 20 MiB image: ${inputCompression} to ${outputCompression}`, async function () {
					this.timeout(10000);
					const image = Buffer.alloc(20 * 1024 * 1024, 7);
					const source = new PizZip();
					source.file("image.bin", image);
					source.file("empty.txt", "");
					source.folder("empty-folder");
					const file = path.join(directory, "input.zip");
					fs.writeFileSync(
						file,
						source.generate({
							type: "nodebuffer",
							compression: inputCompression,
						})
					);
					zip = new PizZip(undefined, { chunkSize: 128 * 1024 });
					const originalRead = fs.readSync;
					try {
						fs.readSync = function (fd, buffer, offset, length, position) {
							assert.ok(
								length <= 128 * 1024,
								"disk loading must use bounded reads"
							);
							return originalRead(fd, buffer, offset, length, position);
						};
						zip.loadFile(file, { checkCRC32: true });
					} finally {
						fs.readSync = originalRead;
					}
					for (const reader of zip._readers) {
						const createReadStream = reader.createReadStream;
						reader.createReadStream = function (offset, size, chunkSize) {
							assert.equal(
								chunkSize,
								64 * 1024,
								"generation overrides the constructor chunk size"
							);
							return createReadStream.call(this, offset, size, chunkSize);
						};
					}
					for (const entry of Object.values(zip.files)) {
						if (!entry._data) {
							continue;
						}
						entry._data.getContent = entry._data.getCompressedContent = () => {
							throw new Error("whole-entry reads are forbidden");
						};
					}
					const output = await collect(
						zip.generateNodeStream({
							compression: outputCompression,
							chunkSize: 64 * 1024,
						})
					);
					const result = new PizZip(output, { checkCRC32: true });
					assert.deepEqual(result.file("image.bin").asNodeBuffer(), image);
					assert.equal(result.file("empty.txt").asText(), "");
					assert.ok(result.files["empty-folder/"].dir);
				});
			}
		}

		it("streams added and spooled entries without reading them in full", async function () {
			this.timeout(10000);
			const source = new PizZip();
			source.file("loaded.bin", Buffer.alloc(2 * 1024 * 1024, 9));
			zip = new PizZip(
				source.generate({ type: "nodebuffer", compression: "DEFLATE" }),
				{
					storage: { type: "filesystem", directory },
					chunkSize: 64 * 1024,
				}
			);
			zip.file("added.bin", Buffer.alloc(20 * 1024 * 1024, 5));
			zip.file("empty.txt", "");
			zip._storage.read = () => {
				throw new Error("whole-entry reads are forbidden");
			};
			for (const compression of ["STORE", "DEFLATE"]) {
				const output = await collect(zip.generateNodeStream({ compression }));
				const result = new PizZip(output, { checkCRC32: true });
				assert.deepEqual(
					result.file("added.bin").asNodeBuffer(),
					Buffer.alloc(20 * 1024 * 1024, 5)
				);
				assert.deepEqual(
					result.file("loaded.bin").asNodeBuffer(),
					Buffer.alloc(2 * 1024 * 1024, 9)
				);
				assert.equal(result.file("empty.txt").asText(), "");
			}
		});

		it("streams media added after loading an existing zip with a filter", async function () {
			this.timeout(10000);
			const source = new PizZip();
			source.file("word/document.xml", "<w:document/>");
			source.file("word/media/old.bin", Buffer.alloc(64 * 1024, 1), {
				compression: "STORE",
			});
			const names = [];
			zip = new PizZip(source.generate({ type: "nodebuffer" }), {
				storage: {
					type: "filesystem",
					directory,
					filter(name) {
						names.push(name);
						return name.startsWith("word/media/");
					},
				},
				chunkSize: 16 * 1024,
			});
			const added = Buffer.alloc(512 * 1024, 2);
			zip.file("word/media/new.bin", added);
			assert.ok(names.includes("word/media/new.bin"));
			added.fill(0);
			zip._storage.read = () => {
				throw new Error("whole-entry reads are forbidden");
			};
			const output = await collect(
				zip.generateNodeStream({ compression: "STORE" })
			);
			const result = new PizZip(output, { checkCRC32: true });
			assert.equal(result.file("word/document.xml").asText(), "<w:document/>");
			assert.deepEqual(
				result.file("word/media/old.bin").asNodeBuffer(),
				Buffer.alloc(64 * 1024, 1)
			);
			assert.deepEqual(
				result.file("word/media/new.bin").asNodeBuffer(),
				Buffer.alloc(512 * 1024, 2)
			);
		});

		it("copies loadFile media into entries in chunks", async function () {
			this.timeout(10000);
			const source = new PizZip();
			source.file("word/document.xml", "<w:document/>");
			source.file("word/media/old.bin", Buffer.alloc(256 * 1024, 3), {
				compression: "STORE",
			});
			const archive = path.join(directory, "template.docx");
			fs.writeFileSync(
				archive,
				source.generate({ type: "nodebuffer", compression: "STORE" })
			);
			zip = new PizZip(undefined, {
				storage: {
					type: "filesystem",
					directory,
					filter: (name) => name.startsWith("word/media/"),
				},
				chunkSize: 16 * 1024,
			});
			zip.loadFile(archive);
			assert.strictEqual(zip._storage.size, 256 * 1024);
			assert.strictEqual(fs.statSync(zip._storage.file).size, 256 * 1024);
			zip.file("word/media/new.bin", Buffer.alloc(128 * 1024, 4));
			zip._storage.read = () => {
				throw new Error("whole-entry reads are forbidden");
			};
			const output = await collect(
				zip.generateNodeStream({ compression: "STORE" })
			);
			const result = new PizZip(output, { checkCRC32: true });
			assert.equal(result.file("word/document.xml").asText(), "<w:document/>");
			assert.deepEqual(
				result.file("word/media/old.bin").asNodeBuffer(),
				Buffer.alloc(256 * 1024, 3)
			);
			assert.deepEqual(
				result.file("word/media/new.bin").asNodeBuffer(),
				Buffer.alloc(128 * 1024, 4)
			);
		});

		it("rejects corrupted disk input during incremental checksum validation", () => {
			const source = new PizZip();
			source.file("image.bin", "image content");
			const archive = source.generate({ type: "nodebuffer" });
			archive[30 + Buffer.byteLength("image.bin")] ^= 1;
			const file = path.join(directory, "bad.zip");
			fs.writeFileSync(file, archive);
			zip = new PizZip();
			zip.file("kept.txt", "kept");
			assert.throws(
				() => zip.loadFile(file, { checkCRC32: true }),
				/CRC32 mismatch/
			);
			assert.equal(zip._readers.size, 0);
			assert.equal(zip.file("kept.txt").asText(), "kept");
			assert.equal(zip.file("image.bin"), null);
		});

		it("handles short synchronous reads while loading a disk archive", async () => {
			const source = new PizZip();
			const payload = Buffer.alloc(128 * 1024, 6);
			source.file("image.bin", payload);
			const archive = path.join(directory, "input.zip");
			fs.writeFileSync(
				archive,
				source.generate({ type: "nodebuffer", compression: "STORE" })
			);
			const originalRead = fs.readSync;
			try {
				fs.readSync = function (fd, buffer, offset, length, position) {
					return originalRead.call(
						this,
						fd,
						buffer,
						offset,
						Math.min(length, 17),
						position
					);
				};
				zip = new PizZip();
				zip.loadFile(archive, { checkCRC32: true });
			} finally {
				fs.readSync = originalRead;
			}
			const output = await collect(zip.generateNodeStream());
			assert.deepEqual(
				new PizZip(output).file("image.bin").asNodeBuffer(),
				payload
			);
		});

		it("handles short synchronous writes to filesystem storage", () => {
			const originalWrite = fs.writeSync;
			try {
				fs.writeSync = function (fd, buffer, offset, length, position) {
					return originalWrite.call(
						this,
						fd,
						buffer,
						offset,
						Math.min(length, 17),
						position
					);
				};
				zip = new PizZip(undefined, {
					storage: { type: "filesystem", directory },
				});
				zip.file("image.bin", Buffer.alloc(128 * 1024, 6));
			} finally {
				fs.writeSync = originalWrite;
			}
			assert.deepEqual(
				zip.file("image.bin").asNodeBuffer(),
				Buffer.alloc(128 * 1024, 6)
			);
		});

		it("rejects synchronous reads after disposal even if the fd is reused", () => {
			const source = new PizZip().file("data", "public");
			const archive = path.join(directory, "input.zip");
			fs.writeFileSync(archive, source.generate({ type: "nodebuffer" }));
			zip = new PizZip().loadFile(archive);
			const reader = [...zip._readers][0];
			zip.dispose();
			const fd = fs.openSync(archive, "r");
			const originalRead = fs.readSync;
			let reads = 0;
			try {
				// Model descriptor reuse deterministically on all platforms.
				reader.fd = fd;
				fs.readSync = (...args) => {
					reads++;
					return originalRead(...args);
				};
				assert.throws(() => zip.file("data").asText(), /disposed/);
				assert.throws(() => zip.generate({ type: "nodebuffer" }), /disposed/);
				assert.equal(reads, 0);
			} finally {
				fs.readSync = originalRead;
				fs.closeSync(fd);
			}
		});

		it("rejects entry ranges beyond disk input before spooling", () => {
			const source = new PizZip().file("data", "public");
			const data = source.generate({ type: "nodebuffer" });
			const central = data.indexOf(Buffer.from("504b0102", "hex"));
			data.writeUInt32LE(data.length + 100, central + 20);
			const archive = path.join(directory, "input.zip");
			fs.writeFileSync(archive, data);
			zip = new PizZip();
			assert.throws(() => zip.loadFile(archive), /Corrupted zip|End of data/);
			assert.equal(zip._readers.size, 0);
		});

		it("closes the archive descriptor if stat fails during construction", () => {
			const archive = path.join(directory, "input.zip");
			fs.writeFileSync(archive, Buffer.alloc(0));
			const originalStat = fs.fstatSync;
			let fd;
			try {
				fs.fstatSync = (opened) => {
					fd = opened;
					throw new Error("stat failed");
				};
				assert.throws(() => new PizZip().loadFile(archive), /stat failed/);
			} finally {
				fs.fstatSync = originalStat;
			}
			assert.throws(() => fs.fstatSync(fd), { code: "EBADF" });
		});

		it("removes temporary storage if opening the spool fails", () => {
			const originalOpen = fs.openSync;
			try {
				fs.openSync = () => {
					throw new Error("open failed");
				};
				assert.throws(
					() =>
						new PizZip(undefined, {
							storage: { type: "filesystem", directory },
						}),
					/open failed/
				);
			} finally {
				fs.openSync = originalOpen;
			}
			assert.deepEqual(fs.readdirSync(directory), []);
		});

		it("rejects synchronous reads of truncated backing files", () => {
			const archive = path.join(directory, "input.zip");
			fs.writeFileSync(
				archive,
				new PizZip().file("data", "public").generate({ type: "nodebuffer" })
			);
			zip = new PizZip().loadFile(archive);
			fs.truncateSync(archive, 0);
			assert.throws(() => zip.file("data").asText(), /unexpected end of file/);
			zip.dispose();
			zip = new PizZip(undefined, {
				storage: { type: "filesystem", directory },
			});
			zip.file("data", "public");
			fs.truncateSync(zip._storage.file, 0);
			assert.throws(() => zip.file("data").asText(), /unexpected end of file/);
		});

		it("streams the opened archive if the path is replaced after loadFile", async () => {
			const payload = Buffer.alloc(64 * 1024, 7);
			const source = new PizZip();
			source.file("image.bin", payload);
			const file = path.join(directory, "input.zip");
			fs.writeFileSync(
				file,
				source.generate({ type: "nodebuffer", compression: "STORE" })
			);
			zip = new PizZip();
			zip.loadFile(file, { checkCRC32: true });
			const replacement = new PizZip();
			replacement.file("image.bin", Buffer.alloc(64 * 1024, 9));
			const replacementFile = path.join(directory, "replacement.zip");
			fs.writeFileSync(
				replacementFile,
				replacement.generate({ type: "nodebuffer", compression: "STORE" })
			);
			fs.renameSync(replacementFile, file);
			const output = await collect(
				zip.generateNodeStream({ compression: "STORE" })
			);
			const result = new PizZip(output, { checkCRC32: true });
			assert.deepEqual(result.file("image.bin").asNodeBuffer(), payload);
		});

		it("streams disk-backed entries after the storage path is unlinked", async () => {
			zip = new PizZip(undefined, {
				storage: { type: "filesystem", directory },
			});
			zip.file("image.bin", Buffer.alloc(1024, 5));
			fs.unlinkSync(zip._storage.file);
			const output = await collect(
				zip.generateNodeStream({ compression: "DEFLATE" })
			);
			const result = new PizZip(output, { checkCRC32: true });
			assert.deepEqual(
				result.file("image.bin").asNodeBuffer(),
				Buffer.alloc(1024, 5)
			);
		});

		it("closes active disk streams when output is destroyed", async () => {
			zip = new PizZip(undefined, {
				storage: { type: "filesystem", directory },
				chunkSize: 64 * 1024,
			});
			zip.file("image.bin", Buffer.alloc(20 * 1024 * 1024, 5));
			const createReadStream = zip._storage.createReadStream;
			let closed;
			zip._storage.createReadStream = function (...args) {
				const input = createReadStream.apply(this, args);
				closed = new Promise((resolve) => input.once("close", resolve));
				return input;
			};
			const output = zip.generateNodeStream({ compression: "DEFLATE" });
			let chunks = 0;
			await new Promise((resolve, reject) => {
				output.on("data", () => {
					if (++chunks === 2) {
						output.destroy();
					}
				});
				output.on("error", reject);
				output.on("close", resolve);
			});
			assert.ok(closed);
			await closed;
		});

		it("propagates disk read errors through the output stream", async () => {
			zip = new PizZip(undefined, {
				storage: { type: "filesystem", directory },
			});
			zip.file("image.bin", Buffer.alloc(1024, 5));
			const createReadStream = zip._storage.createReadStream;
			zip._storage.createReadStream = function (...args) {
				const input = createReadStream.apply(this, args);
				process.nextTick(() =>
					input.destroy(new Error("EIO: disk read failed"))
				);
				return input;
			};
			await assert.rejects(
				collect(zip.generateNodeStream({ compression: "DEFLATE" })),
				/disk read failed/
			);
		});
	});

	it("validates chunkSize before opening storage or generating output", () => {
		for (const chunkSize of [0, -1, 63, 1.5, NaN, Infinity, "1024", null]) {
			assert.throws(() => new PizZip(undefined, { chunkSize }), /chunkSize/);
			assert.throws(
				() => new PizZip().generateNodeStream({ chunkSize }),
				/chunkSize/
			);
		}
	});

	it("limits output writes for a large STORE entry to 1 MiB", async () => {
		const zip = new PizZip();
		const image = Buffer.alloc(20 * 1024 * 1024, 3);
		zip.file("image.bin", image);
		const chunks = [];
		const stream = zip.generateNodeStream();
		await new Promise((resolve, reject) => {
			stream.on("data", (chunk) => {
				chunks.push(chunk);
				stream.pause();
				setImmediate(() => stream.resume());
			});
			stream.on("error", reject);
			stream.on("end", resolve);
		});
		assert.ok(chunks.every((chunk) => chunk.length <= 1024 * 1024));
		const result = new PizZip(Buffer.concat(chunks), { checkCRC32: true });
		assert.deepEqual(result.file("image.bin").asNodeBuffer(), image);
	});

	it("creates a valid DEFLATE archive without a final output buffer", async () => {
		const zip = new PizZip();
		zip.file("word/document.xml", "<w:document>hello</w:document>");
		zip.file("word/media/image.jpg", Buffer.alloc(128 * 1024, 3));
		const output = await collect(
			zip.generateNodeStream({ compression: "DEFLATE" })
		);
		const result = new PizZip(output, { checkCRC32: true });

		assert.equal(
			result.file("word/document.xml").asText(),
			"<w:document>hello</w:document>"
		);
		assert.deepEqual(
			result.file("word/media/image.jpg").asNodeBuffer(),
			Buffer.alloc(128 * 1024, 3)
		);
	});

	it("reuses loaded compressed entries when the requested method matches", async () => {
		const source = new PizZip();
		source.file("content.xml", "hello".repeat(10_000));
		const loaded = new PizZip(
			source.generate({ compression: "DEFLATE", type: "nodebuffer" })
		);
		const original = loaded.files["content.xml"]._data.getCompressedContent();
		const output = await collect(
			loaded.generateNodeStream({ compression: "DEFLATE" })
		);
		const result = new PizZip(output);

		assert.equal(result.file("content.xml").asText(), "hello".repeat(10_000));
		assert.equal(
			result.files["content.xml"]._data.getCompressedContent().length,
			original.length
		);
		assert.doesNotThrow(() => new PizZip(output, { checkCRC32: true }));
	});

	it("stops inflation before forwarding data beyond its declared size", async () => {
		const source = new PizZip().file("data", "x".repeat(1024 * 1024));
		const data = source.generate({
			type: "nodebuffer",
			compression: "DEFLATE",
		});
		const central = data.indexOf(Buffer.from("504b0102", "hex"));
		data.writeUInt32LE(1, central + 24);
		const zip = new PizZip(data);
		const output = zip.generateNodeStream({
			compression: "STORE",
			chunkSize: 1024,
		});
		let emitted = 0;
		output.on("data", (chunk) => {
			emitted += chunk.length;
		});
		await assert.rejects(collect(output), /uncompressed data size mismatch/);
		assert.ok(emitted < 1024, "only the local header should escape");
	});

	it("ignores zlib-only compression options that produce invalid ZIP data", async () => {
		const zip = new PizZip().file("data", "hello".repeat(1000));
		const output = await collect(
			zip.generateNodeStream({
				compression: "DEFLATE",
				compressionOptions: { level: 6, finishFlush: 2 },
			})
		);
		const loaded = new PizZip(output);
		const compressed = loaded.files.data._data.getCompressedContent();
		assert.equal(
			require("node:zlib").inflateRawSync(compressed).toString(),
			"hello".repeat(1000)
		);
	});

	it("honors the same fileOrder callback contract as generate", async () => {
		const zip = new PizZip();
		zip.file("docProps/core.xml", "core");
		zip.file("word/document.xml", "document");
		zip.file("[Content_Types].xml", "types");
		const output = await collect(
			zip.generateNodeStream({
				fileOrder(files) {
					return [
						"[Content_Types].xml",
						"word/document.xml",
						...Object.keys(files),
					];
				},
			})
		);
		const result = new PizZip(output);

		assert.deepEqual(Object.keys(result.files), [
			"[Content_Types].xml",
			"word/document.xml",
			"docProps/core.xml",
		]);
	});

	it("writes an archive from a rooted folder", async () => {
		const zip = new PizZip();
		zip.folder("nested").file("example.txt", "example");

		const output = await collect(zip.folder("nested").generateNodeStream());
		const result = new PizZip(output);

		assert.equal(result.file("nested/example.txt").asText(), "example");
	});
});
