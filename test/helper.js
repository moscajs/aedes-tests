const util = require('util')
const mqtt = require('mqtt')
const assert = require('assert')
const WebSocket = require('ws')
const tls = require('tls')
const http = require('http')
const https = require('https')
const http2 = require('http2')
const net = require('net')

function startClient (url, options) {
  if (typeof url === 'object') {
    options = url
    url = 'mqtt://localhost'
  }

  return new Promise((resolve, reject) => {
    var client = mqtt.connect(url, options)

    client.once('connect', function () {
      resolve(client)
    })

    client.once('error', function (err) {
      reject(err)
    })
  })
}

function closeClient (client, force, options) {
  return new Promise((resolve) => {
    client.end(force, options, resolve)
  })
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

function subscribe (client, topic, options) {
  return new Promise((resolve, reject) => {
    client.subscribe(topic, options, function (err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function unsubscribe (client, topic, options) {
  return new Promise((resolve, reject) => {
    client.unsubscribe(topic, options, function (err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

function publish (client, topic, message, options) {
  return new Promise((resolve, reject) => {
    client.publish(topic, message, options, function (err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

module.exports = {
  startClient: startClient,
  closeClient: closeClient,
  subscribe: subscribe,
  unsubscribe: unsubscribe,
  publish: publish,
  createServer: createServer,
  delay: util.promisify(setTimeout)
}
