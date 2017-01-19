var map = L.map('map')

L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	maxZoom: 19,
	attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map)

createConnection()

var state = {}
var ws
function createConnection() {
  ws = new WebSocket(window.location.protocol.replace('http', 'ws') + "//" + window.location.host + "/signalk-output")
  connStatus("Connecting") 
  ws.onopen = function() {
    connStatus("Connected") 
  }

  ws.onclose = function() {
    connStatus("Closed") 
    setTimeout(createConnection, 1000)
  }

  var initialReceived = false
  ws.onmessage = function(event) {
    var msg = JSON.parse(event.data)
    var type = msg.type
    if (type === 'state') {
      if (!initialReceived) {
        initialReceived = true
        state = msg.data
        renderState({firstRender: true})
      } else {
        state = R.assocPath(msg.data.path.split('.'), {value: msg.data.value, timestamp: msg.data.timestamp}, state)
        renderState({updatePath: msg.data.path})
      }
    } else if (type === 'boatTrack') {
      if (selectedBoat === msg.vesselId) {
        var latLngs = msg.positions.map(function(position) {
          return [position.value.latitude, position.value.longitude]
        })
        if (boatTrack) {
          boatTrack.remove()
        }
        boatTrack = L.polyline(latLngs, {color: 'red'}).addTo(map);
      }
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

var selectedBoat
var boatMarkers = {}
var boatTrack
function renderState(opts) {
  var vessels = state && state.vessels || {}

  $('#no-boat').toggle(!selectedBoat)
  $('#active-boat').toggle(!!selectedBoat)
  Object.keys(vessels).forEach(function(vesselId) {
    var vessel = vessels[vesselId]

    var position = R.path(['navigation', 'position'], vessel)
    var boatMarker = boatMarkers[vesselId]
    if (position) {
      if (boatMarker) {
        boatMarker.setLatLng([position.value.latitude, position.value.longitude])
      } else {
        boatMarker = L.marker([position.value.latitude, position.value.longitude], {icon: boatIcon}).addTo(map)
        boatMarker.on('click', function() {
          markerClicked(vesselId)
        })
        boatMarker.bindTooltip(vesselId)
        boatMarkers[vesselId] = boatMarker
      }
    }

    var heading = R.path(['navigation', 'courseOverGroundTrue'], vessel) || R.path(['navigation', 'headingTrue'], vessel) ||
      R.path(['navigation', 'headingMagnetic'], vessel)
    if (heading && boatMarker) {
      var degrees = (heading.value / (2*Math.PI)) * 360 - 90
      boatMarker.setRotationAngle(degrees)
    }

    if (selectedBoat === vesselId) {
      var speed = R.path(['navigation', 'speedThroughWater'], vessel)
      $("#speedThroughWater span").text(numberFormat(speed))

      var sog = R.path(['navigation', 'speedOverGround'], vessel)
      $("#speedOverGround span").text(numberFormat(sog))
    }
  })
  if (opts.firstRender) {
    var points = Object.keys(boatMarkers).map(function(vesselId) {
      return boatMarkers[vesselId].getLatLng()
    })
    var latLngBounds = L.latLngBounds(points)
    if (points.length == 0) {
      map.setView([60.148665, 24.949106], 14);
    } else {
      map.fitBounds(latLngBounds)
    }
  }
}

function markerClicked(vesselId) {
  if (boatTrack) {
    boatTrack.remove()
    boatTrack = undefined
  }
  selectedBoat = vesselId
  renderState({})
  ws.send(JSON.stringify({type: "requestTrack", vesselId: vesselId}))
}

function numberFormat(number) {
  return number ? parseFloat(Math.round(number.value * 10) / 10).toFixed(1) : '-'
}
