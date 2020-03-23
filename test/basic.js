'use-strict'

const helper = require('./helper.js')
const { test } = require('tap')

const { fork } = require('child_process')

const brokerProcess = fork('aedes.js')

test('Connect-Publish-Disconnect 1000 clients', async function (t) {
  const total = 1000

  const connects = []
  for (var i = 0; i < total; i++) {
    connects.push(helper.startClient())
  }

  var clients = await Promise.all(connects)
  await Promise.all(clients.map(c => c.publish('my/topic', 'I\'m client ' + c.options.clientId)))
  await Promise.all(clients.map(c => c.end()))

  brokerProcess.kill()
})
