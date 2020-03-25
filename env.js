module.exports = {
  mongo: {
    mqemitter: {
      name: 'mqemitter-mongodb',
      options: {
        url: 'mongodb://127.0.0.1/mqemitter'
      }
    },
    persistence: {
      name: 'aedes-persistence-mongodb',
      options: {}
    },
    clusters: true
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
    clusters: true
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
    clusters: false
  }
}
