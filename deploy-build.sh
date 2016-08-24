#!/usr/bin/env bash
here=$(pwd)

docker build -t jberlin/memgator-proxy .

cd mongodocker
docker build -t jberlin/mongodb .

