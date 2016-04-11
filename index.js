"use strict";

const express = require('express');
const app = express();
let expressWs = require('express-ws')(app); // eslint-disable-line no-unused-vars

const port = process.env.PORT || 3000;

app.ws('/signalk-input', (ws) => {
  ws.on('message', msg => {
    console.log('got message ', msg);
  });
});

app.listen(port);