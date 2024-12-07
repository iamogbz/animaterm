const blessed = require("blessed");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { JSDOM } = require("jsdom");

// constants
const TOKEN_NL = "\n";
const SEC_TO_MS = 1000;

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
    typing: {
      speedMs: 20,
    },
    get msPerFrame() {
      return SEC_TO_MS / this.fps;
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
 *
 * @param {string[][]} frames - An array of text lines frames to animate.
 * @param {string} outputPath - The path to save the SVG file.
 */
function createSvgAnimation(frames, outputPath) {
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
        white-space: normal;
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
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, svgContent, "utf8");
  console.log(`SVG animation created at ${outputPath}`);
}

/**
 * Get all lines that have been displayed in the terminal as list
 *
 * @param {{ terminalContent: string; }} state
 */
function getTerminalLines(state) {
  return state.terminalContent.split(TOKEN_NL);
}

/**
 * Get the number of frames displayed for the milliseconds given
 *
 * @param {number} ms
 */
function msToFrameCount(ms) {
  return Math.floor(ms / config.animation.msPerFrame);
}

/**
 * Get visible lines from the terminal content as list
 *
 * @param {{ frames: string[][]; terminalContent: string; }} state
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
  const frameCount = state.frames.length;
  const cursorVisible =
    frameCount % Math.max(1, cursorVisibleFrames) <= cursorVisibleFrames / 2;
  if (lines && cursorVisible) {
    lines[lines.length - 1] += config.animation.cursor.token;
  }
  return lines.slice(-config.lineCount);
}

/**
 * Record a frame of the terminal state
 *
 * @param {{ frames: string[][]; terminalContent: string; }} state
 */
function recordFrame(state) {
  state.frames.push(getVisibleTerminalLines(state));
}

/**
 * Delay function
 *
 * @param {{ frames: string[][]; terminalContent: string; }} state
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
 *
 * @param {{ frames: string[][]; terminalContent: string; }} state
 */
function getVisibleTerminalContent(state) {
  return getVisibleTerminalLines(state).join(TOKEN_NL);
}

/**
 * Update the terminal's display content
 *
 * @param {{ clipboard?: string; frames: string[][]; terminalContent: any; }} state
 */
function updateTerminal(state) {
  terminalBox.setContent(getVisibleTerminalContent(state));
  screen.render();
  recordFrame(state);
}

/**
 * Utility to terminate and save recording
 *
 * @param {{ frames: string[][]; outputPath: string; terminalContent: string; }} state
 */
async function finishRecording(state, exitCode = 0) {
  await delay(state, SEC_TO_MS * 5);
  const { frames, outputPath } = state;

  createSvgAnimation(frames, outputPath);

  console.log("Recording saved as", outputPath);
  process.exit(exitCode);
}

/**
 * Utility to throw an error and abort execution
 *
 * @param {{ clipboard?: string | undefined; frames: string[][]; outputPath: string; pendingExecution: string; terminalContent: string; }} state
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

/**
  Registry of actions with their implementation
  @type {
    Record<string, (
      step: { action: "clear" | "copy" | "enter" | "paste" | "type" | "waitForOutput"; payload: string | { startLine: number, endLine: number, startPos: number, endPos:number }; timeoutMs: number},
      state: { env: Record<string, string | undefined>; frames: string[][]; pendingExecution:string; terminalContent: string; clipboard: string; }
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
  /** execute the last set of instructions typed */
  enter: async (_, state) => {
    const toExecute = state.pendingExecution.trim();
    state.pendingExecution = "";
    state.terminalContent += TOKEN_NL;
    updateTerminal(state);
    await delay(state, SEC_TO_MS);
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
          await delay(state, SEC_TO_MS);
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
      await delay(state, SEC_TO_MS);
    }
  },
  paste: async (_, state) => {
    state.pendingExecution += state.clipboard;
    state.terminalContent += state.clipboard;
    updateTerminal(state);
    await delay(state, SEC_TO_MS);
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
 *
 * @param {object[]} steps
 * @param {string} outputPath
 */
async function simulateSteps(steps, outputPath) {
  // Run core simulation
  const state = {
    clipboard: "",
    env: { ...process.env },
    frames: [],
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

module.exports = { screen, simulateSteps };
