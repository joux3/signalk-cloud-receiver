'use strict';

const express = require('express');
const app = express();
const R = require('ramda')
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
  var parsed = tryParseJSON(msg);
  if (!parsed || !parsed.updates || !parsed.updates.length) {
    return;
  }

  if (parsed.updates && parsed.updates.length) {
    parsed.updates.forEach((update) => {
      update.values.forEach((value) => {
        const pathStr = parsed.context + "." + value.path
        const path = pathStr.split('.')

        if (R.pathOr(new Date(0), path, worldState) > new Date(update.timestamp)) {
          doLog("Skipping update because it's older")
          return
        }
        const pathState = {
          value: value.value,
          timestamp: update.timestamp  
        }
        doLog("Updating "+pathStr)
        worldState = R.assocPath(path, pathState, worldState)
        sendClientUpdate(pathStr, pathState)
      })
    })
  }

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
