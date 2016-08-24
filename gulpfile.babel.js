import gulp from 'gulp'
import babel from 'gulp-babel'
import path from 'path'
import cp from 'child_process'

gulp.task('watch', () => {
  gulp.watch('src/*.js', [ 'build' ])
})

gulp.task('build', () => {
  return gulp.src('src/*.js')
    .pipe(babel({
      "presets": [ "es2015", "stage-0", "node6" ],
      "plugins": [
        "transform-runtime",
        "add-module-exports"
      ]
    })).pipe(gulp.dest('bin'))
})


gulp.task('default', [ 'build', 'watch' ])