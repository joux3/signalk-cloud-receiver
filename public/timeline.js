(function() {
  var closeCallback
  var timelineLayerGroup
  function showTimeline(date, map, trackData, _closeCallback) {
    $('#timeline-graph').empty()
    $('#close-track-timeline').html(date+'<br>Close')
    timelineLayerGroup = L.layerGroup([])
    timelineLayerGroup.addTo(map)

    trackData.forEach(sample => {
      sample.time = new Date(sample.time)
    })

    const positions = trackData.filter(sample => typeof sample.value.latitude === 'number')
    const speeds = trackData.filter(sample => typeof sample.value === 'number')
    createGraph(positions, speeds)
    var latLngs = positions.map(function(position) {
      return [position.value.latitude, position.value.longitude]
    })
    var dateTrack = L.polyline(latLngs, {color: 'red'})
    timelineLayerGroup.addLayer(dateTrack)
    showBoundsIfNeeded(latLngs, true)

    closeCallback = _closeCallback
    $('#track-timeline').addClass('show')
  }

  function createGraph(positions, speeds) {
    var timeSamples = positions.map(sample => sample.time)
    var speedTimes = speeds.map(sample => sample.time)

    var graphWidth = $('#timeline-graph').get(0).offsetWidth
    var graphHeight = 100
    const leftPadding = 40

    var x = d3.scaleTime()
      .domain([positions[0].time, positions[positions.length - 1].time])
      .range([0, graphWidth - leftPadding])

    speeds.forEach(sample => {
      sample.value = sample.value * 1.94384
    })
    var y = d3.scaleLinear()
      .domain([d3.max(speeds, sample => sample.value), 0])
      .range([0, graphHeight - 25 - 10])

    const timeFormat = d3.timeFormat('%H:%M')
    var xAxis = d3.axisBottom()
      .scale(x)
      .tickSize(6, 0)
      .tickFormat(timeFormat)

    var yAxis = d3.axisLeft()
      .scale(y)
      .tickSize(6, 0)
      .ticks(4)

    var speedLine = d3.line()
      .x(speedSample => x(speedSample.time))
      .y(speedSample => y(speedSample.value))

    var svg = d3.select('#timeline-graph').append('svg')
      .attr('width', graphWidth)
      .attr('height', graphHeight)

    var gAxis = svg.append('g')
      .attr('class', 'axis')
      .attr('transform', 'translate('+(leftPadding)+',75)')
      .call(xAxis)

    var gAxis2 = svg.append('g')
      .attr('class', 'axis')
      .attr('transform', 'translate('+(leftPadding - 1)+',10)')
      .call(yAxis)


    var gSpeed = svg.append('g')
      .attr('class', 'speed')
      .attr('transform', 'translate(' + leftPadding + ', 10)')

    gSpeed.append('path')
      .attr('d', speedLine(speeds))

    var locationCircle = L.circle([0, 0], {weight: 10})
    $('#timeline-graph svg').on('mousemove', function(ev) {
      if (ev.clientX < leftPadding) {
        mouseOut()
        return
      }
      var onGraphX = ev.clientX - leftPadding
      const time = x.invert(onGraphX)
      const posSampleIndex = d3.bisectLeft(timeSamples, time)
      const posSample = positions[posSampleIndex]
      const speedSampleIndex = d3.bisectLeft(speedTimes, time)
      const speedSample = speeds[speedSampleIndex]
      locationCircle.setLatLng([posSample.value.latitude, posSample.value.longitude])
      let tooltip = timeFormat(time)
      if (speedSample) {
        tooltip += ', SOG ' + numberFormat(speedSample)
      }
      locationCircle.bindTooltip(tooltip)
      locationCircle.openTooltip()
      timelineLayerGroup.addLayer(locationCircle)
    })
    $('#timeline-graph svg').on('mouseout', mouseOut)
    function mouseOut() {
      timelineLayerGroup.removeLayer(locationCircle)
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
