import * as React from "react";
import { Box } from "@mui/material";
import { keyframes } from "@emotion/react";

const driftDown = keyframes`
  0%   { transform: translate3d(0, -30%, 0); opacity: 0; }
  12%  { opacity: 1; }
  88%  { opacity: 1; }
  100% { transform: translate3d(0, 130%, 0); opacity: 0; }
`;

const softPulse = keyframes`
  0%, 100% { opacity: 0.75; filter: blur(0px); }
  50%      { opacity: 1; filter: blur(0.2px); }
`;

const LINES = [
  { left: "8%", height: 240, delay: "0s", duration: "12s", color: "rgba(255,46,147,0.9)" },
  { left: "14%", height: 320, delay: "-4s", duration: "16s", color: "rgba(255,46,147,0.55)" },
  { left: "22%", height: 220, delay: "-8s", duration: "14s", color: "rgba(166,66,255,0.65)" },
  { left: "34%", height: 360, delay: "-2s", duration: "18s", color: "rgba(45,226,230,0.60)" },
  { left: "49%", height: 280, delay: "-10s", duration: "15s", color: "rgba(166,66,255,0.55)" },
  { left: "57%", height: 420, delay: "-6s", duration: "19s", color: "rgba(45,226,230,0.85)" },
  { left: "68%", height: 240, delay: "-12s", duration: "13s", color: "rgba(45,226,230,0.55)" },
  { left: "76%", height: 340, delay: "-3s", duration: "17s", color: "rgba(255,46,147,0.55)" },
  { left: "86%", height: 260, delay: "-9s", duration: "16s", color: "rgba(45,226,230,0.65)" },
  { left: "92%", height: 380, delay: "-1s", duration: "20s", color: "rgba(166,66,255,0.60)" },
];

export default function NeonLinesBackground() {
  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {/* base dark */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          bgcolor: "#060613",
        }}
      />

      {/* gradient wash */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(90% 90% at 12% 20%, rgba(255,46,147,0.20) 0%, transparent 60%), radial-gradient(80% 90% at 52% 12%, rgba(166,66,255,0.18) 0%, transparent 62%), radial-gradient(90% 90% at 90% 22%, rgba(45,226,230,0.18) 0%, transparent 62%), linear-gradient(180deg, rgba(6,6,19,1) 0%, rgba(6,6,19,0.92) 30%, rgba(6,6,19,1) 100%)",
          opacity: 1,
        }}
      />

      {/* side glows */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          filter: "blur(32px)",
          opacity: 0.85,
          background:
            "radial-gradient(40% 70% at 0% 40%, rgba(255,46,147,0.20) 0%, transparent 70%), radial-gradient(40% 70% at 100% 45%, rgba(45,226,230,0.18) 0%, transparent 70%)",
          animation: `${softPulse} 6s ease-in-out infinite`,
        }}
      />

      {/* neon vertical lines */}
      {LINES.map((l, idx) => (
        <Box
          key={idx}
          sx={{
            position: "absolute",
            top: "-40%",
            left: l.left,
            width: "2px",
            height: `${l.height}px`,
            borderRadius: 999,
            background: `linear-gradient(180deg, transparent 0%, ${l.color} 45%, transparent 100%)`,
            boxShadow: `0 0 10px ${l.color}, 0 0 26px rgba(255,255,255,0.05)`,
            opacity: 0.9,
            animation: `${driftDown} ${l.duration} linear infinite`,
            animationDelay: l.delay,
          }}
        />
      ))}
    </Box>
  );
}

