'use strict';

const express = require('express');
const app = express();
let expressWs = require('express-ws')(app); // eslint-disable-line no-unused-vars

const port = process.env.PORT || 3000;

app.ws('/signalk-input', (ws) => {
  ws.on('message', msg => {
    if (ws.__boatId) {
      console.log('got message from ' + ws.__boatId + ':', msg);
      handleBoatMessage(ws.__boatId, msg);
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

function handleBoatMessage(boatId, msg) {
}