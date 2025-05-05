"use strict";
exports.base64 = true;
exports.array = true;
exports.string = true;
exports.arraybuffer =
	typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined";
// contains true if PizZip can read/generate nodejs Buffer, false otherwise.
// Browserify will provide a Buffer implementation for browsers, which is
// an augmented Uint8Array (i.e., can be used as either Buffer or U8).
exports.nodebuffer = typeof Buffer !== "undefined";
// contains true if PizZip can read/generate Uint8Array, false otherwise.
exports.uint8array = typeof Uint8Array !== "undefined";

if (typeof ArrayBuffer === "undefined") {
	exports.blob = false;
} else {
	const buffer = new ArrayBuffer(0);
	try {
		exports.blob =
			new Blob([buffer], {
				type: "application/zip",
			}).size === 0;
	} catch {
		try {
			const Builder =
				window.BlobBuilder ||
				window.WebKitBlobBuilder ||
				window.MozBlobBuilder ||
				window.MSBlobBuilder;
			const builder = new Builder();
			builder.append(buffer);
			exports.blob = builder.getBlob("application/zip").size === 0;
		} catch {
			exports.blob = false;
		}
	}
}
