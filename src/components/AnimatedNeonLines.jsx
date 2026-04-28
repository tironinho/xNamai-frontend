import React from "react";
import "./AnimatedNeonLines.css";

const lines = [
  { x: "1%", h: "76vh", d: "10s", delay: "-1s", color: "pink", opacity: 0.72, w: "3px" },
  { x: "5%", h: "54vh", d: "8s", delay: "-5s", color: "pink", opacity: 0.55, w: "2px" },
  { x: "9%", h: "88vh", d: "12s", delay: "-3s", color: "pink", opacity: 0.68, w: "3px" },
  { x: "13%", h: "42vh", d: "7s", delay: "-6s", color: "pink", opacity: 0.52, w: "2px" },
  { x: "17%", h: "70vh", d: "11s", delay: "-8s", color: "pink", opacity: 0.7, w: "3px" },
  { x: "21%", h: "52vh", d: "9s", delay: "-4s", color: "pink", opacity: 0.48, w: "2px" },
  { x: "27%", h: "92vh", d: "13s", delay: "-9s", color: "pink", opacity: 0.62, w: "3px" },
  { x: "31%", h: "48vh", d: "8.5s", delay: "-2s", color: "pink", opacity: 0.44, w: "2px" },

  { x: "65%", h: "50vh", d: "8s", delay: "-3s", color: "blue", opacity: 0.52, w: "2px" },
  { x: "69%", h: "92vh", d: "12s", delay: "-7s", color: "blue", opacity: 0.72, w: "3px" },
  { x: "73%", h: "58vh", d: "9s", delay: "-4s", color: "blue", opacity: 0.5, w: "2px" },
  { x: "77%", h: "82vh", d: "11s", delay: "-8s", color: "blue", opacity: 0.7, w: "3px" },
  { x: "81%", h: "44vh", d: "7.5s", delay: "-2s", color: "blue", opacity: 0.45, w: "2px" },
  { x: "85%", h: "96vh", d: "13s", delay: "-10s", color: "blue", opacity: 0.75, w: "3px" },
  { x: "90%", h: "62vh", d: "9.5s", delay: "-5s", color: "blue", opacity: 0.56, w: "2px" },
  { x: "94%", h: "86vh", d: "12.5s", delay: "-1s", color: "blue", opacity: 0.68, w: "3px" },
  { x: "98%", h: "70vh", d: "10.5s", delay: "-6s", color: "blue", opacity: 0.58, w: "2px" },
];

export default function AnimatedNeonLines() {
  return (
    <div className="xnm-neon-lines" aria-hidden="true">
      <div className="xnm-neon-gradient" />

      {lines.map((line, index) => (
        <span
          key={index}
          className={`xnm-neon-line xnm-neon-line-${line.color}`}
          style={{
            "--x": line.x,
            "--h": line.h,
            "--d": line.d,
            "--delay": line.delay,
            "--o": line.opacity,
            "--w": line.w,
          }}
        />
      ))}

      <div className="xnm-neon-vignette" />
    </div>
  );
}

