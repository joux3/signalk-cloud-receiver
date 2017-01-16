function tryParseJSON(string) {
  try {
    return JSON.parse(string);
  } catch (e) {
    return null;
  }
}

function doLog() {
  console.log(new Date().toISOString() + ": " + Array.prototype.join.call(arguments, ' '))
}

module.exports = {
  doLog,
  tryParseJSON
}