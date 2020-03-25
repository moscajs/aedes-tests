'use strict'

const { promisify } = require('util')
const mqtt = require('mqtt')
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

function startClient (proto, options) {
  return new Promise((resolve, reject) => {
    if (!proto) proto = 'mqtt'

    if (!protos[proto]) {
      reject(Error('Invalid protocol ' + proto + ' for MQTT client'))
      return
    }

    options = options || {}

    if (proto === 'mqtts') {
      Object.assign(options, credentials)
    }

    var client = mqtt.connect(protos[proto], options)

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
  delay: promisify(setTimeout)
}
