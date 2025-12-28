// Mock for download package to avoid ESM issues in tests
module.exports = function download(url) {
  const Stream = require('stream')
  const readable = new Stream.Readable()
  readable.push('[1, 2, 3]')
  readable.push(null)
  return readable
}
