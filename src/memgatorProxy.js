import http from 'http'
import proxy from 'express-http-proxy'
import express from 'express'
import S from 'string'
import md5 from 'md5'
import path from 'path'
import fs from 'fs-extra'
import moment from 'moment-timezone'
import winston from 'winston'
import Datastore from 'nedb'
import timeout from 'connect-timeout'
import tar from 'tar.gz'
import Promise from 'bluebird'
import schedule from 'node-schedule'
import cluser from 'cluster'
import ua from 'express-useragent'
import rp from 'request-promise'
import _ from 'lodash'
import DailyRotateFile from 'winston-daily-rotate-file'
require('http-shutdown').extend()

/// 0 0 0 1/1 * ? *

// 0 0 * * * node wrapUp.js >/dev/null 2>&1

const dirs = [
  { me: 'data/timemaps', isDir: true, name: "timemaps" }
]

const tarDirs = [
  {
    tar: 'data/timemaps',
    name: 'timemaps'
  },
  {
    tar: 'data/logs',
    name: 'logs'
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
        reject(error)
      })
  })
}
function empty (emptyME) {
  return new Promise((resolve, reject) => {
    let now = moment().subtract(1, 'day').format('MMDDYYYY')
    if (emptyME.isDir) {
      fs.copy(emptyME.me, `data/${now}/${emptyME.name}`, (err) => {
        if (err) {
          resolve()
        } else {
          fs.emptyDir(emptyME.me, (err) => {
            if (err) {
              reject(err)
            }
            resolve()
          })
        }
      })

    } else {
      fs.closeSync(fs.openSync(emptyME.me, 'w'))
      resolve()
    }
  })
}

// let db = new Datastore({
//   filename: path.join('data/dbs', 'newWay.db'), //'url-hash-count.db'),
//   autoload: true
// })
//
// db.persistence.setAutocompactionInterval(3000000)
//
let rule = new schedule.RecurrenceRule()
// rule.second = new schedule.Range(0,59,5)
rule.dayOfWeek = [ 0, 1, 2, 3, 4, 5, 6 ]
rule.hour = 0
rule.minute = 1
rule.second = 0

const logger = new (winston.Logger)({
  transports: [
    new winston.transports.DailyRotateFile({
      zippedArchive: true,
      name: 'info-timemap-file',
      datePattern: '.yyyy-MM-dd',
      filename: 'data/logs/timemap.log',
      level: 'info'
    }),
    new winston.transports.DailyRotateFile({
      zippedArchive: true,
      name: 'error-file',
      datePattern: '.yyyy-MM-dd',
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

const reacurringJob = schedule.scheduleJob(rule, () => {
  console.log('starting up the clean up of past day')
  let now = moment().subtract(1, 'day').format('MMDDYYYY')
  fs.ensureDir(`data/tar/${now}`, ensureError => {
    Promise.map(tarDirs,tarIt)
      .then(() => {
        console.log('done cleaning up for a day')
      })
      .error( (error) => {
        logger.error('creating tars', error)
      })
  })
})

const pathRE = new RegExp('/timemap/(?:(?:json)|(?:link)|(?:cdxj))/(.+)')

//memgator port 80,
//'http://localhost:9000'
const isDebug = false
let upstream = isDebug ? 'http://localhost:9000' : 'http://memgator.cs.odu.edu:1209'
let port = 8008

console.log(`Starting the memgator proxy for upstream[${upstream}] listening on port[${port}]`)

function haltOnTimedout (req, res, next) {
  if (!req.timedout) next()
}
let app = express()
app.use(timeout('300s'))
app.use(haltOnTimedout)
app.use(ua.express())
app.use(haltOnTimedout)

app.all('*', proxy(upstream, {
  intercept(rsp, data, req, res, callback) {
    res.setHeader('Via', 'ws-dl memgator proxy')
    callback(null, data)
    let ip = req.ip
    let ua = _.transform(req.useragent, (result, value, key) => {
      if (value) {
        result[ key ] = value
      }
    }, {})
    let statusCode = rsp.statusCode
    let method = req.method
    let urlT = S(req.url)
    let now = moment()
    let nowTime = now.format('YYYYMMDDHHmmssSSS')
    let noUtc = moment.tz('US/Eastern').format('YYYYMMDDHHmmssSSS')
    if (urlT.startsWith('/timemap') && method === 'GET') {
      let urlO = pathRE.exec(urlT.s)
      let hash = md5(urlO[ 1 ])
      let memcount = rsp.headers[ 'x-memento-count' ]
      logger.info('got timemap request', { what: 'timemap', url: urlO[ 1 ], hash, memcount, ip, statusCode, count: memcount, date: nowTime, noUtc, userAgent: ua })
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

    } else {
      let visiting = S(res.url).startsWith('timegate/') ? 'timegate'  : 'memento'
      logger.info(`got ${visiting} request`,
        { what: visiting, url: res.url,  ip, statusCode, date: nowTime, noUtc, userAgent: ua }
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

process.once('SIGUSR2', () => {
  proxyS.shutdown(() => {
    process.kill(process.pid, 'SIGUSR2')
  })
})