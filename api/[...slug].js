const { handleApi, jsonResponse } = require("../server");

module.exports = async (req, res) => {
  try {
    const handled = await handleApi(req, res);
    if (!handled) {
      jsonResponse(res, 404, { error: "Route not found" });
    }
  } catch {
    jsonResponse(res, 500, { error: "Internal server error" });
  }
};
