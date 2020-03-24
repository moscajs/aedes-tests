'use strict'

const WebSocket = require('ws')
const tls = require('tls')
const http = require('http')
const net = require('net')
const aedes = require('aedes')
const { readFileSync } = require('fs')

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

const args = process.argv.filter(arg => ports[arg])

const options = {
  key: readFileSync('./server.key'),
  cert: readFileSync('./server.cert'),
  rejectUnauthorized: false
}

function listen (server, proto) {
  return new Promise((resolve, reject) => {
    server.listen(ports[proto], (err) => {
      if (err) reject(err)
      else {
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
  var protos = args && args.length > 0 ? args : ['TLS', 'WS', 'TCP']

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

  process.send('STARTED')
}

var broker = aedes({
  persistence: persistence(),
  mq: mqemitter(),
  concurrency: 1000
})

createServers(broker.handle)

process.on('SIGTERM', async function () {
  await Promise.all(servers.map(s => close(s)))
  process.send('KILLED')
  process.exit(0)
})
