module.exports = {
  extends: ["next", "next/core-web-vitals"],
  plugins: ["data-safety"],
  rules: {
    "data-safety/no-forbidden-supabase-text": "error",
  },
  settings: {
    "import/resolver": {
      node: {
        paths: ["."],
      },
    },
  },
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
    },
  ],
};



