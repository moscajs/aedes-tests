'use-strict'

const helper = require('./helper.js')
const { test } = require('tap')

test('Connect-Subscribe-Publish-Disconnect 300 clients using WS and MQTT/MQTTS protocols', async function (t) {
  t.tearDown(helper.closeBroker)

  await helper.startBroker()

  const total = 300

  const protos = ['mqtts', 'ws', 'mqtt']

  const connects = []
  for (var i = 0; i < total; i++) {
    connects.push(helper.startClient(protos[i % 3]))
  }

  var clients = await Promise.all(connects)
  await Promise.all(clients.map(c => c.subscribe('my/topic')))
  await Promise.all(clients.map(c => c.publish('my/topic', 'I\'m client ' + c.options.clientId)))
  await Promise.all(clients.map(c => c.end()))
})

test('Subscribed clients receive updates', async function (t) {
  t.plan(10, 'each client should receive a message')
  t.tearDown(helper.closeBroker)

  await helper.startBroker()

  var msg = {
    topic: 'subscribers/topic',
    payload: 'Hello world',
    qos: 1,
    retain: false
  }

  var subscribers = []
  for (let i = 0; i < 10; i++) {
    subscribers.push(helper.startClient())
  }

  subscribers = await Promise.all(subscribers)

  function onMessage (topic, message) {
    if (topic === msg.topic) {
      t.pass('message received')
    }
  }

  for (let i = 0; i < subscribers.length; i++) {
    const client = subscribers[i]
    await client.subscribe(msg.topic)
    client.once('message', onMessage)
  }

  var publisher = await helper.startClient()

  await publisher.publish(msg.topic, msg.payload, msg)
  await helper.delay(100)

  await Promise.all(subscribers.map(c => c.end()))
  await publisher.end()
})

test('Connect clean=false', async function (t) {
  t.plan(1)
  t.tearDown(helper.closeBroker)

  const options = { clientId: 'pippo', clean: false }

  await helper.startBroker()

  var publisher = await helper.startClient('mqtt', options)

  await publisher.subscribe('my/topic')

  await publisher.end(true)

  publisher = await helper.startClient('mqtt', options)

  publisher.on('message', async function (topic, message) {
    if (topic === 'my/topic') {
      t.pass('Subscription has been restored')
    }
    await publisher.end()
  })

  await publisher.publish('my/topic', 'I\'m alive', { qos: 1 })

  await helper.delay(200)
})

test('Client receives retained messages on connect', async function (t) {
  t.plan(10)
  t.tearDown(helper.closeBroker)

  await helper.startBroker()

  var publisher = await helper.startClient()

  const options = { qos: 1, retain: true }
  var received = 0

  for (let i = 0; i < 10; i++) {
    await publisher.publish('test/retained/' + i, i.toString(), options)
  }

  await publisher.end()

  publisher = await helper.startClient()

  await publisher.subscribe('test/retained/#')

  publisher.on('message', async function (topic, message) {
    t.pass('Retained message received')
    if (++received === 10) {
      await publisher.end()
    }
  })

  await helper.delay(200)
})
