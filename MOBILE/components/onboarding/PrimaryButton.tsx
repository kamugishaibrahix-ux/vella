"use client";

import { useState } from "react";

interface PrimaryButtonProps {
  label: string;
  onClick?: () => void;
}

export function PrimaryButton({ label, onClick }: PrimaryButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        backgroundColor: hovered ? "#111111" : "#000000",
        color: "#ffffff",
        height: 48,
        borderRadius: 24,
        fontWeight: 600,
        fontSize: 16,
        width: "100%",
        border: "none",
        cursor: "pointer",
        boxShadow: "0 4px 10px rgba(0, 0, 0, 0.08)",
        letterSpacing: "0.01em",
        transition: "transform 120ms ease, background-color 120ms ease",
        transform: pressed ? "scale(0.97)" : "scale(1)",
      }}
    >
      {label}
    </button>
  );
}
