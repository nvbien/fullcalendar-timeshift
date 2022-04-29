var concat = require('gulp-concat');
 
gulp.task('scripts', function() {
  return gulp.src(['./core/dist/main.js', './interaction/dist/main.js', './timeshift/dist/main.js', './resource-common/dist/main.js', './resource-timeshift/dist/main.js'])
    .pipe(concat('all.js'))
    .pipe(gulp.dest('./dist/'));
});