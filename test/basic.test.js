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

async function testQos (t, qos) {
  t.plan(10, 'each client should receive a message')
  t.tearDown(helper.closeBroker)

  await helper.startBroker()

  var msg = {
    topic: 'subscribers/topic',
    payload: 'Hello world',
    qos: qos,
    retain: true
  }

  var subscribers = []
  var received = 0

  for (let i = 0; i < 10; i++) {
    subscribers.push(helper.startClient())
  }

  subscribers = await Promise.all(subscribers)

  function onMessage (topic, message) {
    if (topic === msg.topic) {
      if (received++ < 10 || qos === 2) {
        t.pass('message received')
      }
    }
  }

  for (let i = 0; i < subscribers.length; i++) {
    const client = subscribers[i]
    await client.subscribe(msg.topic)
    client.once('message', onMessage)
  }

  var publisher = await helper.startClient()

  await publisher.publish(msg.topic, msg.payload, msg)
  await helper.delay(500)

  await Promise.all(subscribers.map(c => c.end()))
  await publisher.end()
}

test('Subscribed clients receive updates - QoS 1', async function (t) {
  await testQos(t, 1)
})

test('Subscribed clients receive updates - QoS 2', async function (t) {
  await testQos(t, 2)
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

  await publisher.publish('my/topic', 'I\'m alive', { qos: 1 })

  var message = await helper.receiveMessage(publisher)

  t.equal(message.topic, 'my/topic', 'Subscription has been restored')

  await publisher.end()
})

test('Client receives retained messages on connect', async function (t) {
  t.plan(10)
  t.tearDown(helper.closeBroker)

  await helper.startBroker()

  var publisher = await helper.startClient()

  const options = { qos: 1, retain: true }

  for (let i = 0; i < 10; i++) {
    await publisher.publish('test/retained/' + i, i.toString(), options)
  }

  await publisher.end()

  publisher = await helper.startClient()

  await publisher.subscribe('test/retained/#')

  function receiveRetained () {
    return new Promise((resolve, reject) => {
      var received = 0
      publisher.on('message', function (topic, message) {
        t.pass('Retained message received')
        if (++received === 10) resolve()
      })
    })
  }

  await receiveRetained()
  await publisher.end()
})

test('Will message', async function (t) {
  t.plan(1)
  t.tearDown(helper.closeBroker)

  await helper.startBroker()

  var client = await helper.startClient('mqtt', {
    will: {
      topic: 'my/will',
      payload: 'I\'m dead',
      qos: 1,
      retain: false
    },
    reconnectPeriod: 100
  })

  var client2 = await helper.startClient()

  await client2.subscribe('my/will', { qos: 1 })

  client.stream.destroy()

  var will = await helper.receiveMessage(client2, 2000)

  t.equal(will.topic, 'my/will', 'Will received')

  await client.end()
  await client2.end()
})

test('Wildecard subscriptions', async function (t) {
  t.tearDown(helper.closeBroker)

  await helper.startBroker()

  const options = {
    qos: 1,
    retain: false
  }

  var subscriptions = {
    'a/#': {
      a: true,
      'a/b': true,
      'a/b/c': true,
      'b/a/c': false
    },
    'a/+/+': {
      'a/b/c': true,
      'a/a/c': true,
      'a/b/c/d': false,
      'b/c/d': false
    }
  }

  var plan = 0
  for (const sub in subscriptions) {
    plan += Object.keys(subscriptions[sub]).length
  }

  t.plan(plan)

  for (const sub in subscriptions) {
    for (const pub in subscriptions[sub]) {
      const result = subscriptions[sub][pub]
      var publisher = await helper.startClient()
      var subscriber = await helper.startClient()
      await subscriber.subscribe(sub, options)
      const passMessage = 'Publish to ' + pub + ' received by subscriber ' + sub

      await publisher.publish(pub, 'Test wildecards', options)

      try {
        var message = await helper.receiveMessage(subscriber, 1000)
        t.equal(message.topic === pub && result, true, passMessage)
      } catch (error) {
        t.equal(error.message === 'Timeout' && !result, true, passMessage)
      }

      await publisher.end()
      await subscriber.end()
    }
  }
})
