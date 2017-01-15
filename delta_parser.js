const R = require('ramda')

function deltaParser(deltaMessage) {
  if (!deltaMessage || !deltaMessage.updates || !deltaMessage.updates.length) {
    return []
  }

  const updates = []
  deltaMessage.updates.forEach(update => {
    update.values.forEach(value => {
      const pathStr = deltaMessage.context + "." + value.path

      const parsedUpdate = {
        vessel: deltaMessage.context,
        pathStr: value.path,
        value: value.value,
        timestamp: new Date(update.timestamp)
      }
      updates.push(parsedUpdate)
    })
  })

  return updates
}

module.exports = deltaParser

if (require.main.filename === __filename) {
  console.log(deltaParser(JSON.parse(process.argv[2])))
}
