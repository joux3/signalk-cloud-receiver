const readline = require('readline')
const fs = require('fs')
const Promise = require('bluebird')
const sqlite3 = require("sqlite3")

const deltaParser = require('./delta_parser')

const inputFile = process.argv[2] || (console.log('Input file needed!'), process.exit(5))

const db = new sqlite3.Database('test_db_'+new Date().getTime()+'.sqlite');
Promise.promisifyAll(db)
db.execAsync('CREATE TABLE entries (time INTEGER, vessel TEXT, path TEXT, value TEXT)').then(() => {
  console.log('Opening', inputFile)

  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: fs.createReadStream(inputFile)
    })

    const start = new Date()
    const objects = []
    rl.on('line', (line) => {
      objects.push(JSON.parse(line))
    })
    rl.on('close', () => {
      console.log("File parsing took", new Date() - start, "ms")
      resolve(objects)
    })
  })
}).then(objects => {
  console.log("Got a total of" , objects.length, "deltas")
  const start = new Date()
  return Promise.map(objects, object => {
    const updates = deltaParser(object)
    return Promise.map(updates, update => {
      return db.runAsync("INSERT INTO entries (time, vessel, path, value) VALUES ($time, $vessel, $path, $value)", {
        $time: update.timestamp.getTime(),
        $vessel: update.vessel,
        $path: update.pathStr,
        $value: JSON.stringify(update.value)
      })
    })
  }).then(() => {
    console.log("Saving to sqlite took", new Date() - start, "ms")
  })
})

