'use strict'

const { promisify } = require('util')
const mqtt = require('mqtt')

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

module.exports = {
  startClient: startClient,
  delay: promisify(setTimeout)
}
