'use strict'

const WebSocket = require('ws')
const tls = require('tls')
const http = require('http')
const net = require('net')
const aedes = require('aedes')
const { readFileSync } = require('fs')

const env = require('./env')
const DB = env[process.env.DB] || env.default
const persistence = require(DB.persistence.name)
const mqemitter = require(DB.mqemitter.name)

const servers = []

const ports = {
  TLS: 8883,
  WS: 4000,
  TCP: 1883
}

const args = process.argv.filter(arg => ports[arg])

const sockets = new Set()

function addSocket (socket) {
  sockets.add(socket)
  socket.on('close', () => {
    sockets.delete(socket)
  })
}

function destroySockets () {
  for (const s of sockets.values()) {
    s.destroy()
  }
}

const options = {
  key: readFileSync('./server.key'),
  cert: readFileSync('./server.cert'),
  rejectUnauthorized: false
}

function listen (server, proto) {
  return new Promise((resolve, reject) => {
    server.on('connection', addSocket)
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
  persistence: persistence(DB.persistence.options),
  mq: mqemitter(DB.mqemitter.options),
  concurrency: 1000,
  heartbeatInterval: 500
})

createServers(broker.handle)

process.on('SIGTERM', async function () {
  destroySockets()
  await Promise.all(servers.map(s => close(s)))
  process.send('KILLED')
  process.exit(0)
})
