"use strict";

var neume = require("./src/neume");

neume.use(require("./src/ugen/index"));

if (typeof window !== "undefined") {
  window.Neume = neume.Neume;
}

module.exports = neume;
