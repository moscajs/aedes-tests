# Aedes Tests

![.github/workflows/ci.yml](https://github.com/moscajs/aedes-tests/workflows/.github/workflows/ci.yml/badge.svg)

Integration/Black Box tests for [Aedes](https://github.com/moscajs/aedes) MQTT Broker. `aedes.js` handles broker setup and runs in a separete process, based on args passed to the process it can init 3 different servers:

- __TLS__: On port _8883_
- __WS__: On port _4000_
- __TCP__: On port _1883_

Each test will start and close a broker process and init MQTT clients using `helper.js` methods.

`server.key` and `server.cert` have been generated using the command:

`openssl req -nodes -new -x509 -keyout server.key -out server.cert`

This files are used by aedes to init a TLS server and by MQTT clients to connect to it
