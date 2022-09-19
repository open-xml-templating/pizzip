import PizZipUtils from "./index.js";
import { expectType, expectError } from "tsd";

const url = "https://www.google.com/content.png";

PizZipUtils.getBinaryContent(url, function (err: Error, data: string) {
    if (err) {
        console.log(err.message);
        console.log(err.stack);
    }
    console.log(data.length);
    expectType<string>(data);
});

expectError(PizZipUtils.getFooBar());
