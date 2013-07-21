#!/usr/bin/env node
/*jshint node:true*/

"use strict";

var fs = require("fs");
var path = require("path");
var EventEmitter = require("events").EventEmitter;

var queue = require("queue-async");
var taglib = require("taglib");

// Utils
// -----

var slice = Array.prototype.slice;
var bindMethods = function () {
	var scope = arguments[0];
	var methods = slice.call(arguments, 1);
	var m;

	for (var i = 0, il = methods.length; i < il; i ++) {
		m = methods[i];
		scope[m] = scope[m].bind(scope);
	}
};

// AudioConcator
// -------------

var AudioConcator = function (basePath) {
	this.basePath = basePath;
	fs.readdir(basePath, this.initSources.bind(this));
	bindMethods(this, "frames", "concat");
};

AudioConcator.prototype = {

	initSources: (function () {
		var audioProperties = function (p, cb) {
			taglib.read(p, function (err, tag, audioProps) {
				cb(err, audioProps);
			});
		};

		var indexify = function (sources, index) {
			for (var i = 0, il = sources.length; i < il; i ++) {
				index[sources[i]] = i;
			}
			return index;
		};

		var nameify = function (sources) {
			return function (d, i) {
				var name = sources[i];
				var parts = name.split(/\./);
				d.name = name;
				d.extension = parts[parts.length - 1];
				return d;
			};
		};

		return function (err, sources) {
			var that = this;
			var base = this.basePath;
			var sq = queue();

			sources.forEach(function (s) {
				sq.defer(audioProperties, path.join(base, s));
			});

			sq.awaitAll(function (err, data) {
				that.index = indexify(sources, {});
				that.sources = data.map(nameify(sources));
				that.emit("ready", that.sources);
			});
		};
	}()),

	get: function (name) {
		return this.sources[this.index[name]];
	},

	// Saves frame data to dest
	frames: function (dest, cb) {
		var sources = this.sources;
		var data = {
			frames: [],
			index: this.index
		};

		var offset = 0;
		sources.forEach(function (s, i) {
			var length = s.length;
			data.frames.push({
				start: offset,
				end: offset + length,
				length: length
			});

			offset += length;
		});

		fs.writeFile(dest + ".json", JSON.stringify(data), function (err) {
			if (cb) { cb(err, data); }
		});
	},

	// Concatenate sources to dest
	// Returns stream.Writable
	concat: function (dest, format, cb) {
		var that = this;
		var base = this.basePath;
		var sources = this.sources.slice();
		var streamDest = fs.createWriteStream(dest + "." + format);

		(function append () {
			if (!sources.length) {
				streamDest.end();
				if (cb) { cb(null, streamDest); }
				return;
			}

			var data = sources.shift();
			var src = path.join(base, data.name);
			var streamSrc = fs.createReadStream(src);

			streamSrc.pipe(streamDest, {end: false});
			streamSrc.on("end", append);
		}());

		return streamDest;
	}

};

(function () {
	for (var i in EventEmitter.prototype) {
		if (!AudioConcator.prototype[i]) {
			AudioConcator.prototype[i] = EventEmitter.prototype[i];
		}
	}
}());

var c = new AudioConcator("./test/audio");
c.on("ready", function (sources) {
	var q = queue()
		.defer(c.frames, "./test/data")
		.defer(c.concat, "./test/sfx", "mp3")
		.await(function (err, meta, buff0) {
			console.log(meta, buff0);
		});
});
