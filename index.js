'use strict';

var fs = require('fs');
var path = require('path');
var through = require('through2');
var gutil = require('gulp-util');
var micromatch = require('micromatch');
var generateDirs = require('./generateDirs');
var _ = require('lodash');

module.exports = function(options) {
	var options = options || {};
	options.base = options.base || '';

	return through.obj(function(file, enc, cb) {
		var files;

		if (file.isNull() || path.extname(file.relative) != '.css')
			return cb(null, file);

		if (file.isStream())
			return cb(new gutil.PluginError('gulp-css-useref', 'Streaming not supported'));

		var newContents = processUrlDecls.call(this, file, options);
		file.contents = new Buffer(newContents);

		// Push the updated CSS file through.
		this.push(file);

		cb();
	});
};


/**
 * Trims whitespace and quotes from css 'url()' values
 *
 * @param {string} value - string to trim
 * @returns {string} - the trimmed string
 */
function trimUrlValue(value) {
    var beginSlice, endSlice;
    value = value.trim();
    beginSlice = value.charAt(0) === '\'' || value.charAt(0) === '"' ? 1 : 0;
    endSlice = value.charAt(value.length - 1) === '\'' ||
        value.charAt(value.length - 1) === '"' ?
        -1 : undefined;
    return value.slice(beginSlice, endSlice).trim();
}


function processUrlDecls(file, options) {
	var files = [];

	// Replace 'url()' parts of Declaration
	var newCssFileContents = file.contents.toString().replace(/url\((.*?)\)/g,
		function(fullMatch, urlMatch) {
			// Example:
			//   fullMatch		  = 'url("../../images/foo.png?a=123");'
			//   urlMatch         = '"../../images/foo.png?a=123"'
			//   options.base     = 'assets'
			//   file.relative    = 'src/css/page/home.css'

			// "../../images/foo.png?a=123" -> ../../images/foo.png?a=123
			var urlMatch = trimUrlValue(urlMatch);

			var assetFromBaseDir = false;
			if (options.absSources) {
				for (var absSource in options.absSources) {
          if (urlMatch.indexOf('/'+absSource+'/') === 0) {
            assetFromBaseDir = options.absSources[absSource];
					}
				}
			}

      if (assetFromBaseDir === false) {
        // Ignore absolute urls, data URIs, or hashes
        if (urlMatch.indexOf('/') === 0 ||
          urlMatch.indexOf('data:') === 0 ||
          urlMatch.indexOf('#') === 0 ||
          /^[a-z]+:\/\//.test(urlMatch)) {
          return fullMatch;
        }
        if (options.match && !micromatch.isMatch(urlMatch, options.match))
          return fullMatch;
			}

			var dirs = generateDirs(file.relative, urlMatch, options);
			var newUrl = dirs.newUrl;
			var assetPath = dirs.assetPath;
			var newAssetFile = dirs.newAssetFile;

			if (!assetFromBaseDir) {
        var assetFromAbs = path.resolve(path.dirname(file.path), assetPath);
      } else {
        var assetFromAbs = assetFromBaseDir + assetPath;
      }

			var cssBaseDirAbs = file.path.substr(0, file.path.length - file.relative.length);
			var newAssetFileAbs = path.join(cssBaseDirAbs, newAssetFile);


			var cssFromDirAbs = path.dirname(file.path);

			// Read the asset
			var contents;
			try {
				contents = fs.readFileSync(assetFromAbs);
        gutil.log('gulp-css-useref: Read asset file "' + assetFromAbs + '"');
			} catch(e) {
				gutil.log('gulp-css-useref: Can\'t read asset file "' + assetFromAbs + '" referenced in "' + file.path + '". Ignoring.');
				return fullMatch;
			}

			var asset = new gutil.File({
				cwd: file.cwd,
				base: file.base,
				path: newAssetFileAbs,
				contents: contents
			});
			files.push(asset);

			// Return the new url() string
			return newUrl;
		}.bind(this)
	);

	files = _.uniqBy(files, 'relative');

	files.forEach(function(file) {
		this.push(file);
	}, this);

	return newCssFileContents;
}
