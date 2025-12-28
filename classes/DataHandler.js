const { readFileSync, writeFileSync } = require('fs')
const url = require('valid-url')
const yaml = require('js-yaml')
const download = require('download')
const stream2string = require('stream-to-string')
const path = require('path')

class DataHandler {
  constructor() {}

  static async read(filename) {
    const isUri = url.isUri(filename)
    let string = ''
    if (isUri) {
      const stream = download(filename)
      string = await stream2string(stream)
    } else {
      string = readFileSync(filename, 'utf8')
    }

    // Use load() - in js-yaml v4, load() is safe by default
    // This prevents code execution from YAML files
    try {
      // js-yaml v4: load() is safe by default, no schema needed
      // For backward compatibility, check if schema exists (v3)
      if (yaml.DEFAULT_SAFE_SCHEMA) {
        // js-yaml v3
        const data = yaml.load(string, { schema: yaml.DEFAULT_SAFE_SCHEMA })
        return data
      } else {
        // js-yaml v4+ - safe by default
        const data = yaml.load(string)
        return data
      }
    } catch (error) {
      throw new Error(`Failed to parse YAML file ${filename}: ${error.message}`)
    }
  }

  static async write(filename, data) {
    // Use dump() - in js-yaml v4, dump() is safe by default
    try {
      // js-yaml v4: dump() is safe by default, no schema needed
      // For backward compatibility, check if schema exists (v3)
      if (yaml.DEFAULT_SAFE_SCHEMA) {
        // js-yaml v3
        const content = yaml.dump(data, { schema: yaml.DEFAULT_SAFE_SCHEMA })
        return writeFileSync(filename, content, 'utf8')
      } else {
        // js-yaml v4+ - safe by default
        const content = yaml.dump(data)
        return writeFileSync(filename, content, 'utf8')
      }
    } catch (error) {
      throw new Error(`Failed to write YAML file ${filename}: ${error.message}`)
    }
  }

  static loadConfig() {
    // load this according to the environment we are on
    const env = process.env.NODE_ENV
    const mainDir = path.parse(__dirname).dir
    const filename = `${mainDir}/.${env}.env`
    try {
      // try to read this file, if failed, resort to the default
      readFileSync(filename)
      require('dotenv').config({ path: filename })
    } catch (e) {
      require('dotenv').config()
    }

    // just incase the user forgot, use the best
    process.env.SCRAPPER_SCHEMA_FILE =
      process.env.SCRAPPER_SCHEMA_FILE || 'scrapper-schema.yaml'
    process.env.VIEWS_DIR = process.env.VIEWS_DIR || './email-templates'
    process.env.MAIL_DATA_DIR = process.env.MAIL_DATA_DIR || './mail-data'
    process.env.ASSETS_URL = path.normalize(`${__dirname}/../email-templates`)
  }
}

module.exports = DataHandler
