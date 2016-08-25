import http from 'http'
import express from 'express'
import winston from 'winston'
import bodyParser from 'body-parser'
require('http-shutdown').extend()

const testData = require('monk')('mongodb-memprox:27017/data')
const urlHashCount = testData.get('urlHashCount')
const uas = testData.get('userAgents')
const other = testData.get('other')

const logger = new (winston.Logger)({
  transports: [
    new (winston.transports.File)({
      name: 'info-file',
      filename: 'data/logs/mongo-infos.log',
      level: 'info'
    }),
    new (winston.transports.File)({
      name: 'error-file',
      filename: 'data/logs/mongo-errors.log',
      level: 'error'
    }),
    new (winston.transports.Console)()
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: 'data/logs/mongo-exceptions.log',
      handleExceptions: true,
      humanReadableUnhandledException: true
    })
  ]
})

logger.exitOnError = false

urlHashCount.find({},{})
  .then(docs => {
    logger.info('we can talk to mongo',docs)
  })
  .catch(errorUA => {
    logger.error('cant talk to mongo error',errorUA)
  })

const app = express()
app.use(bodyParser.json())
app.post('/timemap',(req,res) => {
  console.log(req.body)

  res.status(200).end()

  let {body} = req
  logger.info('got timemap request', body)
  urlHashCount.findOneAndUpdate({hash: body.mc.hash,url: body.mc.url},body.mc.update,{upsert: true})
    .then((resultUHC) => {
      logger.info('urlHashCount update success')
      uas.findOneAndUpdate({source: body.ua.source}, body.ua.update,{upsert: true})
        .then((resultUA) => {
          logger.info('userAgent update success')
        })
        .catch(errorUA => {
          console.log('catch')
          logger.error('useragent error',errorUA)
        })
    })
    .catch(error => {
      logger.error('useragent update error',error)
    })
})

app.post('/other',(req,res) => {
  console.log(req.body)
  res.status(200).end()
  let {body} = req
  logger.info('got other request', body)
  other.findOneAndUpdate({visiting: body.visiting}, body.update,{upsert: true})
    .then((resultOther) => {
      logger.info('other update success')
    })
    .catch(error => {
      console.log('catch')
      logger.error('other update error ',error)
    })
})

let monoServer = http.createServer(app).withShutdown()
monoServer.listen(8005)

process.on('SIGTERM', () => {
  console.log('Stopping proxy server')
  monoServer.shutdown(() => {
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Stopping proxy server')
  monoServer.shutdown(() => {
    process.exit(0)
  })
})

process.once('SIGUSR2', () => {
  monoServer.shutdown(() => {
    process.kill(process.pid, 'SIGUSR2')
  })
})
