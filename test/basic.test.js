'use-strict'

const helper = require('./helper.js')
const { test } = require('tap')
const pMap = require('p-map')
const { once } = require('events')

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

test('Unhautorized client', async function (t) {
  t.tearDown(helper.closeBroker)
  t.plan(1)

  await helper.startBroker()
  var client = helper.startClient('mqtt', { username: 'user', password: 'notallowed' }, true)._client
  var [err] = await once(client, 'error')
  t.equal(err.code, 4, 'Connection should be rejected with code 4')
  client.end()
})

async function testQos (t, qos) {
  var total = 10
  t.plan(total, 'each client should receive a message')
  t.tearDown(helper.closeBroker)

  await helper.startBroker()

  var msg = {
    topic: 'subscribers/topic',
    payload: 'Hello world',
    qos: qos,
    retain: true
  }

  var subscribers = []
  var received = {}

  for (let i = 0; i < total; i++) {
    subscribers.push(helper.startClient(null, { clientId: 'subscriber_' + i }))
  }

  subscribers = await Promise.all(subscribers)

  // subscribe all subscribers
  await pMap(subscribers, s => s.subscribe(msg.topic), pMapOptions)

  var publisher = await helper.startClient()

  function onMessage (client, topic) {
    var clientId = client._client.options.clientId
    if (received[clientId]) {
      t.fail('Duplicated message received')
    } else {
      t.equal(topic, msg.topic, 'Message received from ' + clientId)
      received[clientId] = true
      if (Object.keys(received).length === 10) {
        pMap(subscribers, c => c.end(), pMapOptions)
          .then(() => publisher.end())
          .catch(t.error.bind(t))
      }
    }
  }

  for (const sub of subscribers) {
    sub.on('message', onMessage.bind(this, sub))
  }

  await publisher.publish(msg.topic, msg.payload, msg)
}

test('Subscribed clients receive updates - QoS 1', function (t) {
  testQos(t, 1)
    .catch(t.error.bind(t))
})

test('Subscribed clients receive updates - QoS 2', function (t) {
  testQos(t, 2)
    .catch(t.error.bind(t))
})

test('Connect clean=false', function (t) {
  t.plan(1)
  t.tearDown(helper.closeBroker)

  async function doTest () {
    const options = { clientId: 'pippo', clean: false }

    await helper.startBroker()

    var publisher = await helper.startClient('mqtt', options)

    await publisher.subscribe('my/topic')

    await publisher.end(true)

    publisher = await helper.startClient('mqtt', options)

    publisher.on('message', function (topic) {
      t.equal(topic, 'my/topic', 'Subscription has been restored')
      publisher.end().catch(t.error.bind(t))
    })

    await publisher.publish('my/topic', 'I\'m alive', { qos: 1 }, helper.noError.bind(this, t))
  }

  doTest().catch(t.error.bind(t))
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

test('Wildecard subscriptions', function (t) {
  t.tearDown(helper.closeBroker)

  async function test () {
    await helper.startBroker()

    const options = {
      qos: 1,
      retain: false
    }

    var subscriptions = {
      '#': {
        a: true,
        'a/b': true,
        'a/b/c': true,
        'b/a/c': true
      },
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

    function onMessage (topic) {
      const ctx = this
      const passMessage = 'Publish to ' + ctx.pub + (ctx.result ? '' : ' NOT') + ' received by subscriber ' + ctx.sub
      if ((ctx.result && topic === ctx.pub) || (!ctx.result && topic === 'on/done')) {
        t.pass(passMessage)
      } else {
        t.fail(passMessage)
      }
      ctx.publisher.end()
        .then(() => ctx.subscriber.end())
        .finally(ctx.resolve)
    }

    function testPubSub (pub, sub, result, publisher, subscriber) {
      return new Promise((resolve, reject) => {
        subscriber.on('message', onMessage.bind({ pub, sub, result, publisher, subscriber, resolve }))
        publisher._client.publish(pub, 'Test wildecards', options, helper.noError.bind(this, t))
        if (!result) {
          publisher._client.publish('on/done', 'Test wildecards', options, helper.noError.bind(this, t))
        }
      })
    }

    for (const sub in subscriptions) {
      for (const pub in subscriptions[sub]) {
        var publisher = await helper.startClient()
        var subscriber = await helper.startClient()
        var result = subscriptions[sub][pub]

        await subscriber.subscribe(sub, options)
        if (!result) {
          await subscriber.subscribe('on/done')
        }
        await testPubSub(pub, sub, result, publisher, subscriber)
      }
    }
  }

  test().catch(t.error.bind(t))
})
