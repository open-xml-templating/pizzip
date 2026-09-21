"use strict";
/* eslint-disable no-console */

// Run with `node test/node-stream-rss.js`. The parent intentionally measures
// its child with ps so the reported value matches production monitoring.
const { execFile } = require("node:child_process");
const { mkdtemp, rm } = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const { pipeline } = require("node:stream/promises");
const os = require("node:os");
const path = require("node:path");
const { randomFillSync } = require("node:crypto");
const PizZip = require("../es6/index.js");

const MIB = 1024 * 1024;
const SMALL_FILE_COUNT = 100;
const SMALL_FILE_SIZE = 2 * MIB;
const LARGE_FILE_SIZE = 200 * MIB;
const CHUNK_SIZE = 64 * 1024;

function psRss(pid) {
	return new Promise((resolve, reject) => {
		execFile("ps", ["-p", String(pid), "-o", "rss="], (error, stdout) => {
			if (error) {
				reject(error);
				return;
			}
			resolve(Number.parseInt(stdout, 10) * 1024);
		});
	});
}

function childRss() {
	return process.memoryUsage().rss;
}

async function worker() {
	const directory = await mkdtemp(path.join(os.tmpdir(), "pizzip-rss-"));
	const output = path.join(directory, "archive.zip");
	let zip;
	try {
		zip = new PizZip(undefined, {
			chunkSize: CHUNK_SIZE,
			storage: {
				type: "filesystem",
				directory,
				// The 200 MiB entry and 50 small entries are disk-backed. The
				// remaining 50 small entries intentionally stay in memory.
				filter(name) {
					return name === "large.bin" || Number(name.slice(6, 9)) % 2 === 0;
				},
			},
		});

		for (let index = 0; index < SMALL_FILE_COUNT; index++) {
			const data = Buffer.allocUnsafe(SMALL_FILE_SIZE);
			randomFillSync(data);
			zip.file(`small-${String(index).padStart(3, "0")}.bin`, data);
		}
		const large = Buffer.allocUnsafe(LARGE_FILE_SIZE);
		randomFillSync(large);
		zip.file("large.bin", large);

		if (global.gc) {
			global.gc();
		}
		const rssBeforeOutput = childRss();
		let peakRss = rssBeforeOutput;
		const sampler = setInterval(() => {
			peakRss = Math.max(peakRss, childRss());
		}, 5);
		try {
			await pipeline(
				zip.generateNodeStream({
					compression: "DEFLATE",
					chunkSize: CHUNK_SIZE,
				}),
				createWriteStream(output)
			);
		} finally {
			clearInterval(sampler);
		}
		process.send({
			peakRss,
			rssBeforeOutput,
			outputSize: require("node:fs").statSync(output).size,
		});
	} finally {
		if (zip) {
			zip.dispose();
		}
		await rm(directory, { recursive: true, force: true });
	}
}

async function parent() {
	const child = require("node:child_process").fork(__filename, ["--worker"], {
		execArgv: ["--expose-gc"],
		silent: true,
	});
	let peakPsRss = 0;
	let result;
	const sampler = setInterval(async () => {
		try {
			peakPsRss = Math.max(peakPsRss, await psRss(child.pid));
		} catch {
			// ps fails once the child has exited.
		}
	}, 10);
	child.on("message", (message) => {
		result = message;
	});
	child.stderr.pipe(process.stderr);
	await new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("exit", (code) =>
			code === 0 ? resolve() : reject(new Error(`worker exited with ${code}`))
		);
	});
	clearInterval(sampler);
	console.log(
		JSON.stringify(
			{
				archiveMiB: result.outputSize / MIB,
				childPeakMiB: result.peakRss / MIB,
				psPeakMiB: peakPsRss / MIB,
				rssBeforeOutputMiB: result.rssBeforeOutput / MIB,
			},
			null,
			2
		)
	);
}

if (process.argv.includes("--worker")) {
	worker().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
} else {
	parent().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
