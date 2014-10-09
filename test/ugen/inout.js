"use strict";

var neume = require("../../src");

neume.use(require("../../src/ugen/inout"));
neume.use(require("../../src/ugen/osc"));

describe("ugen/inout", function() {
  var Neume = null;

  before(function() {
    Neume = neume.exports(new window.AudioContext());
  });

  describe("$(in)", function() {
    it("graph", function() {
      var synth = new Neume(function($) {
        return $("in", 1);
      })();

      assert.deepEqual(synth.toAudioNode().toJSON(), {
        name: "GainNode",
        gain: {
          value: 1,
          inputs: []
        },
        inputs: []
      });
      assert(synth.toAudioNode() === synth.context.getAudioBus(1).toAudioNode());
    });
    it("graph control", function() {
      var synth = new Neume(function($) {
        return $("in", { rate: "control" }, 1);
      })();

      assert.deepEqual(synth.toAudioNode().toJSON(), {
        name: "GainNode",
        gain: {
          value: 0,
          inputs: []
        },
        inputs: [ DC(1) ]
      });
      assert(synth.toAudioNode() === synth.context.getControlBus(1).toAudioNode());
    });
  });

  describe("$(out)", function() {
    it("graph", function() {
      var synth = new Neume(function($) {
        return $("out", { bus: 1 }, $("osc"));
      })();

      synth.start(0);

      assert.deepEqual(synth.context.getAudioBus(1).toAudioNode().toJSON(), {
        name: "GainNode",
        gain: {
          value: 1,
          inputs: []
        },
        inputs: [
          {
            name: "OscillatorNode",
            type: "sine",
            frequency: {
              value: 440,
              inputs: []
            },
            detune: {
              value: 0,
              inputs: []
            },
            inputs: []
          }
        ]
      });
    });
  });

  describe("$(local-in)", function() {
    it("graph", function() {
      var synth = new Neume(function($) {
        return $("local-in", 1);
      })();

      assert.deepEqual(synth.toAudioNode().toJSON(), {
        "name": "GainNode",
        "gain": {
          "value": 1,
          "inputs": []
        },
        "inputs": []
      });
    });
  });

  describe("$(local-out)", function() {
    it("graph", function() {
      var synth = new Neume(function($) {
        return $("local-out", { bus: 1 }, $("osc"));
      })();

      assert.deepEqual(synth.toAudioNode().toJSON(), {
        "name": "OscillatorNode",
        "type": "sine",
        "frequency": {
          "value": 440,
          "inputs": []
        },
        "detune": {
          "value": 0,
          "inputs": []
        },
        "inputs": []
      });
    });
  });

  describe("$(local-out { bus: 0 } $(osc mul:$(local-in 0)))", function() {
    it("graph", function() {
      var synth = new Neume(function($) {
        return $("local-out", { bus: 0 }, $("osc", { mul: $("local-in", 0) }));
      })();

      assert.deepEqual(synth.toAudioNode().toJSON(), {
        "name": "GainNode",
        "gain": {
          "value": 0,
          "inputs": [
            {
              "name": "GainNode",
              "gain": {
                "value": 1,
                "inputs": []
              },
              "inputs": [
                "<circular:GainNode>"
              ]
            }
          ]
        },
        "inputs": [
          {
            "name": "OscillatorNode",
            "type": "sine",
            "frequency": {
              "value": 440,
              "inputs": []
            },
            "detune": {
              "value": 0,
              "inputs": []
            },
            "inputs": []
          }
        ]
      });
    });
  });

});