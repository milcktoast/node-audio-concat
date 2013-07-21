#!/usr/bin/env node
/*jshint node:true*/

"use strict";

var fs = require("fs");
var path = require("path");
var EventEmitter = require("events").EventEmitter;

var queue = require("queue-async");
var taglib = require("taglib");
var lame = require("lame");

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

function AudioConcator (name, basePath) {
	this.name = name;
	this.basePath = basePath;
	fs.readdir(basePath, this.initSources.bind(this));
	bindMethods(this, "concat");
}

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
			var q = queue();

			sources.forEach(function (s) {
				q.defer(audioProperties, path.join(base, s));
			});

			q.awaitAll(function (err, data) {
				that.index = indexify(sources, {});
				that.sources = data.map(nameify(sources));
				that.emit("ready", that.sources);
			});
		};
	}()),

	get: function (name) {
		return this.sources[this.index[name]];
	},

	// Frame data
	frames: function (sources) {
		sources = sources || this.sources;
		var data = {
			name: this.name,
			frames: [],
			index: this.index
		};

		var offset = 0;
		sources.forEach(function (s, i) {
			var length = s.length;
			data.frames.push([offset, offset + length, length]);
			offset += length;
		});

		return data;
	},

	// Concatenate sources to dest
	// Returns stream.Writable
	concat: function (dest, format, cb) {
		var base = this.basePath;
		var sources = this.sources.slice();
		var streamDest = fs.createWriteStream(path.join(dest, this.name + "." + format));

		(function append () {
			if (!sources.length) {
				streamDest.end();
				if (cb) { cb(null, streamDest); }
				return;
			}

			var data = sources.shift();
			var src = path.join(base, data.name);
			var streamSrc = fs.createReadStream(src);
			var decoder = new lame.Decoder();

			streamSrc.pipe(decoder);
			decoder.on("end", append);
			decoder.on("format", function (format) {
				var encoder = new lame.Encoder(format);
				decoder.pipe(encoder).pipe(streamDest, {end: false});
			});
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

var c = new AudioConcator("sfx", "./test/audio");
c.on("ready", function (sources) {
	var q = queue()
		.defer(fs.writeFile, "./test/data.json", JSON.stringify(c.frames()))
		.defer(c.concat, "./test", "mp3")
		.await(function (err, meta, buff0) {
			console.log(meta, buff0);
		});
});
