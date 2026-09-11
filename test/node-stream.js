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

		it("rejects corrupted disk input during incremental checksum validation", () => {
			const source = new PizZip();
			source.file("image.bin", "image content");
			const archive = source.generate({ type: "nodebuffer" });
			archive[30 + Buffer.byteLength("image.bin")] ^= 1;
			const file = path.join(directory, "bad.zip");
			fs.writeFileSync(file, archive);
			zip = new PizZip();
			assert.throws(
				() => zip.loadFile(file, { checkCRC32: true }),
				/CRC32 mismatch/
			);
			assert.equal(zip._readers.size, 0);
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
			fs.unlinkSync(zip._storage.file);
			await assert.rejects(
				collect(zip.generateNodeStream({ compression: "DEFLATE" })),
				/ENOENT/
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
