"use strict";

const path = require("node:path");

function resolveRulePath() {
  const cwdPath = path.resolve(process.cwd(), "..", "eslint-rules", "no-forbidden-supabase-text.js");
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    require.resolve(cwdPath);
    return cwdPath;
  } catch {
    return path.resolve(__dirname, "..", "..", "eslint-rules", "no-forbidden-supabase-text.js");
  }
}

// eslint-disable-next-line global-require, import/no-dynamic-require
const rule = require(resolveRulePath());

module.exports = {
  rules: {
    "no-forbidden-supabase-text": rule,
  },
};


