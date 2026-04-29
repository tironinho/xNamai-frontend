import * as React from "react";
import { Box, Typography } from "@mui/material";
import { ReactComponent as Wordmark } from "../../assets/branding/xnamai-wordmark.svg";

/**
 * Logo padronizado do produto.
 * - Evita espalhar imports de assets em todas as telas.
 * - Mantém proporção e tamanho consistente.
 */
export default function BrandLogo({
  size = 34,
  variant = "primary", // "primary" | "inverse"
  withSubtitle = false,
  sx,
}) {
  const color = variant === "inverse" ? "#FFFFFF" : "#1E66FF";
  const subColor = variant === "inverse" ? "rgba(255,255,255,0.85)" : "rgba(11,27,51,0.72)";

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        minWidth: 0,
        ...sx,
      }}
      aria-label="XNaMai"
    >
      <Box
        component={Wordmark}
        role="img"
        aria-label="XNaMai"
        sx={{
          height: size,
          width: "auto",
          color,
          userSelect: "none",
          whiteSpace: "nowrap",
          display: "block",
        }}
      />
      {withSubtitle && (
        <Typography
          component="span"
          sx={{
            ml: 0.75,
            fontWeight: 900,
            letterSpacing: 2.6,
            fontSize: Math.max(11, Math.round(size * 0.44)),
            lineHeight: 1,
            color: subColor,
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          SORTEIOS
        </Typography>
      )}
    </Box>
  );
}

