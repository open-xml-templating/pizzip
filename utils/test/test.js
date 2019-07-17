"use strict";

/**
 * This is an helper function to transform the input into a binary string.
 * The transformation is normaly handled by PizZip.
 * @param {String|ArrayBuffer} input the input to convert.
 * @return {String} the binary string.
 */
function toString(input) {
  let result = "",
    i,
    len,
    isArray = typeof input !== "string";

  if (isArray) {
    input = new Uint8Array(input);
  }

  for (i = 0, len = input.length; i < len; i++) {
    result += String.fromCharCode(
      (isArray ? input[i] : input.charCodeAt(i)) % 0xff
    );
  }

  return result;
}

test("PizZipUtils.getBinaryContent, text, 200 OK", function() {
  stop();
  PizZipUtils.getBinaryContent("ref/amount.txt", function(err, data) {
    equal(err, null, "no error");
    equal(
      toString(data),
      "\xe2\x82\xac\x31\x35\x0a",
      "The content has been fetched"
    );
    start();
  });
});

test("PizZipUtils.getBinaryContent, image, 200 OK", function() {
  stop();
  PizZipUtils.getBinaryContent("ref/smile.gif", function(err, data) {
    equal(err, null, "no error");
    equal(
      toString(data).indexOf("\x47\x49\x46\x38\x37\x61"),
      0,
      "The content has been fetched"
    );
    start();
  });
});

test("PizZipUtils.getBinaryContent, 404 NOT FOUND", function() {
  stop();
  PizZipUtils.getBinaryContent("ref/nothing", function(err, data) {
    equal(data, null, "no error");
    ok(err instanceof Error, "The error is an Error");
    start();
  });
});
