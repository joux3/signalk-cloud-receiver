'use strict';

const express = require('express')
const app = express()
const R = require('ramda')
const Promise = require('bluebird')
require('express-ws')(app)
const cookieSession = require('cookie-session')
const bodyParser = require('body-parser')

const deltaParser = require('./delta_parser')
const db = require('./database')
const util = require('./util')

const port = process.env.PORT || 3005

const PASSWORD = process.env.PASSWORD || 'testpw'
if (!process.env.PASSWORD && process.env.NODE_ENV === 'production') {
  console.log("PASSWORD not set! Stopping")
  process.exit(1)
}
if (!process.env.COOKIE_SECRET && process.env.NODE_ENV === 'production') {
  console.log("COOKIE_SECRET not set! Stopping")
  process.exit(1)
}

app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieSession({
  name: 'session',
  keys: [process.env.COOKIE_SECRET || 'fallbackSecret']
}))
app.use(function(req, res, next) {
  if (req.session.loginPassword === PASSWORD) {
    next()
  } else if (req.method === 'POST' && req.body.password === PASSWORD) {
    req.session.loginPassword = PASSWORD
    res.redirect('/')
  } else {
    const wrongPw = req.method === 'POST' && req.body.password
    const form = '<form method="post" action="/"><input type="password" name="password"><input type="submit" value="Login"></form>'
    res.type('html').end(form + (wrongPw ? 'Wrong password!' : ''))
  }
})
app.use(express.static('public'))


var connectedClients = {}
var clientId = 0
app.ws('/signalk-output', (ws, req) => {
  util.doLog('Client connected', req.ip)
  ws.__clientId = clientId++
  connectedClients[ws.__clientId] = ws
  ws.send(JSON.stringify({type: 'state', data: worldState}))

  ws.on('message', function(msg) {
    const parsed = util.tryParseJSON(msg)
    if (parsed && parsed.type === 'requestTrack' && typeof parsed.vesselId === 'string') {
      db.getPositionsFor10Minutes(parsed.vesselId).then(positions => {
        ws.send(JSON.stringify({type: 'boatTrack', vesselId: parsed.vesselId, positions}))
      })
    }
  })
  ws.on('close', cleanup)
  ws.on('error', cleanup)
  function cleanup() {
    delete connectedClients[ws.__clientId]
  }
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
  Object.keys(connectedClients).forEach((clientId) => {
    connectedClients[clientId].send(messageStr)
  })
}

var worldState = {}
db.getLatest30SecondsPerVessel().then(updates => {
  updates.forEach(update => {
    const globalPathStr = update.vessel + '.' + update.path
    const globalPath = globalPathStr.split('.')
    if (new Date(R.pathOr(0, globalPath.concat("timestamp"), worldState)) >= update.time) {
      return
    }
    const pathState = {
      value: update.value,
      timestamp: update.time.toISOString()
    }
    worldState = R.assocPath(globalPathStr.split('.'), pathState, worldState)
  })
})

app.ws('/signalk-input', (ws) => {
  ws.__boatId = Math.random();
  util.doLog('boat ' + ws.__boatId + ' connected');

  ws.on('message', msg => {
    handleBoatMessage(ws.__boatId, ws, msg);
  });

  ws.on('close', () => {
    util.doLog('Boat ' + (ws.__boatId || '<unknown>') + ' disconnected');
  })

  ws.on('error', () => {
    util.doLog('Boat ' + (ws.__boatId || '<unknown>') + ' error');
  })
});

app.listen(port)
util.doLog("Started listening at", port)

function handleBoatMessage(boatId, ws, msg) {
  const parsed = util.tryParseJSON(msg)

  const updates = deltaParser(parsed)
  updates.forEach(update => {
    const globalPathStr = update.vessel + '.' + update.pathStr
    const globalPath = globalPathStr.split('.')
    if (new Date(R.pathOr(0, globalPath.concat("timestamp"), worldState)) >= update.timestamp) {
      return
    }
    const pathState = {
      value: update.value,
      timestamp: update.timestamp.toISOString()
    }
    worldState = R.assocPath(globalPath, pathState, worldState)
    sendClientUpdate(globalPathStr, pathState)
  })

  const hasMsgId = parsed && typeof parsed.msgId === 'number'
  Promise.map(updates, db.storeUpdate).then(() => {
    if (hasMsgId) {
      ws.send(JSON.stringify({
        "ACK": parsed.msgId
      }))
    }
  }).catch((error) => {
    util.doLog('Error in storing', error)
    if (hasMsgId) {
      ws.send(JSON.stringify({
        "ERRACK": parsed.msgId
      }))
    }
  })
}


