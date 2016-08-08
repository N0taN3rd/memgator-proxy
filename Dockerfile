FROM node:6.3.1-wheezy
MAINTAINER John Berlin <jberlin@cs.odu.edu>

ADD . /usr/memproxy
WORKDIR /usr/memproxy
RUN npm install

# /Users/jberlin/node-v6.3.0-darwin-x64/bin/node --harmony /Users/jberlin/WebstormProjects/memproxy/node_modules/gulp/bin/gulp.js --color --gulpfile /Users/jberlin/WebstormProjects/memproxy/gulpfile.babel.js build


RUN node --harmony node_modules/gulp/bin/gulp.js --color --gulpfile gulpfile.babel.js build

RUN node bin/memgatorProxy.js --host --port