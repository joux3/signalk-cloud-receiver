'use strict';

const express = require('express');
const app = express();
let expressWs = require('express-ws')(app); // eslint-disable-line no-unused-vars

const port = process.env.PORT || 3005;

app.ws('/signalk-input', (ws) => {
  ws.on('message', msg => {
    if (ws.__boatId) {
      console.log('got message from ' + ws.__boatId + ':', msg);
      handleBoatMessage(ws.__boatId, ws, msg);
    } else {
      ws.__boatId = msg;
      // TODO validate boat id against config
      console.log('boat ' + ws.__boatId + ' connected');
    }
  });

  ws.on('close', () => {
    console.log('Boat ' + (ws.__boatId || '<unknown>') + ' disconnected');
  })
});

app.listen(port);

function handleBoatMessage(boatId, ws, msg) {
  var parsed = tryParseJSON(msg);
  console.log("managed to parse")
  if (!parsed || typeof parsed.msgId !== 'number') {
    return;
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
