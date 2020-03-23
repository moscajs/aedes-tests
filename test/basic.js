'use-strict'

const helper = require('./helper.js')
const { test } = require('tap')

test('Connect-Publish-Disconnect 1000 clients', async function (t) {
  const aedes = helper.initAedes()
  const server = await helper.createServer(aedes.handle)
  const total = 1000
  var connected = 0
  var disconnected = 0
  var published = 0

  aedes.on('client', function (c) {
    connected++
  })

  aedes.on('clientDisconnect', function (c) {
    disconnected++
  })

  aedes.on('clientError', function (c, error) {
    t.error('Client error')
  })

  aedes.on('publish', function (packet, client) {
    // ignore $SYS topics
    if (packet.topic === 'my/topic') {
      published++
    }
  })

  const connects = []
  for (var i = 0; i < total; i++) {
    connects.push(helper.startClient())
  }

  var clients = await Promise.all(connects)
  await Promise.all(clients.map(c => c.publish('my/topic', 'I\'m client ' + c.id)))
  await Promise.all(clients.map(c => c.end()))

  await helper.delay(2000)

  t.equal(connected, total, 'All clients connected successfully')
  t.equal(published, total, 'All clients made a publish successfully')
  t.equal(disconnected, total, 'All clients disconnected successfully')

  t.tearDown(helper.closeAll.bind(t, aedes, server))
})
