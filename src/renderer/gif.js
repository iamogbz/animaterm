const fs = require("fs");
const path = require("path");
const { CanvasRenderingContext2D, createCanvas } = require("canvas");
const GIFEncoder = require("gifencoder");
const { setExtension } = require("../utils");

const setup = {
  /** @type {CanvasRenderingContext2D | null} */
  canvasCtx: null,
  /** @type {GIFEncoder | null} */
  gifEncoder: null,
};

/**
 * Canvas and GIF encoder setup
 */
const init = (/** @type {Config} */ config) => {
  const { height, width } = config.dimensionsPx;

  if (!setup.canvasCtx) {
    const canvas = createCanvas(width, height);
    setup.canvasCtx = canvas.getContext("2d");
  }

  if (!setup.gifEncoder) {
    setup.gifEncoder = new GIFEncoder(width, height);
    setup.gifEncoder.start();
    setup.gifEncoder.setDelay(config.animation.msPerFrame);
    setup.gifEncoder.setQuality(config.animation.quality);
    setup.gifEncoder.setRepeat(config.animation.repeat);
  }
};

/** @type {Renderer} */
const render = (state, config) => {
  init(config);

  if (!setup.gifEncoder) throw Error("Failed to initialize gif encoder");
  if (!setup.canvasCtx) throw Error("Failed to initialize canvas context");

  const { height, lineHeight, padding, width } = config.dimensionsPx;

  setup.canvasCtx.fillStyle =
    config.animation.css.backgroundColor?.toString() || "white";
  setup.canvasCtx.fillRect(0, 0, width, height);
  setup.canvasCtx.font = `${config.animation.css.fontSize} ${config.animation.css.fontStyle}`;
  setup.canvasCtx.fillStyle = config.animation.css.color?.toString() || "black";

  state.frames.forEach((frame) => {
    setup.canvasCtx?.clearRect(0, 0, width, height);
    frame.forEach((line, index) => {
      setup.canvasCtx?.fillText(
        line,
        padding.x,
        padding.y + index * lineHeight
      );
    });
    // @ts-ignore - Ignore type checking for {CanvasRenderingContext2D}, as it's valid JS
    setup.gifEncoder?.addFrame(setup.canvasCtx);
  });

  setup.gifEncoder.finish();
  const filePath = setExtension(state.outputPath, "gif");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, setup.gifEncoder.out.getData());

  return filePath;
};

module.exports = { render };
