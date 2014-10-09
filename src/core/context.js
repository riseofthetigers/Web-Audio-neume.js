"use strict";

var _ = require("../utils");
var C = require("../const");

var NeuTransport = require("./transport");
var NeuComponent = require("../component/component");
var NeuDC = require("../component/dc");
var NeuMul = require("../component/mul");
var NeuAdd = require("../component/add");
var NeuSum = require("../component/sum");
var NeuParam = require("../component/param");
var NeuDryWet = require("../component/drywet");
var NeuAudioBus = require("../control/audio-bus");
var NeuControlBus = require("../control/control-bus");

var INIT  = 0;
var START = 1;
var PROCESS_BUF_SIZE   = C.PROCESS_BUF_SIZE;
var MAX_RENDERING_SEC = C.MAX_RENDERING_SEC;

var schedId = 1;

function NeuContext(destination, duration) {
  this.$context = destination.context;
  this.$destination = destination;

  this._transport  = new NeuTransport(this);
  this.$masterGain = this.$context.createGain();
  this.$analyser   = this.$context.createAnalyser();
  this.connect(this.$masterGain, this.$analyser);
  this.connect(this.$analyser  , this.$destination);
  this._scriptProcessor = null;
  this._audioBuses   = [];
  this._controlBuses = [];

  this.$inlet  = null;
  this.$outlet = this.$analyser;

  Object.defineProperties(this, {
    context: {
      value: this,
      enumerable: true
    },
    audioContext: {
      value: this.$context,
      enumerable: true
    },
    sampleRate: {
      value: this.$context.sampleRate,
      enumerable: true
    },
    currentTime: {
      get: function() {
        return this._currentTime || this.$context.currentTime;
      },
      enumerable: true
    },
    bpm: {
      get: function() {
        return this._transport.getBpm();
      },
      set: function(value) {
        this._transport.setBpm(value);
      },
      enumerable: true
    },
    destination: {
      value: destination,
      enumerable: true
    },
    listener: {
      value: this.$context.listener,
      enumerable: true
    }
  });

  this._duration = duration;
  this.reset();
}
NeuContext.$name = "NeuContext";

_.each([
  "createBuffer",
  "createBufferSource",
  "createMediaElementSource",
  "createMediaStreamSource",
  "createMediaStreamDestination",
  "createScriptProcessor",
  "createAnalyser",
  "createGain",
  "createDelay",
  "createBiquadFilter",
  "createWaveShaper",
  "createPanner",
  "createConvolver",
  "createChannelSplitter",
  "createChannelMerger",
  "createDynamicsCompressor",
  "createOscillator",
  "createPeriodicWave",
  "decodeAudioData",
], function(methodName) {
  NeuContext.prototype[methodName] = function() {
    return this.$context[methodName].apply(this.$context, arguments);
  };
});

NeuContext.prototype.createComponent = function(node) {
  return new NeuComponent(this, node);
};

NeuContext.prototype.createDC = function(value) {
  return new NeuDC(this, _.finite(value));
};

NeuContext.prototype.createMul = function(a, b) {
  return new NeuMul(this, a, b);
};

NeuContext.prototype.createAdd = function(a, b) {
  return new NeuAdd(this, a, b);
};

NeuContext.prototype.createSum = function(inputs) {
  return new NeuSum(this, inputs);
};

NeuContext.prototype.createParam = function(value, spec) {
  return new NeuParam(this, _.finite(value), spec);
};

NeuContext.prototype.createDryWet = function(inputs, node, mix) {
  return new NeuDryWet(this, inputs, node, mix);
};

NeuContext.prototype.getAudioBus = function(index) {
  index = Math.max(0, Math.min(_.finite(_.defaults(index, 0)|0), C.MAX_AUDIO_BUS_SIZE));
  if (!this._audioBuses[index]) {
    this._audioBuses[index] = new NeuAudioBus(this);
  }
  return this._audioBuses[index];
};

NeuContext.prototype.getControlBus = function(index) {
  index = Math.max(0, Math.min(_.finite(_.defaults(index, 0)|0), C.MAX_CONTROL_BUS_SIZE));
  if (!this._controlBuses[index]) {
    this._controlBuses[index] = new NeuControlBus(this);
  }
  return this._controlBuses[index];
};

NeuContext.prototype.reset = function() {
  if (this.$inlet) {
    this.$inlet.disconnect();
  }

  this._audioBuses   = [];
  this._controlBuses = [];

  this.$inlet = this._audioBuses[0] = this.getAudioBus(0);
  this.connect(this.$inlet, this.$masterGain);

  this.disconnect(this._scriptProcessor);

  this._events = [];
  this._nextTicks = [];
  this._state = INIT;
  this._currentTime = 0;
  this._scriptProcessor = null;

  return this;
};

NeuContext.prototype.start = function() {
  if (this._state === INIT) {
    this._state = START;
    if (this.$context instanceof window.OfflineAudioContext) {
      startRendering.call(this);
    } else {
      startAudioTimer.call(this);
    }
  }
  return this;
};

function startRendering() {
  this._currentTimeIncr = _.clip(_.finite(this._duration), 0, MAX_RENDERING_SEC);
  onaudioprocess.call(this, { playbackTime: 0 });
}

function startAudioTimer() {
  var context = this.$context;
  var scriptProcessor = context.createScriptProcessor(PROCESS_BUF_SIZE, 1, 1);
  var bufferSource    = context.createBufferSource();

  this._currentTimeIncr = PROCESS_BUF_SIZE / context.sampleRate;
  this._scriptProcessor = scriptProcessor;
  scriptProcessor.onaudioprocess = onaudioprocess.bind(this);

  // this is needed for iOS Safari
  bufferSource.start(0);
  this.connect(bufferSource, scriptProcessor);

  this.connect(scriptProcessor, context.destination);
}

NeuContext.prototype.stop = function() {
  return this;
};

NeuContext.prototype.sched = function(time, callback, ctx) {
  time = _.finite(time);

  if (!_.isFunction(callback)) {
    return 0;
  }

  var events = this._events;
  var event  = {
    id      : schedId++,
    time    : time,
    callback: callback,
    context : ctx || this
  };

  if (events.length === 0 || _.last(events).time <= time) {
    events.push(event);
  } else {
    for (var i = 0, imax = events.length; i < imax; i++) {
      if (time < events[i].time) {
        events.splice(i, 0, event);
        break;
      }
    }
  }

  return event.id;
};

NeuContext.prototype.unsched = function(id) {
  id = _.finite(id);

  if (id !== 0) {
    var events = this._events;
    for (var i = 0, imax = events.length; i < imax; i++) {
      if (id === events[i].id) {
        events.splice(i, 1);
        break;
      }
    }
  }

  return id;
};

NeuContext.prototype.nextTick = function(callback, ctx) {
  this._nextTicks.push(callback.bind(ctx || this));
  return this;
};

NeuContext.prototype.toAudioNode = function(obj) {
  if (obj && obj.toAudioNode) {
    obj = obj.toAudioNode();
  } else if (typeof obj === "number") {
    obj = this.createDC(obj).toAudioNode();
  }
  if (!(obj instanceof window.AudioNode)) {
    obj = null;
  }
  return obj;
};

NeuContext.prototype.toAudioBuffer = function(obj) {
  if (obj && obj.toAudioBuffer) {
    return obj.toAudioBuffer();
  }
  if (!(obj instanceof window.AudioBuffer)) {
    obj = null;
  }
  return obj;
};

NeuContext.prototype.connect = function(from, to) {
  if (to) {
    if (from instanceof NeuComponent) {
      from.connect(to);
    } else if (to instanceof window.AudioParam) {
      if (typeof from === "number") {
        to.value = _.finite(from);
      } else {
        from = this.toAudioNode(from);
        if (from) {
          return from.connect(to);
        }
      }
    } else if (to instanceof window.AudioNode) {
      from = this.toAudioNode(from);
      if (from) {
        return from.connect(to);
      }
    } else if (to instanceof NeuAudioBus) {
      this.connect(from, to.toAudioNode());
    }
  }
  return this;
};

NeuContext.prototype.disconnect = function(from) {
  if (from && from.disconnect) {
    from.disconnect();
  }
};

NeuContext.prototype.getBpm = function() {
  return this._transport.getBpm();
};

NeuContext.prototype.setBpm = function(value, rampTime) {
  this._transport.setBpm(value, rampTime);
  return this;
};

NeuContext.prototype.toSeconds = function(value) {
  return this._transport.toSeconds(value);
};

NeuContext.prototype.toFrequency = function(value) {
  return this._transport.toFrequency(value);
};

function onaudioprocess(e) {
  // Safari 7.0.6 does not support e.playbackTime
  var currentTime     = e.playbackTime || /* istanbul ignore next */ this.$context.currentTime;
  var nextCurrentTime = currentTime + this._currentTimeIncr;
  var events = this._events;

  this._currentTime = currentTime;

  this._nextTicks.splice(0).forEach(function(callback) {
    callback(currentTime);
  });

  while (events.length && events[0].time <= nextCurrentTime) {
    var event = events.shift();

    this._currentTime = Math.max(this._currentTime, event.time);

    event.callback.call(event.context, event.time);
  }
}

module.exports = NeuContext;