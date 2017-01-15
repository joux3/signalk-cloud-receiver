'use strict';

const express = require('express')
const app = express()
const R = require('ramda')
const Promise = require('bluebird')
require('express-ws')(app)

const deltaParser = require('./delta_parser')
const db = require('./database')

const port = process.env.PORT || 3005;

app.use(express.static('public'))

app.get('/state', (req, res) => {
  res.send(JSON.stringify(worldState))
})

var connectedClients = {}
var clientId = 0
app.ws('/signalk-output', (ws, req) => {
  // TODO check auth based on req
  ws.__clientId = clientId++
  connectedClients[ws.__clientId] = ws
  ws.send(JSON.stringify({type: 'state', data: worldState}))

  ws.on('message', function(msg) {
    const parsed = tryParseJSON(msg)
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
  doLog('boat ' + ws.__boatId + ' connected');

  ws.on('message', msg => {
    handleBoatMessage(ws.__boatId, ws, msg);
  });

  ws.on('close', () => {
    doLog('Boat ' + (ws.__boatId || '<unknown>') + ' disconnected');
  })

  ws.on('error', () => {
    doLog('Boat ' + (ws.__boatId || '<unknown>') + ' error');
  })
});

app.listen(port);
console.log("Started listening at", port)

function handleBoatMessage(boatId, ws, msg) {
  const parsed = tryParseJSON(msg)

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
    console.log('Error in storing', error)
    if (hasMsgId) {
      ws.send(JSON.stringify({
        "ERRACK": parsed.msgId
      }))
    }
  })
}

function tryParseJSON(string) {
  try {
    return JSON.parse(string);
  } catch (e) {
    return null;
  }
}

function doLog(str) {
  console.log(new Date().toISOString() + ": " + str)
}
