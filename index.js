'use strict';

const express = require('express');
const app = express();
let expressWs = require('express-ws')(app); // eslint-disable-line no-unused-vars

const port = process.env.PORT || 3005;

app.ws('/signalk-input', (ws) => {
  ws.on('message', msg => {
    if (ws.__boatId) {
      handleBoatMessage(ws.__boatId, ws, msg);
    } else {
      ws.__boatId = msg + Math.random();
      // TODO validate boat id against config
      doLog('boat ' + ws.__boatId + ' connected');
    }
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
  if (!parsed || typeof parsed.msgId !== 'number') {
    return;
  }

  if (parsed.updates && parsed.updates.length) {
    parsed.updates.forEach((update) => {
      doLog("got sample from "+update.timestamp)
    })
  }

  ws.send(JSON.stringify({
    "ACK": parsed.msgId
  }))
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
