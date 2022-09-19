import PizZip from "./index.js";
import { expectType, expectError } from "tsd";

const zip = new PizZip();

zip.file(
    "smile.gif",
    "R0lGODdhBQAFAIACAAAAAP/eACwAAAAABQAFAAACCIwPkWerClIBADs=",
    { base64: true }
);

expectError(zip.foo(
    "xxx"
));

var zip3 = new PizZip();
expectError(zip3.load());

var zip2 = new PizZip();
zip2.load("foobar");

const output = zip.generate({
    type: "blob",
    mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
});

expectError(zip.generate({optionXYZ: true}));
