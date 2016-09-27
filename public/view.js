var map = L.map('map').setView([60.148665, 24.949106], 14);

L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	maxZoom: 19,
	attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map)

createConnection()

function createConnection() {
  var ws = new WebSocket("ws://" + window.location.host + "/signalk-output")
  connStatus("Connecting") 
  ws.onopen = function() {
    connStatus("Connected") 
  }

  ws.onclose = function() {
    connStatus("Closed") 
    setTimeout(createConnection, 1000)
  }

  var initialReceived = false
  var state = {}
  ws.onmessage = function(event) {
    var msg = JSON.parse(event.data)
    if (!initialReceived) {
      initialReceived = true
      state = msg
      renderState(state)
    } else {
      state = R.assocPath(msg.path.split('.'), {value: msg.value, timestamp: msg.timestamp}, state)
      renderState(state, msg.path)
    }
  }
}

function connStatus(status) {
  $("#conn_status").text(status)
}

var boatIcon = L.icon({
  iconUrl: 'boat_icon.png',
  iconSize: [50, 28],
  iconAnchor: [25, 14],
  className: "boat-icon"
})

var boatMarker
function renderState(state, updatePath) {
  var vessel = state && state.vessels && state.vessels[Object.keys(state.vessels)[0]]
  if (!vessel) {
    return
  }

  var position = R.path(['navigation', 'position'], vessel)
  if (position) {
    if (boatMarker) {
      boatMarker.setLatLng([position.value.latitude, position.value.longitude])
    } else {
      boatMarker = L.marker([position.value.latitude, position.value.longitude], {icon: boatIcon}).addTo(map)
    }
    map.panTo([position.value.latitude, position.value.longitude])
  }

  var heading = R.path(['navigation', 'courseOverGroundTrue'], vessel) || R.path(['navigation', 'headingTrue'], vessel) || 
    R.path(['navigation', 'headingMagnetic'], vessel)
  if (heading && boatMarker) {
    var degrees = (heading.value / (2*Math.PI)) * 360 - 90
    boatMarker.setRotationAngle(degrees)
  }

  var speed = R.path(['navigation', 'speedThroughWater'], vessel)
  if (speed) {
    $("#speedThroughWater span").text(parseFloat(Math.round(speed.value * 10) / 10).toFixed(1))
  }
}
