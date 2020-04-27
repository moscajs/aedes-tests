'use strict'

const WebSocket = require('ws')
const tls = require('tls')
const http = require('http')
const net = require('net')
const aedes = require('aedes')
const { readFileSync } = require('fs')
const cluster = require('cluster')
const pMap = require('p-map')

const env = require('./env')
const DB = env[process.env.DB] || env.default
const noCluster = process.env.NO_CLUSTERS === 'true'

const persistence = require(DB.persistence.name)
const mqemitter = require(DB.mqemitter.name)

const servers = []
const isMasterCluster = cluster.isMaster && DB.clusters && !noCluster

process.send = process.send || function () { } // for testing

const ports = {
  TLS: 8883,
  WS: 4000,
  TCP: 1883
}

const args = process.argv.filter(arg => ports[arg])

const sockets = new Set()

function addSocket(socket) {
  sockets.add(socket)
  socket.on('close', () => {
    sockets.delete(socket)
  })
}

function destroySockets() {
  for (const s of sockets.values()) {
    s.destroy()
  }
}

const options = {
  key: readFileSync('./server.key'),
  cert: readFileSync('./server.cert'),
  rejectUnauthorized: false
}

function listen(server, proto) {
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

function close(server) {
  return new Promise((resolve, reject) => {
    if (server.listening) {
      server.close(function (err) {
        if (err) reject(err)
        else resolve()
      })
    } else {
      resolve()
    }
  })
}

async function init(cb) {
  var broker = aedes({
    id: 'BROKER_' + (cluster.isMaster ? 1 : cluster.worker.id),
    persistence: persistence(DB.persistence.options),
    mq: mqemitter(DB.mqemitter.options),
    concurrency: 1000,
    heartbeatInterval: 500
  })

  broker.authenticate = function (client, username, password, callback) {
    var error = null
    var success = true
    if (username === 'user' && password.toString() === 'notallowed') {
      error = new Error('Auth error')
      error.returnCode = 4
    }

    callback(error, success)
  }

  if (DB.waitForReady) {
    await cleanPersistence(broker)
  }

  await createServers(broker.handle)
}

function cleanPersistence(broker) {
  return new Promise((resolve, reject) => {
    broker.persistence.once('ready', function () {
      DB.cleanDb(broker.persistence, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  })
}

async function createServers(aedesHandler) {
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

  await pMap(servers, (s, i) => listen(s, protos[i]), { concurrency: 1 })

  process.send({ state: 'ready' })
}

process.on('SIGTERM', async function () {
  if (isMasterCluster) {
    for (const id in cluster.workers) {
      cluster.workers[id].kill('SIGTERM')
    }
  } else {
    destroySockets()
    await pMap(servers, s => close(s), { concurrency: 1 })
    if (cluster.isWorker) {
      cluster.worker.kill()
    } else {
      process.send({ state: 'killed' })
      process.exit(0)
    }
  }
})

if (isMasterCluster) {
  const numWorkers = require('os').cpus().length
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork(process.env)
  }

  cluster.on('message', function (worker, message) {
    if (message.state === 'ready') {
      cluster.workers[worker.id].isReady = true

      var allReady = true

      for (const id in cluster.workers) {
        if (!cluster.workers[id].isReady) {
          allReady = false
          break
        }
      }

      if (allReady) {
        process.send({ state: 'ready' })
      }
    }
  })

  cluster.on('exit', function (worker, code, signal) {
    if (Object.keys(cluster.workers).length === 0) {
      try {
        process.send({ state: 'killed' })
      } catch (error) {
        console.log(error.message)
      }
    }
  })
} else {
  init()
    .catch(error => {
      console.log('Unable to start Aedes Broker')
      console.error(error)
      process.exit(1)
    })
}
