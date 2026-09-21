"use strict";

module.exports = function fileOrder(files, order) {
	if (typeof order === "function") {
		return order(files);
	}
	const names = Object.keys(files);
	if (!Array.isArray(order)) {
		return names;
	}
	return [...order, ...names.filter((name) => !order.includes(name))];
};
