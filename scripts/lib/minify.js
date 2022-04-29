const { src, dest } = require('gulp')
const terser = require('gulp-terser')
const cssmin = require('gulp-cssmin')
const rename = require('gulp-rename')
var concat = require('gulp-concat');


exports.minifyJs = minifyJs
exports.minifyCss = minifyCss


function minifyJs() {
  return src(['./packages/core/dist/main.js', './packages/interaction/dist/main.js', './packages/timeshift/dist/main.js',  './packages/resource-common/dist/main.js',  './packages/resource-timeshift/dist/main.js'], { base: '.' })
  .pipe(concat('main.js'))
    // .pipe(
    //   terser({
    //     output: {
    //       // preserve FC's leading comment but strip Microsoft tslib's
    //       // comment that starts with a row of ***
    //       comments: /^!(?! \*)/
    //     }
    //   })
    // )
    // .pipe(
    //   rename({ extname: '.min.js' })
    // )
    .pipe(dest('dist'))
}


function minifyCss() {
  return src(['packages/core/dist/main.css', 'packages/timeshift/dist/main.css','packages/resource-timeshift/dist/main.css'], { base: '.' })
  .pipe(concat('main.css'))
    // .pipe(
    //   cssmin()
    // )
    // .pipe(
    //   rename({ extname: '.min.css' })
    // )
    .pipe(dest('dist'))
}
