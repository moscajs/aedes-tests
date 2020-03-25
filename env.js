module.exports = {
  mongo: {
    mqemitter: {
      name: 'mqemitter-mongodb',
      options: {},
      clusters: true
    },
    persistence: {
      name: 'aedes-persistence-mongodb',
      options: {},
      clusters: true
    }
  },
  redis: {
    mqemitter: {
      name: 'mqemitter-redis',
      options: {},
      clusters: true
    },
    persistence: {
      name: 'aedes-persistence-redis',
      options: {},
      clusters: true
    }
  },
  default: {
    mqemitter: {
      name: 'mqemitter',
      options: {},
      clusters: false
    },
    persistence: {
      name: 'aedes-persistence',
      options: {},
      clusters: false
    }
  }
}
