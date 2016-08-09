import http from 'http'
import proxy from 'express-http-proxy'
import express from 'express'
import S from 'string'
import md5 from 'md5'
import path from 'path'
import fs from 'fs-extra'
import moment from 'moment'
import winston from 'winston'
import Datastore from 'nedb'
import timeout from 'connect-timeout'
require('pretty-error').start()
require('http-shutdown').extend()


function haltOnTimedout(req, res, next){
  if (!req.timedout) next()
}
let app = express()
app.use(timeout('300s'))
app.use(haltOnTimedout)

let db = new Datastore({
  filename: path.join('data/dbs', 'url-hash-count.db'),
  autoload: true
})

db.persistence.setAutocompactionInterval(300000)

console.log(argv)

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.File)({
      name: 'info-file',
      filename: 'data/logs/infos.log',
      level: 'info'
    }),
    new (winston.transports.File)({
      name: 'error-file',
      filename: 'data/logs/errors.log',
      level: 'error'
    }),
    new (winston.transports.Console)()
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: 'data/logs/exceptions.log',
      handleExceptions: true,
      humanReadableUnhandledException: true
    })
  ]
})

logger.exitOnError = false

const pathRE = new RegExp('/timemap/(?:(?:json)|(?:link)|(?:cdxj))/(.+)')

//memgator port 80,
//'http://localhost:9000'

let upstream = 'http://memgator.cs.odu.edu:1209'
let port = 8008

console.log(`Starting the memgator proxy for upstream[${upstream}] listening on port[${port}]`)

app.all('*', proxy(upstream, {
  intercept(rsp, data, req, res, callback) {
    console.log('intercept')
    res.setHeader('Via', 'ws-dl memgator proxy')
    callback(null, data)
    let statusCode = rsp.statusCode
    console.log(req.url)
    let urlT = S(req.url)
    if (urlT.startsWith('/timemap') && req.method === 'GET') {
      let now = moment().format('YYYYMMDDHHmmss')
      let urlO = pathRE.exec(urlT.s)
      let hash = md5(urlO[ 1 ])
      console.log(urlO[ 1 ])
      let memcount = rsp.headers[ 'x-memento-count' ]
      logger.info(`got timemap request url:count, ${urlO[ 1 ]}:${memcount}`)
      var fileType
      switch (rsp.headers[ 'content-type' ]) {
        case 'application/json':
          fileType = 'json'
          break
        case 'application/link-format':
          fileType = 'link'
          break
        case 'application/cdxj+ors':
          fileType = 'cdxj'
          break
        default:
          fileType = 'txt'
      }
      let path = `data/timemaps/${hash}/${statusCode}`
      fs.ensureDir(path, error => {
        if (error) {
          logger.error(`ensuring dir timemap error for hash[${hash}] %s`, error)
        } else {
          fs.writeFile(`${path}/${now}-timemap.${fileType}`, data, 'utf8', err => {
            if (err) {
              logger.error(`writting timemap error for hash[${hash}] %s`, err)
            }
          })
        }
      })
      let url = urlO[ 1 ]
      let id = { url }
      db.find(id, (errFind, docs) => {
          if (errFind) {
            logger.error('finding url[%s] failed %s', url, errFind)
          } else {
            if (docs.length === 0) {
              console.log('docs.length is zero inserting new document')
              let insertMe = {
                url,
                hash,
                mementoCount: [ { count: memcount, date: now } ],
              }
              db.insert(insertMe, (insertError, newDoc) => {
                if (insertError) {
                  logger.error('inserting new url[%s] failed %s', url, errFind)
                } else {
                  console.log('insert worked ', newDoc)
                }
              })
            } else {
              let update = {
                $push: {
                  mementoCount: { count: memcount, date: now }
                }
              }
              db.update(id, update, { upsert: false }, (errUpdate, numAffected, affectedDocuments, upsert) => {
                if (errUpdate) {
                  logger.error('updating mementocount timemap for url[%s] failed %s', url, errFind)
                } else {
                  console.log('updating db worked ', numAffected, affectedDocuments)
                }
              })
            }
          }
        }
      )
    }
  },
  preserveHostHdr: true
}))

//http://memgator.cs.odu.edu:1208 --p 8008

let proxyS = http.createServer(app).withShutdown()
proxyS.listen(port)

process.on('SIGTERM', () => {
  console.log('Stopping proxy server')
  proxyS.shutdown(() => {
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Stopping proxy server')
  proxyS.shutdown(() => {
    process.exit(0)
  })
})
