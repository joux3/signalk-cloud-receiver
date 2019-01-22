'use strict'

const port = 3005
const express = require('express')
const app = express()
const _ = require('lodash')
const Promise = require('bluebird')
const util = require('./util')

let server = null
if (process.env.CERTIFICATE_EMAIL && process.env.CERTIFICATE_DOMAIN) {
  server = require('greenlock-express')
    .create({
      server: process.env.CERTIFICATE_SERVER || 'staging',
      email: process.env.CERTIFICATE_EMAIL,
      agreeTos: true,
      approveDomains: [process.env.CERTIFICATE_DOMAIN],
      app
    })
    .listen(80, 443)
} else {
  server = app.listen(port)
  util.doLog('Starting server at', port)
}
require('express-ws')(app, server)

const cookieSession = require('cookie-session')
const bodyParser = require('body-parser')

const deltaParser = require('./delta_parser')
const db = require('./database')

const PASSWORD = process.env.PASSWORD || 'testpw'
if (!process.env.PASSWORD && process.env.NODE_ENV === 'production') {
  console.log('PASSWORD not set! Stopping')
  process.exit(1)
}
if (!process.env.COOKIE_SECRET && process.env.NODE_ENV === 'production') {
  console.log('COOKIE_SECRET not set! Stopping')
  process.exit(1)
}

app.use(bodyParser.urlencoded({ extended: false }))
app.use(
  cookieSession({
    name: 'session',
    keys: [process.env.COOKIE_SECRET || 'fallbackSecret']
  })
)
app.use(function(req, res, next) {
  if (req.url === '/signalk-input/.websocket') {
    next()
    return
  }
  if (req.session.loginPassword === PASSWORD) {
    next()
  } else if (req.method === 'POST' && req.body.password === PASSWORD) {
    req.session.loginPassword = PASSWORD
    res.redirect('/')
  } else {
    const wrongPw = req.method === 'POST' && req.body.password
    const form =
      '<form method="post" action="/"><input type="password" name="password"><input type="submit" value="Login"></form>'
    res.type('html').end(form + (wrongPw ? 'Wrong password!' : ''))
  }
})
app.use(express.static('public'))

const connectedClients = {}
let clientId = 0
app.ws('/signalk-output', (ws, req) => {
  util.doLog('Client connected', req.ip)
  ws.__clientId = clientId++
  connectedClients[ws.__clientId] = ws
  ws.send(JSON.stringify({ type: 'displayNames', displayNames }))
  ws.send(JSON.stringify({ type: 'state', data: worldState }))

  ws.on('message', function(msg) {
    const parsed = util.tryParseJSON(msg)
    if (!parsed) {
      return
    }
    if (
      parsed.type === 'requestTrack' &&
      typeof parsed.vesselId === 'string' &&
      (typeof parsed.date === 'string' || parsed.date === undefined)
    ) {
      db.getPositionsForDateOr10Minutes(parsed.vesselId, parsed.date).then(
        positions => {
          const msg = {
            type: 'boatTrack',
            vesselId: parsed.vesselId,
            positions
          }
          if (typeof parsed.date === 'string') {
            msg.date = parsed.date
          }
          ws.send(JSON.stringify(msg))
        }
      )
    } else if (
      parsed.type === 'requestTrackDates' &&
      typeof parsed.vesselId === 'string'
    ) {
      db.getDatesWithPositions(parsed.vesselId).then(dates => {
        ws.send(
          JSON.stringify({
            type: 'boatTrackDates',
            vesselId: parsed.vesselId,
            dates
          })
        )
      })
    }
  })
  ws.on('close', cleanup)
  ws.on('error', cleanup)
  function cleanup() {
    delete connectedClients[ws.__clientId]
  }
})

app.ws('/signalk-input', ws => {
  ws.__boatId = Math.random()
  util.doLog('boat ' + ws.__boatId + ' connected')

  ws.on('message', msg => {
    handleBoatMessage(ws.__boatId, ws, msg)
  })

  ws.on('close', () => {
    util.doLog('Boat ' + (ws.__boatId || '<unknown>') + ' disconnected')
  })

  ws.on('error', () => {
    util.doLog('Boat ' + (ws.__boatId || '<unknown>') + ' error')
  })
})

function sendClientUpdate(pathStr, pathState) {
  const messageStr = JSON.stringify({
    type: 'state',
    data: {
      path: pathStr,
      value: pathState.value,
      timestamp: pathState.timestamp
    }
  })
  Object.keys(connectedClients).forEach(clientId => {
    connectedClients[clientId].send(messageStr)
  })
}

let displayNames = {}
updateDisplayNames()
setInterval(updateDisplayNames, 60 * 1000 * 5)
function updateDisplayNames() {
  db.getDisplayNames().then(_displayNames => {
    displayNames = _displayNames
  })
}
let worldState = {}
db.getLatest30SecondsPerVessel().then(updates => {
  updates.forEach(update => {
    const globalPathStr = update.vessel + '.' + update.path
    if (
      new Date(_.get(worldState, globalPathStr + '.timestamp', 0)) >=
      update.time
    ) {
      return
    }
    const pathState = {
      value: update.value,
      timestamp: update.time.toISOString()
    }
    _.set(worldState, globalPathStr, pathState)
  })
})

function handleBoatMessage(boatId, ws, msg) {
  const parsed = util.tryParseJSON(msg)

  const updates = deltaParser(parsed)
  updates.forEach(update => {
    const globalPathStr = update.vessel + '.' + update.pathStr
    if (
      new Date(_.get(worldState, globalPathStr + '.timestamp', 0)) >=
      update.timestamp
    ) {
      return
    }
    const pathState = {
      value: update.value,
      timestamp: update.timestamp.toISOString()
    }
    _.set(worldState, globalPathStr, pathState)
    sendClientUpdate(globalPathStr, pathState)
  })

  const hasMsgId = parsed && typeof parsed.msgId === 'number'
  Promise.map(updates, db.storeUpdate)
    .then(() => {
      if (hasMsgId) {
        ws.send(
          JSON.stringify({
            ACK: parsed.msgId
          })
        )
      }
    })
    .catch(error => {
      util.doLog('Error in storing', error)
      if (hasMsgId) {
        ws.send(
          JSON.stringify({
            ERRACK: parsed.msgId
          })
        )
      }
    })
}
