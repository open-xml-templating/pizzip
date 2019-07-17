const PizZipTestUtils = {
    loadZipFile (name, callback) {
        PizZipUtils.getBinaryContent(name + "?_=" + (new Date()).getTime(), callback);
    },
};
