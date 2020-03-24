'use strict'

const { promisify } = require('util')
const mqtt = require('mqtt')
const { fork } = require('child_process')

var brokerProcess

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
