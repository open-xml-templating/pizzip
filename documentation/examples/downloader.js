jQuery(function ($) {
    "use strict";

    /**
     * Reset the message.
     */
    function resetMessage () {
        $("#result")
        .removeClass()
        .text("");
    }
    /**
     * show a successful message.
     * @param {String} text the text to show.
     */
    function showMessage(text) {
        resetMessage();
        $("#result")
        .addClass("alert alert-success")
        .text(text);
    }
    /**
     * show an error message.
     * @param {String} text the text to show.
     */
    function showError(text) {
        resetMessage();
        $("#result")
        .addClass("alert alert-danger")
        .text(text);
    }

    /**
     * Fetch the content, add it to the PizZip object
     * and use a jQuery deferred to hold the result.
     * @param {String} url the url of the content to fetch.
     * @param {String} filename the filename to use in the PizZip object.
     * @param {PizZip} zip the PizZip instance.
     * @return {jQuery.Deferred} the deferred containing the data.
     */
    function deferredAddZip(url, filename, zip) {
        const deferred = $.Deferred();
        PizZipUtils.getBinaryContent(url, function (err, data) {
            if(err) {
                deferred.reject(err);
            } else {
                zip.file(filename, data, {binary: true});
                deferred.resolve(data);
            }
        });
        return deferred;
    }

    if(!PizZip.support.blob) {
        showError("This demo works only with a recent browser !");
        return;
    }

    const $form = $("#download_form").on("submit", function () {
        resetMessage();

        const zip = new PizZip();
        const deferreds = [];

        // find every checked item
        $(this).find(":checked").each(function () {
            const $this = $(this);
            const url = $this.data("url");
            const filename = url.replace(/.*\//g, "");
            deferreds.push(deferredAddZip(url, filename, zip));
        });

        // when everything has been downloaded, we can trigger the dl
        $.when.apply($, deferreds).done(function () {
            const blob = zip.generate({type: "blob"});

            // see FileSaver.js
            saveAs(blob, "example.zip");

            showMessage("done !");
        }).fail(function (err) {
            showError(err);
        });
        return false;
    });
});

