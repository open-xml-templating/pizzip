"use strict";

const PizZipUtils = {};
// just use the responseText with xhr1, response with xhr2.
// The transformation doesn't throw away high-order byte (with responseText)
// because PizZip handles that case. If not used with PizZip, you may need to
// do it, see https://developer.mozilla.org/En/Using_XMLHttpRequest#Handling_binary_data
PizZipUtils._getBinaryFromXHR = function (xhr) {
	// for xhr.responseText, the 0xFF mask is applied by PizZip
	return xhr.response || xhr.responseText;
};

// taken from jQuery
function createStandardXHR() {
	try {
		return new window.XMLHttpRequest();
	} catch (e) {}
}

function createActiveXHR() {
	try {
		return new window.ActiveXObject("Microsoft.XMLHTTP");
	} catch (e) {}
}

// Create the request object
const createXHR = window.ActiveXObject
	? /* Microsoft failed to properly
		 * implement the XMLHttpRequest in IE7 (can't request local files),
		 * so we use the ActiveXObject when it is available
		 * Additionally XMLHttpRequest can be disabled in IE7/IE8 so
		 * we need a fallback.
		 */
		function () {
			return createStandardXHR() || createActiveXHR();
		}
	: // For all other browsers, use the standard XMLHttpRequest object
		createStandardXHR;

function isFileProtocol(path) {
	return (
		path.startsWith("file://") ||
		(typeof window !== "undefined" && window.location.protocol === "file:")
	);
}

PizZipUtils.getBinaryContent = function (path, callback) {
	/*
	 * Here is the tricky part : getting the data.
	 * In firefox/chrome/opera/... setting the mimeType to 'text/plain; charset=x-user-defined'
	 * is enough, the result is in the standard xhr.responseText.
	 * cf https://developer.mozilla.org/En/XMLHttpRequest/Using_XMLHttpRequest#Receiving_binary_data_in_older_browsers
	 * In IE <= 9, we must use (the IE only) attribute responseBody
	 * (for binary data, its content is different from responseText).
	 * In IE 10, the 'charset=x-user-defined' trick doesn't work, only the
	 * responseType will work :
	 * http://msdn.microsoft.com/en-us/library/ie/hh673569%28v=vs.85%29.aspx#Binary_Object_upload_and_download
	 *
	 * I'd like to use jQuery to avoid this XHR madness, but it doesn't support
	 * the responseType attribute : http://bugs.jquery.com/ticket/11461
	 */
	try {
		const xhr = createXHR();

		xhr.open("GET", path, true);
		const isLocalFile = isFileProtocol(path);

		// recent browsers
		if ("responseType" in xhr) {
			xhr.responseType = "arraybuffer";
		}

		// older browser
		if (xhr.overrideMimeType) {
			xhr.overrideMimeType("text/plain; charset=x-user-defined");
		}

		xhr.onreadystatechange = function (evt) {
			let file, err;
			// use `xhr` and not `this`... thanks IE
			if (xhr.readyState === 4) {
				if (xhr.status === 200 || (isLocalFile && xhr.status === 0)) {
					try {
						const file = PizZipUtils._getBinaryFromXHR(xhr);
						callback(null, file);
					} catch (e) {
						callback(new Error(e), null);
					}
				} else {
					const errorDescription =
						xhr.status === 0
							? "Server not responding or CORS headers missing. "
							: "";
					callback(
						new Error(
							`Ajax error for ${path}: status ${xhr.status} ${errorDescription}${xhr.statusText}`
						),
						null
					);
				}
			}
		};

		xhr.send();
	} catch (e) {
		callback(new Error(e), null);
	}
};

module.exports = PizZipUtils;
