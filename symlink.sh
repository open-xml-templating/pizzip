#!/usr/bin/env sh

if [ -h utils/node_modules ]
then
	exit 0
fi
ln -s "$PWD/node_modules" utils/node_modules
