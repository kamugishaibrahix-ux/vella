/**
 * ESLint rule: no-forbidden-supabase-text
 * Flags any attempt to insert/update/upsert free-text fields via Supabase.
 */

"use strict";

const FORBIDDEN_KEYS = new Set(["content", "text", "summary", "transcript", "free_text", "prompt", "response"]);

function isSupabaseCall(callee) {
  return (
    callee &&
    callee.type === "MemberExpression" &&
    callee.object &&
    ((callee.object.type === "Identifier" && callee.object.name === "supabase") ||
      (callee.object.type === "MemberExpression" &&
        callee.object.object &&
        callee.object.object.name === "supabase"))
  );
}

function checkObjectLiteral(node, context) {
  if (!node || node.type !== "ObjectExpression") return;
  for (const prop of node.properties) {
    if (!prop || prop.type !== "Property") continue;
    const keyName = prop.key && prop.key.name ? prop.key.name : prop.key && prop.key.value;
    if (keyName && FORBIDDEN_KEYS.has(keyName)) {
      context.report({
        node: prop.key,
        message:
          "Forbidden field for Supabase persistence. Per DATA_DESIGN.md, free-text must remain local.",
      });
    }
  }
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow storing free-text fields in Supabase operations.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!node.callee || node.arguments.length === 0) return;
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          callee.property &&
          ["insert", "update", "upsert"].includes(callee.property.name) &&
          isSupabaseCall(callee.object)
        ) {
          checkObjectLiteral(node.arguments[0], context);
        }
      },
    };
  },
};


