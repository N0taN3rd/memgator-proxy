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
require('pretty-error').start()

/*
 application/json
 application/link
 application/cdxj+ors
 import winston from 'winston'
 import util from 'util'
 import fs from 'fs-extra'
 import md5 from 'md5'
 import httpProxy from 'http-proxy'
 */

let app = express()

const db = new Datastore({
  filename: path.join('dbs', 'url-hash-count.db'),
  autoload: true
})

db.loadDatabase()

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.File)({
      name: 'info-file',
      filename: 'logs/infos.log',
      level: 'info'
    }),
    new (winston.transports.File)({
      name: 'error-file',
      filename: 'logs/errors.log',
      level: 'error'
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: 'logs/exceptions.log',
      handleExceptions: true,
      humanReadableUnhandledException: true
    })
  ]
})

logger.exitOnError = false

const pathRE = new RegExp('/timemap/(?:(?:json)|(?:link)|(?:cdxj))/(.+)')

app.all('*', proxy('http://localhost:9000', {
  intercept(rsp, data, req, res, callback) {
    callback(null, data)
    let statusCode = rsp.statusCode
    let url = S(req.url)
    console.log(url.s)
    if (url.contains('timemap') && req.method === 'GET') {
      let now = moment().format('YYYYMMDDHHmmss')
      let urlO = pathRE.exec(url.s)
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
      let path = `timemaps/${hash}/${statusCode}`
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
      let id = { _id: urlO[ 1 ] }
      db.find(id, (errFind, docs) => {
          if (errFind) {
            logger.error('finding url[%s] failed %s', url, errFind)
          } else {
            if (docs.length === 0) {
              let insertMe = {
                _id: urlO[ 1 ],
                hash,
                mementoCount: [ { count: memcount, date: now } ],
                statusCodes: [
                  {
                    code: statusCode,
                    date: now
                  }
                ]

              }
              db.insert(insertMe, (insertError, newDoc) => {
                if (insertError) {
                  logger.error('inserting new url[%s] failed %s', url, errFind)
                }
              })
            } else {
              let update = {
                $push: {
                  mementoCount: { count: memcount, date: now },
                  statusCodes: {
                    code: statusCode,
                    date: now
                  }
                }
              }
              db.update(id, update,{ upsert: true }, (errUpdate, numAffected, affectedDocuments, upsert) => {
                console.log(errUpdate)
                console.log(numAffected)
                console.log(affectedDocuments)
                console.log(upsert)
                if (errUpdate) {
                  logger.error('updating mementocount timemap for url[%s] failed %s', url, errFind)
                }
              })
            }
          }
        }
      )
      // db.urlHash.find({ _id: hash }, (errUHF, docs) => {
      //   if (errUHF) {
      //     logger.error('finding hash[%s] -> url[%s] failed %s', hash, url, errUHF)
      //   } else {
      //     if (docs.length === 0) {
      //       db.urlHash.insert({ _id: hash, url: urlO[ 1 ] }, (err, newDoc) => {
      //         if (err) {
      //           logger.error('inserting hash[%s] -> url[%s] failed %s', hash, url, err)
      //         } else {
      //           let toBeInserted = { _id: hash, count: [ { count: memcount, date: m.format('YYYYMMDD') } ] }
      //           db.mementoCount.insert(toBeInserted, (err, newDoc))
      //         }
      //       })
      //     }
      //   }
      // })
      // db.mementoCount.find({ _id: hash }, (err, docs) => {
      //   if (docs.length === 0) {
      //
      //   } else {
      //     db.mementoCount.update({ _id: hash },
      //       { $push: { mementoCount: { count: memcount, date: m.format('YYYYMMDD') } } },
      //       (err, numAffected, affectedDocuments, upsert) => {
      //         console.log(err)
      //         console.log(numAffected)
      //         console.log(affectedDocuments)
      //         console.log(upsert)
      //       })
      //   }
      // })
    }
  },
  preserveHostHdr: true
}))

let proxyS = http.createServer(app)
proxyS.listen(8008)

//
//

// //
// // logger.log('info', 'starting')
//
// let proxy = httpProxy.createProxyServer({
//   target: 'http://localhost:9000'
// })
//
// // proxy.on('proxyReq', (proxyReq, req, res) => {
// //   logger.log('info', 'proxyReq %s %s',req.url,JSON.stringify(req.headers, true, 2))
// // })
// //
// // proxy.on('proxyRes', (proxyRes, req, res) => {
// //   logger.log('info', 'proxyRes %s %s',proxyRes.url,JSON.stringify(proxyRes.headers, true, 2))
// // })
// // proxy.on('proxyReq',(proxyReq,req,res) => {
// //   // console.log('proxyReq')
// //   // console.log('showing req')
// //   // console.log(util.inspect(req,{depth: null,colors: true}))
// //   // console.log('===========================================')
// //   // console.log('showing res')
// //   // console.log(util.inspect(res,{depth: null,colors: true}))
// //   // console.log('===========================================')
// // })
//
// proxy.on('proxyRes',(proxyRes,req,res) => {
//   // console.log(req,res,process)
//   console.log('RAW Response from the target', JSON.stringify(proxyRes.headers))
//   console.log(util.inspect(proxyRes,{colors: true}))
//
// })
//
//
//
//
// proxy.listen(8008)

