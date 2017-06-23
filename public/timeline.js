(function() {
  var closeCallback
  var timelineLayerGroup
  function showTimeline(date, map, trackData, _closeCallback) {
    $('#timeline-graph').empty()
    $('#close-track-timeline').html(date+'<br>Close')
    timelineLayerGroup = L.layerGroup([])
    timelineLayerGroup.addTo(map)

    createGraph(trackData)
    var latLngs = trackData.map(function(position) {
      return [position.value.latitude, position.value.longitude]
    })
    var dateTrack = L.polyline(latLngs, {color: 'red'})
    timelineLayerGroup.addLayer(dateTrack)
    showBoundsIfNeeded(latLngs, true)

    closeCallback = _closeCallback
    $('#track-timeline').addClass('show')
  }

  function createGraph(trackData) {
    trackData.forEach(sample => {
      sample.time = new Date(sample.time)
    })
    var timeSamples = trackData.map(sample => sample.time)

    var graphWidth = $('#timeline-graph').get(0).offsetWidth
    var graphHeight = 100

    var x = d3.scaleTime()
      .domain([trackData[0].time, trackData[trackData.length - 1].time])
      .range([0, graphWidth - 20])

    var xAxis = d3.axisBottom()
      .scale(x)
      .tickSize(6, 0)
      .tickFormat(d3.timeFormat('%H:%M'))

    var svg = d3.select('#timeline-graph').append('svg')
      .attr('width', graphWidth)
      .attr('height', graphHeight)

    var g = svg.append('g')
      .attr('class', 'axis')
      .attr('transform', 'translate(10,75)')
      .call(xAxis)

    $('#timeline-graph svg').on('mousemove', function(ev) {
      if (ev.clientX < 10 || ev.clientX > graphWidth - 10) {
        mouseOut()
        return
      }
      var onGraphX = ev.clientX - 10
      const time = x.invert(onGraphX)
      const sampleIndex = d3.bisectLeft(timeSamples, time)
      console.log(sampleIndex)
    })
    $('#timeline-graph svg').on('mouseout', mouseOut)
    function mouseOut() {
    }
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
