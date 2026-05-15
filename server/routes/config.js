const { runtimeConfig } = require("../config");
const { jsonResponse } = require("../http/response");

function handleConfig(_req, res) {
  return jsonResponse(res, 200, {
    ok: true,
    ...runtimeConfig()
  });
}

module.exports = {
  handleConfig
};
