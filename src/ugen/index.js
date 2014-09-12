module.exports = function(neume) {
  "use strict";

  neume.use(require("./add"));
  neume.use(require("./array"));
  neume.use(require("./biquad"));
  neume.use(require("./boolean"));
  neume.use(require("./buf"));
  neume.use(require("./comp"));
  neume.use(require("./conv"));
  neume.use(require("./delay"));
  neume.use(require("./env"));
  neume.use(require("./function"));
  neume.use(require("./line"));
  neume.use(require("./media-stream"));
  neume.use(require("./media"));
  neume.use(require("./mul"));
  neume.use(require("./noise"));
  neume.use(require("./number"));
  neume.use(require("./osc"));
  neume.use(require("./shaper"));

};
