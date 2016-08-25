FROM node:6.3.1-wheezy
MAINTAINER John Berlin <n0tan3rd@gmail.com>

ADD . /usr/memproxy
RUN chmod a+wrx /usr/memproxy
WORKDIR /usr/memproxy
RUN npm install

# /Users/jberlin/node-v6.3.0-darwin-x64/bin/node --harmony /Users/jberlin/WebstormProjects/memproxy/node_modules/gulp/bin/gulp.js --color --gulpfile /Users/jberlin/WebstormProjects/memproxy/gulpfile.babel.js build


RUN node --harmony node_modules/gulp/bin/gulp.js --color --gulpfile gulpfile.babel.js build

CMD node bin/memgatorProxy
