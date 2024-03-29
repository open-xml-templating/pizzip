/* global IEBinaryToArray_ByteStr, IEBinaryToArray_ByteStr_Last */
"use strict";

// Adapted from http://stackoverflow.com/questions/1095102/how-do-i-load-binary-image-data-using-javascript-and-xmlhttprequest
const IEBinaryToArray_ByteStr_Script =
	"<!-- IEBinaryToArray_ByteStr -->\r\n" +
	"<script type='text/vbscript'>\r\n" +
	"Function IEBinaryToArray_ByteStr(Binary)\r\n" +
	"   IEBinaryToArray_ByteStr = CStr(Binary)\r\n" +
	"End Function\r\n" +
	"Function IEBinaryToArray_ByteStr_Last(Binary)\r\n" +
	"   Dim lastIndex\r\n" +
	"   lastIndex = LenB(Binary)\r\n" +
	"   if lastIndex mod 2 Then\r\n" +
	"       IEBinaryToArray_ByteStr_Last = Chr( AscB( MidB( Binary, lastIndex, 1 ) ) )\r\n" +
	"   Else\r\n" +
	"       IEBinaryToArray_ByteStr_Last = " +
	'""' +
	"\r\n" +
	"   End If\r\n" +
	"End Function\r\n" +
	"</script>\r\n";

// inject VBScript
document.write(IEBinaryToArray_ByteStr_Script);

global.PizZipUtils._getBinaryFromXHR = function (xhr) {
	const binary = xhr.responseBody;
	const byteMapping = {};
	for (let i = 0; i < 256; i++) {
		for (let j = 0; j < 256; j++) {
			byteMapping[String.fromCharCode(i + (j << 8))] =
				String.fromCharCode(i) + String.fromCharCode(j);
		}
	}
	const rawBytes = IEBinaryToArray_ByteStr(binary);
	const lastChr = IEBinaryToArray_ByteStr_Last(binary);
	return (
		rawBytes.replace(/[\s\S]/g, function (match) {
			return byteMapping[match];
		}) + lastChr
	);
};
