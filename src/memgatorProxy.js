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
import tar from 'tar.gz'
import Promise from 'bluebird'
import schedule from 'node-schedule'
require('http-shutdown').extend()

/// 0 0 0 1/1 * ? *

// 0 0 * * * node wrapUp.js >/dev/null 2>&1




const dirs = [
  { me: 'data/timemaps', isDir: true },
  { me: path.join('data/logs', 'infos.log'), isDir: false },
  { me: path.join('data/logs', 'errors.log'),isDir: false },
  { me: path.join('data/dbs', 'url-hash-count.db'),isDir: false }
  ]

const tarDirs = [
  {
    tar: 'data/timemaps',
    name: 'timemaps'
  },
  {
    tar: 'data/logs',
    name: 'logs'
  },
  {
    tar: 'data/dbs',
    name: 'dbs'
  }
]

function tarIt (tarMe) {
  return new Promise((resolve, reject) => {
    let now = moment().subtract(1, 'day').format('MMDDYYYY')
    let tarIt = tar().createReadStream(tarMe.tar)
    let tarOut = fs.createWriteStream(`data/tars/${tarMe.name}-${now}.tar.gz`)
    tarIt.pipe(tarOut)
      .on('close', () => {
        resolve()
      })
      .on('error', (error) => {
        logger.error('creating tar', error)
        resolve()
      })
  })
}
function empty (emptyME) {
  return new Promise((resolve, reject) => {
    if (emptyME.isDir) {
      fs.emptyDir(emptyME.me, (err) => {
        if (err) {
          reject(err)
        }
        resolve()
      })
    } else {
      fs.closeSync(fs.openSync(emptyME.me, 'w'))
      resolve()
    }
  })
}



function haltOnTimedout (req, res, next) {
  if (!req.timedout) next()
}
let app = express()
app.use(timeout('300s'))
app.use(haltOnTimedout)

let db = new Datastore({
  filename: path.join('data/dbs', 'url-hash-count.db'),
  autoload: true
})

db.persistence.setAutocompactionInterval(3000000)

let rule = new schedule.RecurrenceRule()
// rule.second = new schedule.Range(0,59,5)
rule.dayOfWeek = [ 0, 1, 2, 3, 4, 5, 6 ]
rule.hour = 0
rule.minute = 1
rule.second = 0

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.File)({
      name: 'info-file',
      filename: 'data/logs/infos.log',
      level: 'info',
      timestamp: function() { return moment.utc() }
    }),
    new (winston.transports.File)({
      name: 'error-file',
      filename: 'data/logs/errors.log',
      level: 'error',
      timestamp: function() { return moment.utc() }
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

const reacurringJob = schedule.scheduleJob(rule, () => {
  console.log('starting up the clean up of past day')

  Promise.map(tarDirs,tarIt)
    .then(() => {
      Promise.map(dirs, empty)
        .then(() => {
          logger.info('cleaned up the past day')
        })
        .error(err => logger.error('emptying logs timemaps', err))
    })
    .error( (error) => {
      logger.error('creating tars', error)
    })
})

const pathRE = new RegExp('/timemap/(?:(?:json)|(?:link)|(?:cdxj))/(.+)')

//memgator port 80,
//'http://localhost:9000'
const isDebug = false
let upstream = isDebug ? 'http://localhost:9000' : 'http://memgator.cs.odu.edu:1209'
let port = 8008

console.log(`Starting the memgator proxy for upstream[${upstream}] listening on port[${port}]`)

app.all('*', proxy(upstream, {
  intercept(rsp, data, req, res, callback) {
    console.log('intercept')
    res.setHeader('Via', 'ws-dl memgator proxy')
    var ip = req.headers[ 'x-forwarded-for' ] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress
    callback(null, data)
    let statusCode = rsp.statusCode
    console.log(req.url)
    let urlT = S(req.url)
    if (urlT.startsWith('/timemap') && req.method === 'GET') {
      let now = moment.utc()
      let nowTime = now.format('YYYYMMDDHHmmssSSS')
      let urlO = pathRE.exec(urlT.s)
      let hash = md5(urlO[ 1 ])
      console.log(urlO[ 1 ])
      let noUtc =  moment().format('YYYYMMDDHHmmssSSS')
      let memcount = rsp.headers[ 'x-memento-count' ]
      logger.info('got timemap request', { url: urlO[ 1 ], memcount, ip, noUtc })
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
      let path = `data/timemaps/${now.format('YYYYMMDD')}`
      fs.ensureDir(path, error => {
        if (error) {
          logger.error(`ensuring dir timemap error for hash[${hash}] %s`, error)
        } else {
          fs.writeFile(`${path}/${hash}-${ip}-${nowTime}-${statusCode}-timemap.${fileType}`, data, 'utf8', err => {
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
                mementoCount: [ { ip, statusCode, count: memcount, date: nowTime, noUtc } ],
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
                  mementoCount: { ip, statusCode, count: memcount, date: nowTime, noUtc }
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
