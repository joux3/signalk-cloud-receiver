const WebSocket = require('ws')

const MAX_INFLIGHT_MESSAGES = 100

const receiverUrl = process.argv[2] || console.log('url needed') || process.exit(1)
const testCount = Number(process.argv[3] || console.log('count needed') || process.exit(2))

const ws = new WebSocket(receiverUrl)

let ackedPackets = 0
let startTime
let sentPackets = 0
ws.on('open', () => {
  startTime = new Date()
  console.log("connected to receiver!")
  ws.send('silvio')
  for (let i = 0; i < Math.min(MAX_INFLIGHT_MESSAGES, testCount); i++) {
    ws.send(generatePacket())
  }
})
ws.on('message', (msg) => {
  const parsed = JSON.parse(msg)
  if (typeof parsed.ACK === 'number') {
    ackedPackets++
  } else if (parsed.ERRACK) {
    console.log("Got ERRACK!", parsed)
  }
  if (ackedPackets >= testCount) {
    console.log("done.", testCount, "packets took", new Date() - startTime,"ms")
    process.exit(0)
  } else if (sentPackets < testCount) {
    ws.send(generatePacket())
  }
})

let currentTime = new Date().getTime() - 43200633513
let lastPath = 0
function generatePacket() {
  const paths = ['navigation.speedOverGround', 'navigation.courseOverGroundTrue', 'navigation.logTrip',
  'navigation.log', 'environment.depth.belowTransducer', 'environment.water.temperature', 'navigation.headingTrue',
  'navigation.magneticVariation', 'navigation.position', 'environment.current', 'navigation.speedThroughWater']

  function rand(min, max) {
    return min + Math.random() * (max - min)
  }

  currentTime++
  const pathGenerators = {
    'navigation.position': () => {
      return {"longitude": rand(-30, 30), "latitude": rand(-30, 30)}
    },
    'environment.current': () => {
      return {"setTrue": rand(-2, 2), "drift": rand(-0.2, 0.2)}
    }
  }
  function defaultGenerator() {
    return rand(-10, 10)
  }

  const path = paths[lastPath]
  lastPath = (lastPath + 1) % paths.length
  const generator = pathGenerators[path] || defaultGenerator

  return JSON.stringify({
    "updates": [{
      "source": {"label": "n2kFromFile", "type": "NMEA2000", "pgn": 127250, "src": "2"},
      "timestamp": new Date(currentTime++).toISOString(),
      "values": [{"path": path, "value": generator()}]
    }],
    "context": "vessels.parrentestivene:uuuid:912419jieajfiaejia", "msgId": sentPackets++
  })
}
