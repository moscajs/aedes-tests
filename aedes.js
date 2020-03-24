'use strict'

const WebSocket = require('ws')
const tls = require('tls')
const http = require('http')
const net = require('net')
const aedes = require('aedes')
const fs = require('fs')

const DB = process.env.DB
var persistence = 'aedes-persistence' + (DB ? '-' + DB : '')
var mqemitter = 'mqemitter' + (DB ? '-' + DB : '')

persistence = require(persistence)
mqemitter = require(mqemitter)

const servers = []

const ports = {
  TLS: 8883,
  WS: 4000,
  TCP: 1883
}

const options = {
  key: fs.readFileSync('./server.key'),
  cert: fs.readFileSync('./server.cert'),
  rejectUnauthorized: false
}

function listen (server, proto) {
  return new Promise((resolve, reject) => {
    server.listen(ports[proto], (err) => {
      if (err) reject(err)
      else {
        console.log(proto, 'server is listening on port', ports[proto])
        resolve()
      }
    })
  })
}

function close (server) {
  return new Promise((resolve, reject) => {
    server.close(function (err) {
      if (err) reject(err)
      else resolve()
    })
  })
}

async function createServers (aedesHandler) {
  var protos = process.args || ['TLS', 'WS', 'TCP']

  for (let i = 0; i < protos.length; i++) {
    if (protos[i] === 'TLS') {
      servers.push(tls.createServer(options, aedesHandler))
    } else if (protos[i] === 'WS') {
      var server = http.createServer()
      servers.push(server)
      const ws = new WebSocket.Server({ server: server })
      ws.on('connection', function (conn, req) {
        const stream = WebSocket.createWebSocketStream(conn)
        aedesHandler(stream, req)
      })
    } else if (protos[i] === 'TCP') {
      servers.push(net.createServer(aedesHandler))
    } else {
      throw Error('Invalid protocol ' + protos[i])
    }
  }

  await Promise.all(servers.map((s, i) => listen(s, protos[i])))
}

console.log('Setting up Aedes broker with', DB || 'in memory', 'persistence')

var broker = aedes({
  persistence: persistence(),
  mq: mqemitter()
})

createServers(broker.handle)

process.on('SIGTERM', async function () {
  await Promise.all(servers.map(s => close(s)))
  process.exit(0)
})

// broker.on('client', function (client) {
//   var cId = client ? client.id : null
//   console.log('Client Connected: \x1b[33m' + cId + '\x1b[0m')
// })

// broker.on('clientDisconnect', function (client) {
//   var cId = client ? client.id : null
//   console.log('Client Disconnected: \x1b[33m' + cId + '\x1b[0m')
// })

// broker.on('subscribe', function (subscriptions, client) {
//   console.log('MQTT client \x1b[32m' + (client ? client.id : client) +
//         '\x1b[0m subscribed to topics: ' + subscriptions.map(s => s.topic).join('\n'))
// })

// broker.on('unsubscribe', function (subscriptions, client) {
//   console.log('MQTT client \x1b[32m' + (client ? client.id : client) +
//         '\x1b[0m unsubscribed to topics: ' + subscriptions.join('\n'))
// })

// broker.on('publish', async function (packet, client) {
//   console.log('Client \x1b[31m' + (client ? client.id : 'BROKER_' + broker.id) + '\x1b[0m has published', packet.payload.toString(), 'on', packet.topic)
// })
