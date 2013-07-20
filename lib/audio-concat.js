#!/usr/bin/env node
/*jshint node:true*/

"use strict";

var fs = require("fs");
var path = require("path");
var EventEmitter = require("events").EventEmitter;

var queue = require("queue-async");
var taglib = require("taglib");

var AudioConcator = function (basePath) {
	this.basePath = basePath;
	fs.readdir(basePath, this.initSources.bind(this));
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

	concat: function (out) {
		var sources = this.sources.slice();
		var streamOut = fs.creatWriteStream(out + ".mp3");
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
	// c.concat("./test/out");
	console.log(sources);
});
