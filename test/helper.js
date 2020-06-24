'use strict'

const { promisify } = require('util')
const mqtt = require('async-mqtt')
const { fork } = require('child_process')
const { readFileSync } = require('fs')

var brokerProcess

const credentials = {
  key: readFileSync('./server.key'),
  cert: readFileSync('./server.cert'),
  rejectUnauthorized: false
}

const protos = {
  mqtts: 'mqtts://localhost:8883',
  ws: 'ws://localhost:4000',
  mqtt: 'mqtt://localhost:1883'
}

function startClient (proto, options, noAsync) {
  if (!proto) proto = 'mqtt'

  if (!protos[proto]) {
    throw Error('Invalid protocol ' + proto + ' for MQTT client')
  }

  options = options || {}

  if (proto === 'mqtts') {
    Object.assign(options, credentials)
  }

  return mqtt[noAsync ? 'connect' : 'connectAsync'](protos[proto], options)
}

function startBroker (args) {
  return new Promise((resolve, reject) => {
    if (brokerProcess && !brokerProcess.killed) {
      reject(Error('Another process is already running'))
      return
    }

    brokerProcess = fork('aedes.js', args)

    brokerProcess.once('message', function (message) {
      if (message.state === 'ready') {
        resolve(brokerProcess)
      }
    })
  })
}

// makes the test t fail if an error is thrown
function noError (t, err) {
  if (err) { t.threw(err) }
}

function closeBroker (cb) {
  return new Promise((resolve, reject) => {
    if (brokerProcess.killed) {
      reject(Error('Broker process has been already killed'))
      return
    }

    brokerProcess.once('message', function (message) {
      if (message.state === 'killed') {
        resolve()
      }
    })
    brokerProcess.kill('SIGTERM')
  })
}

module.exports = {
  startClient: startClient,
  startBroker: startBroker,
  closeBroker: closeBroker,
  noError: noError,
  delay: promisify(setTimeout)
}
