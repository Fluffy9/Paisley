const DataHandler = require('./DataHandler')
const path = require('path')
const { readdirSync, mkdirSync } = require('fs')
const ejs = require('ejs')
const mailer = require('nodemailer')
const Juice = require('juice')
const { createLogger } = require('../utils/logger')

class MailHandler {
  constructor({
    username,
    password,
    host,
    port,
    fromEmail,
    dataDir,
    viewsDir,
    quiet
  }) {
    if (!username) throw new Error('username not provided')
    if (!password) throw new Error('password not provided')
    if (!host) throw new Error('host not provided')
    if (!port) throw new Error('port not provided')
    if (!fromEmail) throw new Error('fromEmail not provided')
    if (!dataDir) throw new Error('dataDir not provided')
    if (!viewsDir) throw new Error('viewsDir not provided')

    this.port = port
    this.username = username
    this.password = password
    this.host = host
    this.fromEmail = fromEmail
    this.dataDir = dataDir
    this.viewsDir = viewsDir
    this.emailRegex = /(.+)-mail-[0-9]+\.yaml$/
    this.quiet = quiet
    this.logger = createLogger({ quiet: this.quiet })
  }

  /**
   * Validates email address format
   * @param {string} email - Email address to validate
   * @returns {boolean} True if email is valid
   */
  isValidEmail(email) {
    if (!email || typeof email !== 'string') return false
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email.trim())
  }

  /**
   * Validates file path to prevent path traversal attacks
   * @param {string} filePath - File path to validate
   * @returns {boolean} True if path is safe
   */
  isSafePath(filePath) {
    if (!filePath || typeof filePath !== 'string') return false
    // Prevent path traversal (../, ..\, etc.)
    if (filePath.includes('..')) return false
    // Prevent absolute paths outside data directory
    const path = require('path')
    const resolved = path.resolve(this.dataDir, filePath)
    const dataDirResolved = path.resolve(this.dataDir)
    return resolved.startsWith(dataDirResolved)
  }

  async start() {
    this.logger.info('Starting mail sending process', { dataDir: this.dataDir })
    let count = 0
    let failedCount = 0
    const errors = []

    // make sure we have email present before sending 'em
    // read all the files in mail-data folder and send them
    let files = []
    try {
      files = readdirSync(this.dataDir)
    } catch (e) {
      // create the directory here
      mkdirSync(this.dataDir, { recursive: true })
      this.logger.info('Created mail data directory', { dataDir: this.dataDir })
    }

    for (const file of files) {
      // dont parse this file if it does not pass meet our requirement
      if (!this.emailRegex.test(file)) continue

      // Validate file path to prevent path traversal
      if (!this.isSafePath(file)) {
        const error = `Skipping unsafe file path: ${file}`
        errors.push(error)
        this.logger.warn('Unsafe file path detected', { file, error })
        continue
      }

      try {
        const filePath = `${this.dataDir}/${file}`
        const data = await this.constructMailData(filePath)

        // Validate email before sending
        if (!this.isValidEmail(data.email)) {
          const error = `Invalid email address in file ${file}: ${data.email}`
          errors.push(error)
          this.logger.error('Invalid email address in file', {
            file,
            email: data.email
          })
          failedCount++
          continue
        }

        // Send email with retry logic
        await this.sendMailWithRetry(data.email, data.mail, data.name, 3)
        count++
        this.logger.debug('Email sent successfully', {
          email: data.email,
          subject: data.name
        })
      } catch (error) {
        const errorMsg = `Failed to process ${file}: ${error.message}`
        errors.push(errorMsg)
        this.logger.error('Failed to process email file', {
          file,
          error: error.message,
          stack: error.stack
        })
        failedCount++
      }
    }

    this.logger.info('Mail sending process completed', {
      success: count,
      failed: failedCount,
      total: count + failedCount
    })

    if (failedCount > 0) {
      this.logger.warn('Some emails failed to send', {
        failedCount,
        errors: errors.length > 0 ? errors : undefined
      })
    }

    return { success: count, failed: failedCount, errors }
  }

  async constructMailData(file) {
    let { email, data } = await this.formMailData(file)
    let mail = await ejs.renderFile(
      `${this.viewsDir}/index.ejs`,
      { data },
      {
        views: [this.viewsDir]
      }
    )

    // juice the mail with resources. we will inline most of the content here
    return new Promise((resolve, reject) => {
      Juice.juiceResources(
        mail,
        {
          webResources: { relativeTo: process.env.ASSETS_URL }
        },
        (err, mail) => {
          if (err) return reject(err)
          resolve({ mail, email, name: data.name })
        }
      )
    })
  }

  async formMailData(file) {
    // Validate file path
    if (!file || typeof file !== 'string') {
      throw new Error('File path is required and must be a string')
    }

    // grab the email from the filename
    const match = path.basename(file).match(this.emailRegex)
    if (!match || !match[1]) {
      throw new Error(
        `Invalid email file format: ${file}. Expected format: email-mail-N.yaml`
      )
    }

    const email = match[1]

    // Validate extracted email
    if (!this.isValidEmail(email)) {
      throw new Error(`Invalid email address extracted from filename: ${email}`)
    }

    let data = this.convertMailDataToArray(await DataHandler.read(file))
    data = this.transformPosts(data)
    data.date = this.formDate()
    return { data, email }
  }

  /**
   * Sends email with retry logic and exponential backoff
   * @param {string} email - Recipient email address
   * @param {string} mail - HTML email content
   * @param {string} name - Email subject/name
   * @param {number} maxRetries - Maximum number of retry attempts
   * @returns {Promise} Promise that resolves when email is sent
   */
  async sendMailWithRetry(email, mail, name, maxRetries = 3) {
    let lastError
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.sendMail(email, mail, name)
        if (attempt > 1) {
          this.logger.info('Email sent successfully after retry', {
            email,
            attempt,
            maxRetries
          })
        }
        return
      } catch (error) {
        lastError = error
        if (attempt < maxRetries) {
          // Exponential backoff: wait 2^attempt seconds
          const delay = Math.pow(2, attempt) * 1000
          this.logger.warn('Email send failed, retrying', {
            email,
            attempt,
            maxRetries,
            delay,
            error: error.message
          })
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }
    this.logger.error('Failed to send email after all retries', {
      email,
      maxRetries,
      error: lastError.message
    })
    throw new Error(
      `Failed to send email after ${maxRetries} attempts: ${lastError.message}`
    )
  }

  sendMail(email, mail, name) {
    // Validate inputs
    if (!this.isValidEmail(email)) {
      throw new Error(`Invalid recipient email: ${email}`)
    }
    if (!this.isValidEmail(this.fromEmail)) {
      throw new Error(`Invalid sender email: ${this.fromEmail}`)
    }
    if (!mail || typeof mail !== 'string') {
      throw new Error('Email content is required and must be a string')
    }
    if (!name || typeof name !== 'string') {
      throw new Error('Email subject is required and must be a string')
    }

    // send the mail here.
    const transporter = mailer.createTransport(
      {
        host: this.host,
        port: this.port,
        secure: this.port === 465, // Use secure connection for port 465
        auth: {
          user: this.username,
          pass: this.password
        },
        // Add connection timeout
        connectionTimeout: 10000, // 10 seconds
        greetingTimeout: 10000,
        socketTimeout: 10000
      },
      {
        from: this.fromEmail
      }
    )

    // initialize the options
    const option = {
      to: email,
      html: mail,
      subject: name
    }

    return new Promise((resolve, reject) => {
      transporter.sendMail(option, (err, data) => {
        if (err) {
          return reject(new Error(`SMTP error: ${err.message}`))
        }
        resolve(data)
      })
    })
  }

  formDate() {
    const days = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday'
    ]
    const months = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december'
    ]
    const now = new Date()
    const date = {
      date: `${now.getDate()}`,
      weekDay: days[now.getDay()],
      month: months[now.getMonth()],
      year: `${now.getFullYear()}`
    }
    return date
  }

  transformPosts(data) {
    // take the config and transform the the mail
    let tempData = data
    tempData.mails = data.mails.map((posts) => {
      const structure = posts.config.structure
      if (typeof structure == 'object' && Object.keys(structure).length > 0) {
        const sectionArray = []
        for (let key in structure) {
          // direct assignment messes thing up. big time.
          let tempPosts = Object.assign({}, posts)
          // grab the config for this section from from it's key
          tempPosts.config = structure[key]
          tempPosts = this.sortAndSlicePost(tempPosts)
          sectionArray.push(tempPosts)
        }
        posts = { sections: sectionArray }
      } else {
        posts = this.sortAndSlicePost(posts)
      }

      return posts
    })
    return tempData
  }

  /**
   * Safely evaluates a mathematical expression with two operands and an operator
   * @param {number} operand1 - First operand
   * @param {string} operator - Mathematical operator (+, -, *, /)
   * @param {number} operand2 - Second operand
   * @returns {number} Result of the expression
   * @throws {Error} If operator is not allowed
   */
  safeEvaluate(operand1, operator, operand2) {
    // Whitelist of allowed operators to prevent code injection
    const allowedOperators = ['+', '-', '*', '/']
    if (!allowedOperators.includes(operator)) {
      throw new Error(
        `Invalid operator: ${operator}. Allowed operators: ${allowedOperators.join(', ')}`
      )
    }

    // Ensure operands are numbers
    const num1 = Number(operand1) || 0
    const num2 = Number(operand2) || 0

    // Perform safe arithmetic operation
    switch (operator) {
      case '+':
        return num1 + num2
      case '-':
        return num1 - num2
      case '*':
        return num1 * num2
      case '/':
        return num2 !== 0 ? num1 / num2 : 0
      default:
        return 0
    }
  }

  sortAndSlicePost(posts) {
    const config = posts.config
    const sort = config.sort ? config.sort : 'points'
    const ascending = config.ascending
    // filter the array if we need to
    if (config.property && config.value) {
      const regex = new RegExp(config.value)
      posts.posts = posts.posts.filter((post) =>
        regex.test(post[config.property])
      )
    }
    const count = config.count ? config.count : 6
    posts.posts = posts.posts
      .sort((a, z) => {
        // if an array was given, then it must contain the first operand
        // operator and second operand
        if (Array.isArray(sort) && sort.length === 3) {
          const [fo, op, so] = sort
          // Use safe evaluation instead of eval() to prevent code injection
          const valA = this.safeEvaluate(
            this.fetchProp(a, fo),
            op,
            this.fetchProp(a, so)
          )
          const valZ = this.safeEvaluate(
            this.fetchProp(z, fo),
            op,
            this.fetchProp(z, so)
          )
          a = valA
          z = valZ
        } else {
          // just go ahead with sorting
          a = this.fetchProp(a, sort)
          z = this.fetchProp(z, sort)
        }

        return ascending ? a - z : z - a
      })
      .slice(0, count)
    return posts
  }

  /**
   * Fetches a property value from data object, returning 0 if not found
   * @param {Object} data - Data object to fetch property from
   * @param {string} prop - Property name to fetch
   * @returns {number} Property value as number, or 0 if not found
   */
  fetchProp(data, prop) {
    // zero if the demanded prop does not exist
    let result = 0
    if (typeof prop === 'string' && data[prop]) result = data[prop]

    // turn it into number either way
    return !Number(result) ? 0 : Number(result)
  }

  convertMailDataToArray(mail) {
    const tempMail = []
    const name = mail.name
    for (let key in mail) {
      tempMail.push(mail[key])
    }
    return { mails: tempMail.slice(0, tempMail.length - 2), name }
  }

  static init() {
    DataHandler.loadConfig()
    const host = process.env.HOST
    const port = process.env.PORT
    const username = process.env.LOGIN
    const password = process.env.PASSWORD
    const fromEmail = process.env.FROM_EMAIL
    const dataDir = process.env.MAIL_DATA_DIR
    const viewsDir = process.env.VIEWS_DIR
    return new MailHandler({
      host,
      port,
      username,
      password,
      fromEmail,
      viewsDir,
      dataDir
    })
  }
}

module.exports = MailHandler
