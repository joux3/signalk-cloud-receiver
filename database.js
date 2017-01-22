const Promise = require('bluebird')
const sqlite3 = require("sqlite3")
const fs = require('fs')

const util = require('./util')

const DATABASE_FILE = 'data/database.sqlite'
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

let queuedUpdates = []
let ensurePaths = {}
let ensureVessels = {}
let storePromise
let databaseStorePromise
function runUpdates() {
  let updatePromise
  const updates = queuedUpdates.slice(0)
  queuedUpdates = []
  const ensureVesselsArray = Object.keys(ensureVessels)
  ensureVessels = {}
  const ensurePathsArray = Object.keys(ensurePaths)
  ensurePaths = {}
  db.serialize(() => {
    db.run('BEGIN TRANSACTION;')
    ensureVesselsArray.forEach(vessel => {
      db.run("INSERT OR IGNORE INTO vessels (vessel) VALUES(?);", vessel)
    })
    ensurePathsArray.forEach(path => {
      db.run("INSERT OR IGNORE INTO paths (path) VALUES(?);", path)
    })
    const insertStatement = db.prepare(
      "INSERT INTO entries (time, vessel_id, path_id, value) VALUES " +
        "($time, (SELECT id FROM vessels WHERE vessel = $vessel), (SELECT id FROM paths WHERE path = $path), $value)"
    )
    updates.forEach(update => {
      insertStatement.run({
        $time: update.timestamp.getTime(),
        $vessel: update.vessel,
        $path: update.pathStr,
        $value: typeof update.value === 'object' ? JSON.stringify(update.value) : update.value
      })
    })
    insertStatement.finalize()
    updatePromise = db.runAsync('COMMIT TRANSACTION;')
  })
  return updatePromise.then(() => {
    ensureVesselsArray.forEach(vessel => {
      insertedVessels[vessel] = true
    })
    ensurePathsArray.forEach(path => {
      insertedPaths[path] = true
    })
  })
}

const insertedVessels = {}
const insertedPaths = {}
function storeUpdate(update) {
  if (IGNORE_PATHS[update.pathStr]) {
    return Promise.resolve()
  }

  queuedUpdates.push(update)
  if (!insertedVessels[update.vessel]) {
    ensureVessels[update.vessel] = true
  }
  if (!insertedPaths[update.path]) {
    ensurePaths[update.pathStr] = true
  }
  if (storePromise) {
    return storePromise
  } else {
    if (databaseStorePromise) {
      storePromise = databaseStorePromise.then(() => {
        storePromise = null
        databaseStorePromise = runUpdates()
        return databaseStorePromise
      })
      return storePromise
    } else {
      storePromise = null
      databaseStorePromise = runUpdates()
      return databaseStorePromise
    }
  }
}

function getLatest30SecondsPerVessel() {
  const start = new Date()
  const query = "SELECT time, value, vessel, path FROM entries\
    INNER JOIN (\
      SELECT vessel_id, MAX(time) AS max_time FROM entries\
      INNER JOIN paths ON paths.id = entries.path_id\
      WHERE paths.path = 'navigation.position'\
      GROUP BY vessel_id\
    ) AS newest\
    ON newest.vessel_id = entries.vessel_id AND newest.max_time >= entries.time AND newest.max_time - 30000 <= entries.time\
    INNER JOIN vessels ON vessels.id = entries.vessel_id\
    INNER JOIN paths ON paths.id = entries.path_id"
  return db.allAsync(query).then(rows => {
    util.doLog("getLatest30SecondsPerVessel took", new Date() - start, "ms")
    rows.forEach(parseDbRow)
    return rows
  })
}

function getPositionsFor10Minutes(vesselId) {
  const start = new Date()
  const query = "SELECT time, value, vessel, path FROM entries\
    INNER JOIN (\
      SELECT vessel_id, max(time) AS max_time FROM entries\
      INNER JOIN paths ON paths.id = entries.path_id\
      INNER JOIN vessels ON vessels.id = entries.vessel_id\
      WHERE paths.path = 'navigation.position' AND vessels.vessel = $vessel_id\
    ) AS newest\
    ON newest.vessel_id = entries.vessel_id AND entries.time >= newest.max_time - 600000\
    INNER JOIN vessels ON vessels.id = entries.vessel_id\
    INNER JOIN paths ON paths.id = entries.path_id\
    WHERE paths.path = 'navigation.position'\
    ORDER BY time DESC"
  return db.allAsync(query, {
    $vessel_id: 'vessels.' + vesselId
  }).then(rows => {
    util.doLog("getPositionsFor10Minutes took", new Date() - start, "ms")
    rows.forEach(parseDbRow)
    return rows
  })
}

function parseDbRow(row) {
  if (typeof row.value === 'string' && row.value[0] === '{') {
    row.value = JSON.parse(row.value)
  } else if (typeof row.value === 'string' && !isNaN(Number(row.value))) {
    row.value = Number(row.value)
  }
  if (typeof row.time === 'number') {
    row.time = new Date(row.time)
  }
}

module.exports = {
  storeUpdate,
  getLatest30SecondsPerVessel,
  getPositionsFor10Minutes
}

