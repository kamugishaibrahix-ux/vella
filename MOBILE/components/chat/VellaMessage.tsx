"use client";

import { motion } from "framer-motion";

type Props = {
  role: "user" | "assistant";
  content: string;
  image?: string | null;
  mode?: "ai" | "fallback" | "exercise";
  isStreaming?: boolean;
};

export function VellaMessage({
  role,
  content,
  image,
  mode = "ai",
  isStreaming = false,
}: Props) {
  const isUser = role === "user";

  const userClass = `
    bg-[#0F3D2E]
    text-white
    px-5 py-3
    rounded-2xl rounded-br-md
    shadow-[0_8px_24px_rgba(79,70,229,0.18)]
    leading-relaxed
    text-[15px]
    transition-all duration-200
    hover:shadow-[0_10px_30px_rgba(79,70,229,0.25)]
  `;

  const assistantBase = `
    bg-[#F3EFEA]
    border border-[#E5DED6]
    text-[#2A2A2A]
    px-5 py-3
    rounded-2xl rounded-bl-md
    shadow-sm
    leading-relaxed
    text-[15px]
    transition-all duration-200
    hover:shadow-md
  `;

  const modeAccent =
    mode === "fallback"
      ? "bg-amber-400/70"
      : mode === "exercise"
      ? "bg-sky-400/70"
      : "bg-[#C08A5D]/70";

  return (
    <div className={`w-full flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[75%] relative group">

        {!isUser && (
          <div className="absolute -inset-1 rounded-2xl bg-[#C08A5D]/5 blur-xl opacity-50" />
        )}

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={isUser ? userClass : assistantBase}
        >
          {!isUser ? (
            <div className="flex">
              <div
                className={`w-[3px] rounded-full mr-3 opacity-70 ${modeAccent}`}
              />
              <div>{content}</div>
            </div>
          ) : (
            <div>
              {image && (
                <img
                  src={image}
                  alt="Attached image"
                  className="max-w-[120px] max-h-[140px] object-cover rounded-lg mb-2 border border-neutral-200"
                />
              )}
              {content}
            </div>
          )}
        </motion.div>

        {isStreaming && !isUser && (
          <div className="flex space-x-1 mt-2 ml-3">
            <div className="w-1.5 h-1.5 bg-[#C08A5D] rounded-full animate-bounce" />
            <div className="w-1.5 h-1.5 bg-[#C08A5D] rounded-full animate-bounce delay-100" />
            <div className="w-1.5 h-1.5 bg-[#C08A5D] rounded-full animate-bounce delay-200" />
          </div>
        )}
      </div>
    </div>
  );
}
