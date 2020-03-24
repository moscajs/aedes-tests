# Aedes Tests

Integration/Black Box tests for Aedes MQTT Broker. `aedes.js` will handle broker setup and is started in a separete process, based on args passed to the process it will init 3 different servers:

- __TLS__: On port _8883_
- __WS__: On port _4000_
- __TCP__: On port _1883_

All tests are done against that broker that will always run in a separete process, each test will start and close a broker process.

`server.key` and `server.cert` have been generated using the command:

`openssl req -nodes -new -x509 -keyout server.key -out server.cert`

This files are used by aedes to init a TLS server and from MQTT clients to connect to it
