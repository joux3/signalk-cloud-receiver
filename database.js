const Promise = require('bluebird')
const sqlite3 = require("sqlite3")
const fs = require('fs')

const DATABASE_FILE = 'database.sqlite'
const IGNORE_PATHS = {
  'navigation.datetime': true
}

const createDatabase = !fs.existsSync(DATABASE_FILE)
const db = new sqlite3.Database(DATABASE_FILE)
Promise.promisifyAll(db)

let initQuery = 'PRAGMA journal_mode=WAL;'
initQuery += 'PRAGMA foreign_keys = ON;'

if (createDatabase) {
  initQuery += 'CREATE TABLE vessels (id INTEGER PRIMARY KEY, vessel TEXT UNIQUE);'
  initQuery += 'CREATE TABLE paths (id INTEGER PRIMARY KEY, path TEXT UNIQUE);'
  initQuery += 'CREATE TABLE entries (time INTEGER, vessel_id INTEGER NOT NULL, path_id INTEGER NOT NULL, value TEXT, ' +
    'FOREIGN KEY(vessel_id) REFERENCES vessels(id), FOREIGN KEY(path_id) REFERENCES paths(id));'
  initQuery += 'CREATE INDEX vessel_path_time ON entries (vessel_id, path_id, time);'
}
db.exec(initQuery)

const createdVessels = {}
function createVesselId(update) {
  if (createdVessels[update.vessel]) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    db.run("INSERT OR IGNORE INTO vessels (vessel) VALUES($vessel);", {
      $vessel: update.vessel
    }, function(err) {
      if (err) {
        reject(err)
      } else {
        createdVessels[update.vessel] = this.lastID
        resolve()
      }
    })
  })
}

const createdPaths = {}
function createPathId(update) {
  if (createdPaths[update.pathStr]) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    db.run("INSERT OR IGNORE INTO paths (path) VALUES($path);", {
      $path: update.pathStr
    }, function(err) {
      if (err) {
        reject(err)
      } else {
        createdPaths[update.pathStr] = this.lastID
        resolve()
      }
    })
  })
}

function storeUpdate(update) {
  if (IGNORE_PATHS[update.pathStr]) {
    return Promise.resolve()
  }
  const vesselIdPromise = createVesselId(update)
  const pathIdPromise = createPathId(update)
  return Promise.join(vesselIdPromise, pathIdPromise, () => {
    return db.runAsync("INSERT INTO entries (time, vessel_id, path_id, value) VALUES " +
      "($time, (SELECT id FROM vessels WHERE vessel = $vessel), (SELECT id FROM paths WHERE path = $path), $value)", {
      $time: update.timestamp.getTime(),
      $vessel: update.vessel,
      $path: update.pathStr,
      $value: typeof update.value === 'object' ? JSON.stringify(update.value) : update.value
    })
  })
}

module.exports = {
  storeUpdate
}

