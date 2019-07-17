const path = require("path");
/* eslint-disable no-process-env */
const min = process.env.MIN === "true";
const outputFilename = `pizzip.${min ? "min." : ""}js`;

const outputPath = path.resolve(__dirname, "dist");
const entry = "./es6/index.js";

module.exports = {
	entry,
	output: {
		path: outputPath,
		filename: outputFilename,
		library: "PizZip",
		libraryTarget: "window",
	},
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
