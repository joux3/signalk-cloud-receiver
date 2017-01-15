const readline = require('readline')
const fs = require('fs')
const Promise = require('bluebird')
const sqlite3 = require("sqlite3")

const deltaParser = require('./delta_parser')

const inputFile = process.argv[2] || (console.log('Input file needed!'), process.exit(5))

const db = new sqlite3.Database('test_db_'+new Date().getTime()+'.sqlite');
Promise.promisifyAll(db)
let initQuery = 'PRAGMA journal_mode=WAL;'
initQuery += 'PRAGMA foreign_keys = ON;'
initQuery += 'CREATE TABLE vessels (id INTEGER PRIMARY KEY, vessel TEXT UNIQUE);'
initQuery += 'CREATE TABLE paths (id INTEGER PRIMARY KEY, path TEXT UNIQUE);'
initQuery += 'CREATE TABLE entries (time INTEGER, vessel_id INTEGER NOT NULL, path_id INTEGER NOT NULL, value TEXT, ' +
  'FOREIGN KEY(vessel_id) REFERENCES vessels(id), FOREIGN KEY(path_id) REFERENCES paths(id));'

db.execAsync(initQuery).then(() => {
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
    return Promise.map(updates, storeUpdate)
  }).then(() => {
    console.log("Saving to sqlite took", new Date() - start, "ms")
    db.close()
  })
})

function storeUpdate(update) {
  if (update.pathStr === 'navigation.datetime') {
    return
  }
  return db.runAsync("INSERT OR IGNORE INTO vessels (vessel) VALUES($vessel);", {
    $vessel: update.vessel
  }).then(() => {
    return db.runAsync("INSERT OR IGNORE INTO paths (path) VALUES($path);", {
      $path: update.pathStr
    })
  }).then(() => {
    return db.runAsync("INSERT INTO entries (time, vessel_id, path_id, value) VALUES " +
      "($time, (SELECT id FROM vessels WHERE vessel = $vessel), (SELECT id FROM paths WHERE path = $path), $value)", {
      $time: update.timestamp.getTime(),
      $vessel: update.vessel,
      $path: update.pathStr,
      $value: typeof update.value === 'object' ? JSON.stringify(update.value) : update.value
    })
  })
}

