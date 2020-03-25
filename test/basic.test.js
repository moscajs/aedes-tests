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

test('Subscribed clients receive updates - QoS 1', async function (t) {
  t.plan(20, 'each client should receive a message')
  t.tearDown(helper.closeBroker)

  await helper.startBroker()

  async function testQos (qos) {
    var msg = {
      topic: 'subscribers/topic',
      payload: 'Hello world',
      qos: qos,
      retain: false
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
    await helper.delay(100)

    await Promise.all(subscribers.map(c => c.end()))
    await publisher.end()
  }

  await testQos(1)
  await testQos(2)
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

  publisher.on('message', function (topic, message) {
    if (topic === 'my/topic') {
      t.pass('Subscription has been restored')
    }
  })

  await publisher.publish('my/topic', 'I\'m alive', { qos: 1 })

  await helper.delay(200)
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

  publisher.on('message', function (topic, message) {
    t.pass('Retained message received')
  })

  await helper.delay(200)
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

  client2.on('message', function (topic, message) {
    if (topic === 'my/will') {
      t.pass('Will received')
    }
  })

  client.stream.destroy()

  await helper.delay(200)
  await client.end()
  await client2.end()
})

test('Wildecard subscriptions', async function (t) {
  t.tearDown(helper.closeBroker)

  await helper.startBroker()

  const options = {
    qos: 0,
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

  var publisher = await helper.startClient()
  var subscriber = await helper.startClient()

  function testReceive (sub, pub, result) {
    return new Promise((resolve) => {
      var timeout = null

      subscriber.once('message', function (topic, message) {
        if (timeout) {
          clearTimeout(timeout)
        }

        if (result && topic === pub) {
          resolve(true)
        } else {
          resolve(false)
        }
      })

      subscriber.subscribe(sub, options)
        .then(() => publisher.publish(pub, 'Test wildecards', options))
        .catch((e) => resolve(false))

      if (!result) {
        timeout = setTimeout(resolve(true), 200)
      }
    })
  }

  for (const sub in subscriptions) {
    for (const pub in subscriptions[sub]) {
      const result = subscriptions[sub][pub]
      const passMessage = 'Test publish to ' + pub + (result ? ' ' : ' not ') + 'received by subscriber ' + sub
      var success = await testReceive(sub, pub, result)
      await subscriber.unsubscribe(sub)

      if (success) {
        t.pass(passMessage)
      } else {
        t.error(passMessage)
      }
    }
  }

  await publisher.end()
  await subscriber.end()
})
