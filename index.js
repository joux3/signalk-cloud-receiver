'use strict';

const express = require('express');
const app = express();
const R = require('ramda')
const deltaParser = require('./delta_parser')
let expressWs = require('express-ws')(app); // eslint-disable-line no-unused-vars

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
  ws.send(JSON.stringify(worldState))

  ws.on('close', cleanup)
  ws.on('error', cleanup)
  function cleanup() {
    delete connectedClients[ws.__clientId]
  }
})

function sendClientUpdate(pathStr, pathState) {
  const messageStr = JSON.stringify({
    path: pathStr,
    value: pathState.value,
    timestamp: pathState.timestamp
  })
  Object.keys(connectedClients).forEach((clientId) => {
    connectedClients[clientId].send(messageStr)
  })
}

var worldState = {}

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
  const parsed = tryParseJSON(msg);

  const updates = deltaParser(parsed)
  updates.forEach(update => {
    const globalPath = (update.vessel + '.' + update.pathStr).split('.')
    if (new Date(R.pathOr(0, globalPath.concat("timestamp"), worldState)) >= update.timestamp) {
      return
    }
    const pathState = {
      value: update.value,
      timestamp: update.timestamp.toISOString()
    }
    worldState = R.assocPath(globalPath, pathState, worldState)
    sendClientUpdate(pathStr, pathState)
  })

  if (typeof parsed.msgId === 'number') {
    ws.send(JSON.stringify({
      "ACK": parsed.msgId
    }))
  }
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
