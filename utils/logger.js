const pino = require('pino')

/**
 * Creates a Pino logger instance with appropriate configuration
 * @param {Object} options - Logger options
 * @param {boolean} options.quiet - If true, only log errors and warnings
 * @param {string} options.level - Log level (trace, debug, info, warn, error, fatal)
 * @returns {pino.Logger} Configured Pino logger instance
 */
function createLogger({ quiet = false, level = 'info' } = {}) {
  // Determine log level based on quiet flag and environment
  let logLevel = level
  if (quiet) {
    logLevel = 'warn' // Only warnings and errors when quiet
  } else if (process.env.LOG_LEVEL) {
    logLevel = process.env.LOG_LEVEL
  } else if (process.env.NODE_ENV === 'development') {
    logLevel = 'debug'
  } else {
    logLevel = 'info'
  }

  const logger = pino({
    level: logLevel,
    // Pretty print in development, JSON in production
    transport:
      process.env.NODE_ENV === 'development' && !process.env.NO_PRETTY_LOGS
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname'
            }
          }
        : undefined,
    // Add context to all logs
    base: {
      env: process.env.NODE_ENV || 'development'
    }
  })

  return logger
}

module.exports = { createLogger }

