"use strict";

module.exports = function chunkSize(value, fallback = 1024 * 1024) {
	const size = value === undefined ? fallback : value;
	if (!Number.isSafeInteger(size) || size < 64 || size > 0x7fffffff) {
		throw new RangeError(
			"chunkSize must be an integer between 64 and 2147483647 bytes"
		);
	}
	return size;
};
