var PizZipTestUtils = {
    loadZipFile : function (name, callback) {
        PizZipUtils.getBinaryContent(name + "?_=" + ( new Date() ).getTime(), callback);
    }
};
