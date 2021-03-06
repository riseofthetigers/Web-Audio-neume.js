"use strict";

var neume = require("../namespace");

var util = require("../util");
var FFT = require("../util/fft");

function NeuBuffer(context, buffer) {
  Object.defineProperties(this, {
    context: {
      value: context,
      enumerable: true
    },
    sampleRate: {
      value: buffer.sampleRate,
      enumerable: true
    },
    length: {
      value: buffer.length,
      enumerable: true
    },
    duration: {
      value: buffer.duration,
      enumerable: true
    },
    numberOfChannels: {
      value: buffer.numberOfChannels,
      enumerable: true
    },
  });

  function getChannelData(ch) {
    return function() {
      return buffer.getChannelData(ch);
    };
  }

  for (var i = 0; i < buffer.numberOfChannels; i++) {
    Object.defineProperty(this, i, { get: getChannelData(i) });
  }

  this._buffer = buffer;
}
NeuBuffer.$$name = "NeuBuffer";

NeuBuffer.create = function(context, channels, length, sampleRate) {
  channels = util.int(util.defaults(channels, 1));
  length = util.int(util.defaults(length, 0));
  sampleRate = util.int(util.defaults(sampleRate, context.sampleRate));

  return new NeuBuffer(context, context.createBuffer(channels, length, sampleRate));
};

NeuBuffer.from = function(context) {
  var args = util.toArray(arguments).slice(1);
  var numberOfChannels = args.length;
  var length = args.reduce(function(a, b) {
    return Math.max(a, b.length);
  }, 0);

  var buffer = context.createBuffer(numberOfChannels, length, context.sampleRate);

  for (var i = 0; i < numberOfChannels; i++) {
    buffer.getChannelData(i).set(args[i]);
  }

  return new NeuBuffer(context, buffer);
};

NeuBuffer.load = function(context, url) {
  return new Promise(function(resolve, reject) {
    loadWithXHR(url).then(function(audioData) {
      return decodeAudioData(context, audioData);
    }).then(function(decodedData) {
      resolve(new NeuBuffer(context, decodedData));
    }).catch(function(e) {
      reject(e);
    });
  });
};

function loadWithXHR(url) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();

    xhr.open("GET", url);
    xhr.responseType = "arraybuffer";

    xhr.onload = function() {
      resolve(xhr.response);
    };

    xhr.onerror = function() {
      reject({/* TODO: error object */});
    };

    xhr.send();
  });
}

function decodeAudioData(context, audioData) {
  return new Promise(function(resolve, reject) {
    context.decodeAudioData(audioData, function(decodedData) {
      resolve(decodedData);
    }, function() {
      reject({/* TODO: error object */});
    });
  });
}

NeuBuffer.prototype.getChannelData = function(ch) {
  ch = util.clip(util.int(ch), 0, this.numberOfChannels - 1);

  return this._buffer.getChannelData(ch);
};

NeuBuffer.prototype.concat = function() {
  var args = util.toArray(arguments).filter(function(elem) {
    return (elem instanceof NeuBuffer) && (this.numberOfChannels === elem.numberOfChannels);
  }, this);
  var channels = this.numberOfChannels;
  var length = args.reduce(function(a, b) {
    return a + b.length;
  }, this.length);
  var sampleRate = this.sampleRate;
  var buffer = this.context.createBuffer(channels, length, sampleRate);

  args.unshift(this);

  var argslen = args.length;

  for (var i = 0; i < channels; i++) {
    var data = buffer.getChannelData(i);
    var pos = 0;
    for (var j = 0; j < argslen; j++) {
      data.set(args[j][i], pos);
      pos += args[j].length;
    }
  }

  return new NeuBuffer(this.context, buffer);
};

NeuBuffer.prototype.reverse = function() {
  var channels = this.numberOfChannels;
  var buffer = this.context.createBuffer(channels, this.length, this.sampleRate);

  for (var i = 0; i < channels; i++) {
    buffer.getChannelData(i).set(util.toArray(this[i]).reverse());
  }

  return new NeuBuffer(this.context, buffer);
};

NeuBuffer.prototype.slice = function(start, end) {
  start = util.int(util.defaults(start, 0));
  end = util.int(util.defaults(end, this.length));

  if (start < 0) {
    start += this.length;
  } else {
    start = Math.min(start, this.length);
  }
  if (end < 0) {
    end += this.length;
  } else {
    end = Math.min(end, this.length);
  }

  var channels = this.numberOfChannels;
  var length = end - start;
  var sampleRate = this.sampleRate;
  var buffer = null;

  if (length <= 0) {
    buffer = this.context.createBuffer(channels, 1, sampleRate);
  } else {
    buffer = this.context.createBuffer(channels, length, sampleRate);
    for (var i = 0; i < channels; i++) {
      buffer.getChannelData(i).set(this[i].subarray(start, end));
    }
  }

  return new NeuBuffer(this.context, buffer);
};

NeuBuffer.prototype.split = function(n) {
  n = util.int(util.defaults(n, 2));

  if (n <= 0) {
    return [];
  }

  var result = new Array(n);
  var len = this.length / n;
  var start = 0;
  var end = 0;

  for (var i = 0; i < n; i++) {
    end = Math.round(start + len);
    result[i] = this.slice(start, end);
    start = end;
  }

  return result;
};

NeuBuffer.prototype.normalize = function() {
  var channels = this.numberOfChannels;
  var buffer = this.context.createBuffer(channels, this.length, this.sampleRate);

  for (var i = 0; i < channels; i++) {
    buffer.getChannelData(i).set(normalize(this[i]));
  }

  return new NeuBuffer(this.context, buffer);
};

NeuBuffer.prototype.resample = function(size, interpolation) {
  size = Math.max(0, util.int(util.defaults(size, this.length)));
  interpolation = !!util.defaults(interpolation, true);

  var channels = this.numberOfChannels;
  var buffer = this.context.createBuffer(channels, size, this.sampleRate);

  for (var i = 0; i < channels; i++) {
    buffer.getChannelData(i).set(resample(this[i], size, interpolation));
  }

  return new NeuBuffer(this.context, buffer);
};

NeuBuffer.prototype.toAudioBuffer = function() {
  return this._buffer;
};

NeuBuffer.prototype.toPeriodicWave = function(ch) {
  ch = util.clip(util.int(ch), 0, this.numberOfChannels - 1);

  var buffer = this._buffer.getChannelData(ch);

  if (4096 < buffer.length) {
    buffer = buffer.subarray(0, 4096);
  }

  var fft = FFT.forward(buffer);

  return this.context.createPeriodicWave(fft.real, fft.imag);
};

function normalize(data) {
  var maxamp = peak(data);

  /* istanbul ignore else */
  if (maxamp !== 0) {
    var ampfac = 1 / maxamp;
    for (var i = 0, imax = data.length; i < imax; ++i) {
      data[i] *= ampfac;
    }
  }

  return data;
}

function peak(data) {
  var maxamp = 0;

  for (var i = 0, imax = data.length; i < imax; ++i) {
    var absamp = Math.abs(data[i]);
    if (maxamp < absamp) {
      maxamp = absamp;
    }
  }

  return maxamp;
}

function resample(data, size, interpolation) {
  if (data.length === size) {
    return new Float32Array(data);
  }

  if (interpolation) {
    return resample1(data, size);
  }

  return resample0(data, size);
}

function resample0(data, size) {
  var factor = (data.length - 1) / (size - 1);
  var result = new Float32Array(size);

  for (var i = 0; i < size; i++) {
    result[i] = data[Math.round(i * factor)];
  }

  return result;
}

function resample1(data, size) {
  var factor = (data.length - 1) / (size - 1);
  var result = new Float32Array(size);
  var len = data.length - 1;

  for (var i = 0; i < size; i++) {
    var x = i * factor;
    var x0 = x|0;
    var x1 = Math.min(x0 + 1, len);
    result[i] = data[x0] + Math.abs(x - x0) * (data[x1] - data[x0]);
  }

  return result;
}

module.exports = neume.Buffer = NeuBuffer;
