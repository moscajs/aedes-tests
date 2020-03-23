'use strict'

const { promisify } = require('util')
const mqtt = require('mqtt')
const WebSocket = require('ws')
const tls = require('tls')
const http = require('http')
const https = require('https')
const http2 = require('http2')
const net = require('net')
const aedes = require('aedes')

const DB = process.env.DB
var persistence = 'aedes-persistence' + (DB ? '-' + DB : '')
var mqemitter = 'mqemitter' + (DB ? '-' + DB : '')

persistence = require(persistence)
mqemitter = require(mqemitter)

function startClient (url, options) {
  return new Promise((resolve, reject) => {
    if (typeof url === 'object') {
      options = url
      url = null
    }

    if (!url) url = 'mqtt://localhost'

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
  if (!options) options = {}
  options.persistence = persistence()
  options.mq = mqemitter()
  return aedes(options)
}

function closeAll (...args) {
  var done = 0
  var err = null

  function onDone (e) {
    done++
    if (e) err = e

    if (done === args.length) {
      if (err) throw err
    }
  }

  for (var i = 0; i < args.length; i++) {
    args[i].close(onDone)
  }
}

function createServer (options, aedesHandler) {
  if (typeof options === 'function') {
    aedesHandler = options
    options = {}
  }

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

  return new Promise((resolve, reject) => {
    server.listen(options.port || 1883, function (err) {
      if (err) reject(err)
      else resolve(server)
    })
  })
}

module.exports = {
  startClient: startClient,
  initAedes: initAedes,
  createServer: createServer,
  closeAll: closeAll,
  delay: promisify(setTimeout)
}
