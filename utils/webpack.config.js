const path = require("path");
/* eslint-disable no-process-env */
const min = process.env.MIN === "true";
const IE = process.env.IE === "true";

const outputFilename = `pizzip-utils${IE ? "-ie" : ""}.${min ? "min." : ""}js`;

const outputPath = path.resolve(__dirname, "dist");
console.log(outputPath);
const entry = `./es6/index${IE ? "_IE" : ""}.js`;

const output = {
	path: outputPath,
	filename: outputFilename,
};

if (!IE) {
	output.library = "PizZipUtils";
	output.libraryTarget = "window";
}
console.log(output);

module.exports = {
	entry,
	output,
	module: {
		rules: [
			{
				test: [/\.js$/],
				exclude: [/node_modules/],
				loader: "babel-loader",
			},
		],
	},
	mode: min ? "production" : "development",
	optimization: {
		minimize: min,
	},
};
