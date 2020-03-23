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

const options = {
  key: fs.readFileSync('./server.key'),
  cert: fs.readFileSync('./server.cert'),
  rejectUnauthorized: false
}

function initAedes (options) {
  if (!options) options = {}
  options.persistence = persistence()
  options.mq = mqemitter()
  return aedes(options)
}

function listen (server, port, type) {
  return new Promise((resolve, reject) => {
    server.listen(port, (err) => {
      if (err) reject(err)
      else {
        console.log(type, 'server is listening on port', port)
        resolve()
      }
    })
  })
}

async function createServers (aedesHandler) {
  var servers = []
  var ports = [8883, 4000, 1883]
  var types = ['TLS', 'WS', 'TCP']

  servers.push(tls.createServer(options, aedesHandler))
  servers.push(http.createServer())

  const ws = new WebSocket.Server({ server: servers[1] })
  ws.on('connection', function (conn, req) {
    const stream = WebSocket.createWebSocketStream(conn)
    aedesHandler(stream, req)
  })

  servers.push(net.createServer(aedesHandler))

  await Promise.all(servers.map((s, i) => listen(s, ports[i], types[i])))
}

var broker = initAedes()

createServers(broker.handle)

broker.on('client', function (client) {
  var cId = client ? client.id : null
  console.log('Client Connected: \x1b[33m' + cId + '\x1b[0m')
})

// fired when a client disconnects
broker.on('clientDisconnect', function (client) {
  var cId = client ? client.id : null
  console.log('Client Disconnected: \x1b[33m' + cId + '\x1b[0m')
})

broker.on('subscribe', function (subscriptions, client) {
  console.log('MQTT client \x1b[32m' + (client ? client.id : client) +
        '\x1b[0m subscribed to topics: ' + subscriptions.map(s => s.topic).join('\n'))
})

broker.on('unsubscribe', function (subscriptions, client) {
  console.log('MQTT client \x1b[32m' + (client ? client.id : client) +
        '\x1b[0m unsubscribed to topics: ' + subscriptions.join('\n'))
})

broker.on('publish', async function (packet, client) {
  console.log('Client \x1b[31m' + (client ? client.id : 'BROKER_' + broker.id) + '\x1b[0m has published', packet.payload.toString(), 'on', packet.topic)
})
