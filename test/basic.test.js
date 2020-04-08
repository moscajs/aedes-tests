'use-strict'

const helper = require('./helper.js')
const { test } = require('tap')
const pMap = require('p-map')

const pMapOptions = {
  concurrency: 4
}

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
  await pMap(clients, c => c.subscribe('my/topic'), pMapOptions)
  await pMap(clients, c => c.publish('my/topic', 'I\'m client ' + c._client.options.clientId), pMapOptions)
  await pMap(clients, c => c.end(), pMapOptions)
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

  for (let i = 0; i < 10; i++) {
    subscribers.push(helper.startClient())
  }

  subscribers = await Promise.all(subscribers)

  // subscribe all subscribers
  await pMap(subscribers, s => s.subscribe(msg.topic), pMapOptions)

  var publisher = await helper.startClient()

  publisher._client.publish(msg.topic, msg.payload, msg, helper.noError.bind(this, t))

  var messages = await pMap(subscribers, s => helper.receiveMessage(s, t), pMapOptions)

  for (const m of messages) {
    t.equal(m.topic, msg.topic, 'Message received')
  }

  await pMap(subscribers, c => c.end(), pMapOptions)
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

  publisher._client.publish('my/topic', 'I\'m alive', { qos: 1 }, helper.noError.bind(this, t))

  var message = await helper.receiveMessage(publisher, t)

  t.equal(message.topic, 'my/topic', 'Subscription has been restored')

  await publisher.end()
})

test('Client receives retained messages on connect', async function (t) {
  t.plan(10)
  t.tearDown(helper.closeBroker)

  await helper.startBroker()

  var publisher = await helper.startClient()

  const options = { qos: 1, retain: true }

  var levels = ['retained', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']

  // also test a wrong retain
  await publisher.publish('test/retainedd', 'Test 0', options)
  await publisher.publish('no/retained', 'Test 2', options)

  for (let i = 0; i < levels.length; i++) {
    await publisher.publish('test/' + levels.slice(0, i + 1).join('/'), 'Test' + i.toString(), options)
  }

  await publisher.end()

  publisher = await helper.startClient()

  await publisher.subscribe('test/retained/#')

  function receiveRetained () {
    return new Promise((resolve, reject) => {
      var received = 0
      publisher.on('message', function (topic, message) {
        t.pass('Retained message ' + topic + ' received from sub test/retained/#')
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

  // use mqtt client `stream.destroy` to get an unexpected disconnect from broker
  // we use `_client` to access original mqtt client object as we are using `async-mqtt`
  client._client.stream.destroy()

  var will = await helper.receiveMessage(client2, t)

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
      'a//': true,
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
      const passMessage = 'Publish to ' + pub + (result ? '' : ' NOT') + ' received by subscriber ' + sub

      publisher._client.publish(pub, 'Test wildecards', options, helper.noError.bind(this, t))

      try {
        var message = await helper.receiveMessage(subscriber, t, !result)
        t.equal((result && message.topic === pub) || !result, true, passMessage)
      } catch (error) {
        t.threw(error)
      }

      await publisher.end()
      await subscriber.end()
    }
  }
})
