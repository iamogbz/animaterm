const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { SEC_TO_MS, TOKEN_NL } = require("../constants");
const { setExtension } = require("../utils");

/**
 * Round a number to a specified number of decimal places.
 *
 * @param {number} n - The number to round.
 * @param {number} dp - The number of decimal places to round to.
 */
function toDecimalPlaces(n, dp) {
  return Math.round((n + Number.EPSILON) * Math.pow(10, dp)) / Math.pow(10, dp);
}

const dom = new JSDOM("");
const escapeElem = dom.window.document.createElement("textarea");

/**
 * Escape special XML characters for safe embedding in SVG content.
 *
 * @param {string} unsafe - The input text to be escaped
 */
function escapeXml(unsafe) {
  escapeElem.textContent = unsafe;
  return escapeElem.innerHTML;
}

/**
 * Creates an SVG animation with multiple frames of text.
 * @type {Renderer}
 */
const render = (state, config) => {
  const { frames, outputPath } = state;
  const secondsPerFrame = toDecimalPlaces(
    config.animation.msPerFrame / SEC_TO_MS,
    2
  );
  const { height, lineHeight, padding, width } = config.dimensionsPx;
  const frameIdxToId = (/** @type {number} */ i) => {
    const animFrame = `frame${i + 1}`;
    return {
      enter: `${animFrame}enter`,
      leave: `${animFrame}leave`,
    };
  };

  // Generate SVG content
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <style>
      .frame {
          fill: ${config.animation.css.color};
          font-family: ${config.animation.css.fontStyle};
          font-size: ${config.animation.css.fontSize};
          text-anchor: start;
      }
      </style>
      <rect width="${width}" height="${height}" fill="${
    config.animation.css.backgroundColor
  }" />
      ${frames
        .map((lines, frameIdx) => {
          const startSecs = frameIdx * secondsPerFrame;
          const text = lines
            .map((line, lineIdx) => {
              const dx = padding.x;
              const dy = Math.min(1, lineIdx) * lineHeight;
              const sanitizedLine = escapeXml(line);
              return `<tspan x="${dx}" dy="${dy}" xml:space="preserve">${sanitizedLine}</tspan>`;
            })
            .join(`${TOKEN_NL}${" ".repeat(12)}`);

          const instantAnimDur = "0.000001s";
          const frameIds = frameIdxToId(frameIdx);
          const previousFrameIds = frameIdxToId(frameIdx - 1);
          const enterAnimBegin = frameIdx
            ? `${previousFrameIds.leave}.end`
            : `${startSecs}s; ${frameIdxToId(frames.length - 1).leave}.end`;

          return `
          <text x="${padding.x}" y="${padding.y}" class="frame" opacity="0" xml:space="preserve">
              ${text}
              <animate id="${frameIds.enter}" attributeName="opacity" from="0" to="1" begin="${enterAnimBegin}" dur="${instantAnimDur}" fill="freeze" />
              <animate id="${frameIds.leave}" attributeName="opacity" from="1" to="0" begin="${frameIds.enter}.end+${secondsPerFrame}s" dur="${instantAnimDur}" fill="freeze" />
          </text>`;
        })
        .join("\n")}
  </svg>
      `;

  // Write SVG content to file
  const filePath = setExtension(outputPath, "svg");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, svgContent, "utf8");

  return filePath;
};

module.exports = { render };
