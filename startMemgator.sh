#!/usr/bin/env bash

here=$(pwd)
echo ${here}/archives.json server
./memgator -p 9000 --arcs=${here}/archives.json server