const fs = require("fs");
const { execSync } = require("child_process");
const { TOKEN_NL } = require("../constants");
const { setExtension } = require("../utils");

/** @type {Renderer} */
const render = (state, config) => {
  const filePath = writeFramesToTerminalizerRecording(state, config);

  execSync(`terminalizer render ${filePath} -o ${filePath}`);

  return filePath;
};

/**
 * Convert state frames to terminalizer type output
 * @param {State} state
 * @param {Config} config
 * @returns
 */
function writeFramesToTerminalizerRecording(state, config) {
  const filePathWithoutExt = setExtension(state.outputPath, "");
  const delay = Math.round(config.animation.msPerFrame);

  // TODO: add other config from terminalizer
  const content = `config:
  frameDelay: auto

  frameBox:
    type: null
    title: ${config.title}
    style:
      margin: 0px

  watermark:
    imagePath: null
    style:
      opacity: 0

  theme:
    cursor: transparent

  repeat: ${config.animation.repeat}

  cols: ${Math.floor(config.dimensionsPx.width / 10)}
  rows: ${config.lineCount}

records:
#  - delay: ${delay}
#    content: "\\e"
${state.frames
  .map((lines) =>
    [
      "  - delay: " + delay,
      "    content: " +
        JSON.stringify(
          [
            ...lines,
            ...Array(config.lineCount - lines.length + 1).fill(""),
          ].join("\n\r")
        ).replace(/"$/, '\\e"'),
    ].join(TOKEN_NL)
  )
  .join(TOKEN_NL)}
`;

  fs.writeFileSync(setExtension(filePathWithoutExt, "yml"), content);
  return filePathWithoutExt;
}

module.exports = { render };
