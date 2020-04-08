'use strict'

var clean = require('mongo-clean')
var cleanopts = {
  action: 'deleteMany'
}

module.exports = {
  mongo: {
    mqemitter: {
      name: 'mqemitter-mongodb',
      options: {
        url: 'mongodb://127.0.0.1/aedes'
      }
    },
    persistence: {
      name: 'aedes-persistence-mongodb',
      options: {
        url: 'mongodb://127.0.0.1/aedes'
      }
    },
    clusters: true,
    waitForReady: true,
    cleanDb: function (persistence, cb) {
      clean(persistence._db, cleanopts, function (err, db) {
        if (err) {
          return cb(err)
        }
        cb()
      })
    }
  },
  redis: {
    mqemitter: {
      name: 'mqemitter-redis',
      options: {}
    },
    persistence: {
      name: 'aedes-persistence-redis',
      options: {}
    },
    clusters: true,
    waitForReady: true,
    cleanDb: function (persistence, cb) {
      persistence._db.flushall(cb)
    }
  },
  default: {
    mqemitter: {
      name: 'mqemitter',
      options: {}
    },
    persistence: {
      name: 'aedes-persistence',
      options: {}
    },
    clusters: false,
    waitForReady: false
  }
}
