var fs = require("fs");

global.PizZip = require("../lib/index");

global.PizZipTestUtils = {
    loadZipFile: function(name, callback) {
        fs.readFile(name, "binary", callback);
    }
};
