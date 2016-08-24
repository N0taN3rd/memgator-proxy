#!/usr/bin/env bash
here=$(pwd)

if [[ "$1" == "build" ]]; then
    cd mongodocker
    docker build -t jberlin/mongodb .
else
    echo run
    state=$(docker inspect --format "{{.State.Running}}" mongo-memprox 2>/dev/null)
    if [[ "$state" == "false" ]]; then
        docker rm mongo-memprox
    fi
    docker run --name mongo-memprox -d \
        -p 27017:27017 \
        -v ${here}/mongodocker/data/db:/data/db \
        -v ${here}/mongodocker/data/configdb:/data/configdb \
        jberlin/mongodb
fi





