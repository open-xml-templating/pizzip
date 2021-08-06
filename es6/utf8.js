"use strict";

const utils = require("./utils.js");
const support = require("./support.js");
const nodeBuffer = require("./nodeBuffer.js");

/**
 * The following functions come from pako, from pako/lib/utils/strings
 * released under the MIT license, see pako https://github.com/nodeca/pako/
 */

// Table with utf8 lengths (calculated by first byte of sequence)
// Note, that 5 & 6-byte values and some 4-byte values can not be represented in JS,
// because max possible codepoint is 0x10ffff
const _utf8len = new Array(256);
for (let i = 0; i < 256; i++) {
	_utf8len[i] =
		i >= 252
			? 6
			: i >= 248
			? 5
			: i >= 240
			? 4
			: i >= 224
			? 3
			: i >= 192
			? 2
			: 1;
}
_utf8len[254] = _utf8len[254] = 1; // Invalid sequence start

// convert string to array (typed, when possible)
function string2buf(str) {
	let buf,
		c,
		c2,
		mPos,
		i,
		bufLen = 0;

	const strLen = str.length;

	// count binary size
	for (mPos = 0; mPos < strLen; mPos++) {
		c = str.charCodeAt(mPos);
		if ((c & 0xfc00) === 0xd800 && mPos + 1 < strLen) {
			c2 = str.charCodeAt(mPos + 1);
			if ((c2 & 0xfc00) === 0xdc00) {
				c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
				mPos++;
			}
		}
		bufLen += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
	}

	// allocate buffer
	if (support.uint8array) {
		buf = new Uint8Array(bufLen);
	} else {
		buf = new Array(bufLen);
	}

	// convert
	for (i = 0, mPos = 0; i < bufLen; mPos++) {
		c = str.charCodeAt(mPos);
		if ((c & 0xfc00) === 0xd800 && mPos + 1 < strLen) {
			c2 = str.charCodeAt(mPos + 1);
			if ((c2 & 0xfc00) === 0xdc00) {
				c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
				mPos++;
			}
		}
		if (c < 0x80) {
			/* one byte */
			buf[i++] = c;
		} else if (c < 0x800) {
			/* two bytes */
			buf[i++] = 0xc0 | (c >>> 6);
			buf[i++] = 0x80 | (c & 0x3f);
		} else if (c < 0x10000) {
			/* three bytes */
			buf[i++] = 0xe0 | (c >>> 12);
			buf[i++] = 0x80 | ((c >>> 6) & 0x3f);
			buf[i++] = 0x80 | (c & 0x3f);
		} else {
			/* four bytes */
			buf[i++] = 0xf0 | (c >>> 18);
			buf[i++] = 0x80 | ((c >>> 12) & 0x3f);
			buf[i++] = 0x80 | ((c >>> 6) & 0x3f);
			buf[i++] = 0x80 | (c & 0x3f);
		}
	}

	return buf;
}

// Calculate max possible position in utf8 buffer,
// that will not break sequence. If that's not possible
// - (very small limits) return max size as is.
//
// buf[] - utf8 bytes array
// max   - length limit (mandatory);
function utf8border(buf, max) {
	let pos;

	max = max || buf.length;
	if (max > buf.length) {
		max = buf.length;
	}

	// go back from last position, until start of sequence found
	pos = max - 1;
	while (pos >= 0 && (buf[pos] & 0xc0) === 0x80) {
		pos--;
	}

	// Fuckup - very small and broken sequence,
	// return max, because we should return something anyway.
	if (pos < 0) {
		return max;
	}

	// If we came to start of buffer - that means vuffer is too small,
	// return max too.
	if (pos === 0) {
		return max;
	}

	return pos + _utf8len[buf[pos]] > max ? pos : max;
}

// convert array to string
function buf2string(buf) {
	let i, out, c, cLen;
	const len = buf.length;

	// Reserve max possible length (2 words per char)
	// NB: by unknown reasons, Array is significantly faster for
	//     String.fromCharCode.apply than Uint16Array.
	let utf16buf = new Array(len * 2);

	for (out = 0, i = 0; i < len; ) {
		c = buf[i++];
		// quick process ascii
		if (c < 0x80) {
			utf16buf[out++] = c;
			continue;
		}

		cLen = _utf8len[c];
		// skip 5 & 6 byte codes
		if (cLen > 4) {
			utf16buf[out++] = 0xfffd;
			i += cLen - 1;
			continue;
		}

		// apply mask on first byte
		c &= cLen === 2 ? 0x1f : cLen === 3 ? 0x0f : 0x07;
		// join the rest
		while (cLen > 1 && i < len) {
			c = (c << 6) | (buf[i++] & 0x3f);
			cLen--;
		}

		// terminated by end of string?
		if (cLen > 1) {
			utf16buf[out++] = 0xfffd;
			continue;
		}

		if (c < 0x10000) {
			utf16buf[out++] = c;
		} else {
			c -= 0x10000;
			utf16buf[out++] = 0xd800 | ((c >> 10) & 0x3ff);
			utf16buf[out++] = 0xdc00 | (c & 0x3ff);
		}
	}

	// shrinkBuf(utf16buf, out)
	if (utf16buf.length !== out) {
		if (utf16buf.subarray) {
			utf16buf = utf16buf.subarray(0, out);
		} else {
			utf16buf.length = out;
		}
	}

	// return String.fromCharCode.apply(null, utf16buf);
	return utils.applyFromCharCode(utf16buf);
}

// That's all for the pako functions.

/**
 * Transform a javascript string into an array (typed if possible) of bytes,
 * UTF-8 encoded.
 * @param {String} str the string to encode
 * @return {Array|Uint8Array|Buffer} the UTF-8 encoded string.
 */
exports.utf8encode = function utf8encode(str) {
	if (support.nodebuffer) {
		return nodeBuffer(str, "utf-8");
	}

	return string2buf(str);
};

/**
 * Transform a bytes array (or a representation) representing an UTF-8 encoded
 * string into a javascript string.
 * @param {Array|Uint8Array|Buffer} buf the data de decode
 * @return {String} the decoded string.
 */
exports.utf8decode = function utf8decode(buf) {
	if (support.nodebuffer) {
		return utils.transformTo("nodebuffer", buf).toString("utf-8");
	}

	buf = utils.transformTo(support.uint8array ? "uint8array" : "array", buf);

	// return buf2string(buf);
	// Chrome prefers to work with "small" chunks of data
	// for the method buf2string.
	// Firefox and Chrome has their own shortcut, IE doesn't seem to really care.
	const result = [],
		len = buf.length,
		chunk = 65536;
	let k = 0;
	while (k < len) {
		const nextBoundary = utf8border(buf, Math.min(k + chunk, len));
		if (support.uint8array) {
			result.push(buf2string(buf.subarray(k, nextBoundary)));
		} else {
			result.push(buf2string(buf.slice(k, nextBoundary)));
		}
		k = nextBoundary;
	}
	return result.join("");
};
