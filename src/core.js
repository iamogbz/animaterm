const blessed = require("blessed");
const { Svg, G } = require("@svgdotjs/svg.js");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

// constants
const TOKEN_NL = "\n";

// TODO: export config
const config = {
  title: "Automated Terminal Interaction Animation",
  lineCount: 24,
  dimensionsPx: {
    gap: 4,
    padding: {
      x: 10,
      y: 20,
    },
    text: 16,
    width: 800,
    get height() {
      // NOTE: hacky for some reason sizing does not line up exactly
      return this.lineHeight * config.lineCount + this.padding.y / 2;
    },
    get lineHeight() {
      return this.text + this.gap;
    },
  },
  animation: {
    /** @type {React.CSSProperties} */
    css: {
      backgroundColor: "black",
      borderColor: "grey",
      color: "white",
      fontStyle: "monospace",
      get fontSize() {
        return `${config.dimensionsPx.text}px`;
      },
    },
    cursor: {
      /** Set to 0 to disable blinking */
      blinkMs: 1000,
      /** Set to empty string "" to disable cursor */
      token: "█",
    },
    fps: 15,
    lineNumber: true,
    quality: 10,
    /** 0 means repeat forever */
    repeat: 0,
    timing: {
      secondMs: 1000,
    },
    typing: {
      speedMs: 20,
    },
    get delay() {
      return this.timing.secondMs / this.fps;
    },
  },
};

// Terminal simulation setup
const screen = blessed.screen({
  smartCSR: true,
  title: config.title,
});

const terminalBox = blessed.box({
  top: "center",
  left: "center",
  width: "80%",
  height: "80%",
  content: "",
  tags: true,
  border: {
    type: "line",
  },
  bg: "transparent",
});

screen.append(terminalBox);

/** @type {Svg | null} */
let svg = null;
/** @type {G | null} */
let currentFrame = null;

/**
 * Setup SVG for recording
 */
async function setupSVG() {
  const { createSVGWindow } = await import("svgdom");
  const { SVG, registerWindow } = await import("@svgdotjs/svg.js");

  // Canvas and GIF setup
  const { height, width } = config.dimensionsPx;
  const window = createSVGWindow();
  const document = window.document;
  registerWindow(window, document);

  const svgDom = SVG(document.documentElement);
  svgDom.attr({
    width,
    height,
    "xmlns:xlink": "http://www.w3.org/1999/xlink", // Add the xmlns:xlink attribute
    preserveAspectRatio: "xMidYMid meet", // Ensure SVG scales correctly
  });

  return svgDom;
}

/**
 * Get all lines that have been displayed in the terminal as list
 * @param {{ terminalContent: string; }} state
 */
function getTerminalLines(state) {
  return state.terminalContent.split(TOKEN_NL);
}

/**
 * Get the number of frames displayed for the milliseconds given
 * @param {number} ms
 */
function msToFrameCount(ms) {
  const framesPerMs = config.animation.fps / config.animation.timing.secondMs;
  return Math.floor(ms * framesPerMs);
}

/**
 * Get visible lines from the terminal content as list
 * @param {{ frameCount: number; terminalContent: string; }} state
 */
function getVisibleTerminalLines(state) {
  const paddingLength = 5;
  const lineNumber = (n) =>
    config.animation.lineNumber
      ? `${" ".repeat(paddingLength)}${n}`.substring(`${n}`.length)
      : n.toString();
  const lines = getTerminalLines(state).map(
    (line, i) => `${lineNumber(i + 1)}:\$ ${line}`
  );
  const cursorVisibleFrames = msToFrameCount(config.animation.cursor.blinkMs);
  const cursorVisible =
    state.frameCount % Math.max(1, cursorVisibleFrames) <=
    cursorVisibleFrames / 2;
  if (lines && cursorVisible) {
    lines[lines.length - 1] += config.animation.cursor.token;
  }
  return lines.slice(-config.lineCount);
}

/**
 * Record a frame of the terminal state
 * @param {{ frameCount: number; terminalContent: string; }} state
 */
function recordFrame(state) {
  if (!svg) return;

  if (currentFrame) currentFrame.remove();

  currentFrame = svg.group();

  const { height, width } = config.dimensionsPx;
  currentFrame.rect(width, height).fill(config.animation.css.backgroundColor);
  state.frameCount += 1;

  getVisibleTerminalLines(state).forEach((line, index) => {
    currentFrame
      ?.text((span) => {
        span.text(line);
        span.x(config.dimensionsPx.padding.x);
        span.y(
          config.dimensionsPx.padding.y + index * config.dimensionsPx.lineHeight
        );
      })
      .font({
        family: config.animation.css.fontStyle,
        size: config.animation.css.fontSize,
        fill: config.animation.css.color,
      });
  });
}

/**
 * Delay function
 * @param {{ frameCount: number; terminalContent: string; }} state
 * @param {number} ms
 */
function delay(state, ms) {
  const frameCount = msToFrameCount(ms);
  for (let i = 0; i < frameCount; i++) {
    recordFrame(state);
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get visible lines from the terminal content as single string blob
 * @param {{ frameCount: number; terminalContent: string; }} state
 */
function getVisibleTerminalContent(state) {
  return getVisibleTerminalLines(state).join(TOKEN_NL);
}

/**
 * Update the terminal's display content
 * @param {{ clipboard?: string; frameCount: number; terminalContent: any; }} state
 */
function updateTerminal(state) {
  terminalBox.setContent(getVisibleTerminalContent(state));
  screen.render();
  recordFrame(state);
}

/**
 * Utility to terminate and save recording
 * @param {{ frameCount: number; outputPath: string; terminalContent: string; }} state
 */
async function finishRecording(state, exitCode = 0) {
  if (!svg) throw new Error("SVG not initialized");

  await delay(state, config.animation.timing.secondMs * 5);
  const { outputPath } = state;

  let animationElements = [];
  svg.children().forEach((child, index) => {
    if (index > 0) {
      // skip the background rect
      child.opacity(0);
      let animation = child
        .animate(
          config.animation.delay,
          index * config.animation.delay,
          "absolute"
        )
        .attr({ opacity: 1 });
      animation.after(() => {
        child.opacity(0);
      });
      animationElements.push(animation);
    }
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, svg.svg());

  console.log("Recording saved as", outputPath);
  process.exit(exitCode);
}

/**
 * Utility to throw an error and abort execution
 * @param {{ clipboard?: string | undefined; frameCount: number; outputPath: string; pendingExecution: string; terminalContent: string; }} state
 * @param {string} errorMessage
 */
function abortExecution(state, errorMessage) {
  const executionError = `${TOKEN_NL}ERROR: ${errorMessage}`;
  console.error(executionError);
  // print error to recorded terminal
  state.pendingExecution = "";
  state.terminalContent += `${TOKEN_NL}${executionError}`;
  updateTerminal(state);
  return finishRecording(state, 1);
}

// Registry of actions with their implementation
/**
  @type {
    Record<string, (
      step: { action: "clear" | "copy" | "enter" | "paste" | "type" | "waitForOutput"; payload: string | { startLine: number, endLine: number, startPos: number, endPos:number }; timeoutMs: number},
      state: { env: Record<string, string | undefined>; frameCount: number; pendingExecution:string; terminalContent: string; clipboard: string; }
    ) => Promise<void>>
  }
*/
const actionsRegistry = Object.freeze({
  type: async ({ payload }, state) => {
    const text = `${payload}`;
    state.pendingExecution += text;
    for (const char of text) {
      state.terminalContent += char;
      updateTerminal(state);
      // randomise type speed
      await delay(state, (1 + Math.random()) * config.animation.typing.speedMs);
    }
  },
  enter: async (_, state) => {
    // execute the last set of instructions typed
    const toExecute = state.pendingExecution.trim();
    state.pendingExecution = "";
    state.terminalContent += TOKEN_NL;
    updateTerminal(state);
    await delay(state, config.animation.timing.secondMs);
    return new Promise((resolve, reject) => {
      if (toExecute) {
        // TODO: preserve env variables e.g. PATH, updated between child processes
        const child = exec(toExecute, {});

        child.stdout?.on("data", (data) => {
          state.terminalContent += data;
          updateTerminal(state);
        });

        child.stderr?.on("data", (data) => {
          state.terminalContent += data;
          updateTerminal(state);
        });

        child.on("exit", async () => {
          state.terminalContent += TOKEN_NL; // Add newline after command execution
          updateTerminal(state);
          await delay(state, config.animation.timing.secondMs);
          // TODO: preserve env variables. Object.assign(state.env, child.env);
          resolve();
        });

        child.on("error", (error) => {
          reject(error);
        });
      } else {
        resolve();
      }
    });
  },
  waitForOutput: async ({ payload, timeoutMs = 5000 }, state) => {
    const startTime = Date.now();
    while (!state.terminalContent.includes(`${payload}`)) {
      if (Date.now() - startTime > timeoutMs) {
        throw Error(`Timeout waiting for output: "${payload}"`);
      }
      await delay(state, config.animation.timing.secondMs);
    }
  },
  paste: async (_, state) => {
    state.pendingExecution += state.clipboard;
    state.terminalContent += state.clipboard;
    updateTerminal(state);
    await delay(state, config.animation.timing.secondMs);
  },
  copy: async (step, state) => {
    if (typeof step.payload !== "object")
      throw Error(`Faulty payload: ${JSON.stringify(step)}`);
    const { startLine, startPos, endLine, endPos } = step.payload;
    const lines = getTerminalLines(state);
    const textToCopy = lines
      .slice(startLine - 1, endLine)
      .map((line, idx) => {
        if (idx === 0) return line.slice(startPos);
        if (idx === endLine - startLine) return line.slice(0, endPos);
        return line;
      })
      .join(TOKEN_NL);
    state.clipboard = textToCopy;
  },
  clear: async (step, state) => {
    await actionsRegistry.type({ ...step, payload: "clear" }, state);
    state.pendingExecution = "";
    state.terminalContent = "";
    updateTerminal(state);
  },
});

/**
 * Simulate steps with dynamic handling of actions
 * @param {object[]} steps
 * @param {string} outputPath
 */
async function simulateSteps(steps, outputPath) {
  svg = await setupSVG();

  // Run core simulation
  const state = {
    clipboard: "",
    env: { ...process.env },
    frameCount: 0,
    outputPath,
    pendingExecution: "",
    terminalContent: "",
  };

  const finish = () => finishRecording(state);
  // Quit on Escape, q, or Ctrl+C
  screen.key(["escape", "q", "C-c"], finish);

  try {
    for (const step of steps) {
      const action = actionsRegistry[step.action];
      if (action) {
        await action(step, state);
      } else {
        await abortExecution(state, `Unknown action: ${step.action}`);
      }
    }
  } catch (error) {
    await abortExecution(state, `Unexpected error: ${error.message}`);
  }

  await finish();
}

module.exports = { screen, svg, simulateSteps };
