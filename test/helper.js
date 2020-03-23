'use strict'

const { promisify } = require('util')
const mqtt = require('mqtt')
const assert = require('assert')
const WebSocket = require('ws')
const tls = require('tls')
const http = require('http')
const https = require('https')
const http2 = require('http2')
const net = require('net')
const aedes = require('aedes')

const DB = process.env.DB
var Persistence = 'aedes-persistence' + (DB ? '-' + DB : '')
var MqEmitter = 'mqemitter' + (DB ? '-' + DB : '')

Persistence = require(Persistence)
MqEmitter = require(MqEmitter)

function startClient (url, options) {
  if (typeof url === 'object') {
    options = url
    url = 'mqtt://localhost'
  }

  return new Promise((resolve, reject) => {
    var client = mqtt.connect(url, options)

    client.subscribe = promisify(client.subscribe)
    client.unsubscribe = promisify(client.unsubscribe)
    client.publish = promisify(client.publish)
    client.end = promisify(client.end)

    client.once('connect', function () {
      resolve(client)
    })

    client.once('error', function (err) {
      reject(err)
    })
  })
}

function initAedes (options) {
  options.persistence = new Persistence()
  options.mq = new MqEmitter()
  return aedes(options)
}

function createServer (options, aedesHandler) {
  assert(options, 'Missing options')
  assert(aedesHandler, 'Missing aedes handler')

  var server = null
  if (options.serverFactory) {
    server = options.serverFactory(aedesHandler, options)
  } else if (options.tls) {
    server = tls.createServer(options, aedesHandler)
  } else if (options.ws) {
    if (options.https) {
      if (options.http2) {
        server = http2.createSecureServer(options.https)
      } else {
        server = https.createServer(options.https)
      }
    } else {
      if (options.http2) {
        server = http2.createServer()
      } else {
        server = http.createServer()
      }
    }
    const ws = new WebSocket.Server({ server: server })
    ws.on('connection', function (conn, req) {
      const stream = WebSocket.createWebSocketStream(conn)
      aedesHandler(stream, req)
    })
  } else {
    server = net.createServer(options, aedesHandler)
  }
  return server
}

module.exports = {
  startClient: startClient,
  initAedes: initAedes,
  createServer: createServer,
  delay: promisify(setTimeout)
}
