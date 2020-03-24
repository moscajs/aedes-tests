'use strict'

const { promisify } = require('util')
const mqtt = require('mqtt')
const { fork } = require('child_process')
const { readFileSync } = require('fs')

var brokerProcess

const options = {
  key: readFileSync('./server.key'),
  cert: readFileSync('./server.cert'),
  rejectUnauthorized: false
}

const protos = {
  mqtts: 'mqtts://localhost:8883',
  ws: 'ws://localhost:4000',
  mqtt: 'mqtt://localhost:1883'
}

function startClient (proto) {
  return new Promise((resolve, reject) => {
    if (!proto) proto = 'MQTT'

    if (!protos[proto]) {
      reject(Error('Invalid protocol ' + proto + ' for MQTT client'))
      return
    }

    var client = mqtt.connect(protos[proto], proto === 'mqtts' ? options : null)

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
  if (brokerProcess && !brokerProcess.killed) throw Error('Another process is already running')

  brokerProcess = fork('aedes.js', args)
  return brokerProcess
}

function closeBroker () {
  if (brokerProcess.killed) throw Error('Broker process has been already killed')

  brokerProcess.kill('SIGTERM')
}

module.exports = {
  startClient: startClient,
  startBroker: startBroker,
  closeBroker: closeBroker,
  delay: promisify(setTimeout)
}
