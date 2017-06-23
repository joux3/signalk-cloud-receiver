(function() {
  var closeCallback
  var timelineLayerGroup
  function showTimeline(date, map, trackData, _closeCallback) {
    $('#close-track-timeline').html(date+'<br>Close')
    timelineLayerGroup = L.layerGroup([])
    timelineLayerGroup.addTo(map)

    var latLngs = trackData.map(function(position) {
      return [position.value.latitude, position.value.longitude]
    })
    var dateTrack = L.polyline(latLngs, {color: 'red'})
    timelineLayerGroup.addLayer(dateTrack)
    showBoundsIfNeeded(latLngs, true)

    closeCallback = _closeCallback
    $('#track-timeline').addClass('show')
  }

  $('#close-track-timeline').click(function () {
    map.removeLayer(timelineLayerGroup)
    timelineLayerGroup = null
    $('#track-timeline').removeClass('show')
    closeCallback()
  })

  window.timeline = {
    showTimeline: showTimeline
  }
})()
