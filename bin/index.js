#!/usr/bin/env node
const http = require('http');
const express = require('express');

const Parse = require('parse/node');
const { ParseServer } = require('parse-server');
const AppCache = require('parse-server/lib/cache').default;
const Config = require('parse-server/lib/Config');

const { sendScheduledPushes } = require('../src');

let config;
if (process.env.NODE_ENV === 'production') {
  config = require('../config/production');
} else {
  config = require('../config/development');
}

const parsePort = 3737;
const parseServerOptions = Object.assign({
  masterKey: 'master',
  javascriptKey: 'jskey',
  appId: 'parse-scheduled-pusher',
  databaseURI: process.env.DATABASE_URI,
  serverURL: `http://localhost:${parsePort}/1`,
  hasPushSupport: true,
  hasPushScheduledSupport: true,
  scheduledPush: true,
}, config);

const parseServer = new ParseServer(parseServerOptions);
const app = express();
app.use('/1', parseServer);
http.createServer(app).listen(parsePort);

Parse.initialize(parseServerOptions.appId, parseServerOptions.javascriptKey, parseServerOptions.masterKey);
Parse.serverURL = `http://localhost:${parsePort}/1`;

const parseConfig = new Config(parseServerOptions.appId, '/1');
const pushAdapter = AppCache.get(parseServerOptions.appId).pushWorker.adapter;

setInterval(() => {
  sendScheduledPushes(parseConfig, pushAdapter);
}, process.env.SCHEDULE_CHECK_INTERVAL || 30 * 1000);

