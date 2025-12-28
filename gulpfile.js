const ejs = require('gulp-ejs')
const rename = require('gulp-rename')
const { dest, src, watch, parallel } = require('gulp')
const browserSync = require('browser-sync').create()
const MailHandler = require('./classes/MailHandler')

// Load environment variables first
require('dotenv').config()
const mH = MailHandler.init()

async function compileEJS() {
  const { data } = await mH.formMailData(
    './dev/data/jane@email.com-mail-0.yaml'
  )
  console.log(data)
  // compile our ejs when any change occures
  return src('./email-templates/index.ejs')
    .pipe(ejs({ data }))
    .pipe(rename({ extname: '.html' }))
    .pipe(dest('./dev'))
}

function compileCSS() {
  return src('./email-templates/css/**/*.css').pipe(dest('./dev/css/'))
}

function watcher() {
  watch('./email-templates', compile)
}

async function serve() {
  // Compile files first before starting the server
  await parallel(compileCSS, compileEJS)()
  
  // init browserSync
  browserSync.init({
    server: './dev'
  })
  // watch our file and do the need fule
  watch('./email-templates', parallel(compileCSS, compileEJS))
  watch('./dev').on('change', browserSync.reload)
}

exports.compile = parallel(compileCSS, compileEJS)
exports.watch = watcher
exports.serve = serve
