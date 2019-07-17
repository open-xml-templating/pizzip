const fs = require("fs");

global.PizZip = require("../es6/index");

global.PizZipTestUtils = {
	loadZipFile(name, callback) {
		fs.readFile(name, "binary", callback);
	},
};
