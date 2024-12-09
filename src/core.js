const blessed = require("blessed");
const { exec } = require("child_process");
const gif = require("./renderer/gif");
const svg = require("./renderer/svg");
const terminalizer = require("./renderer/terminalizer");
const { TOKEN_NL, SEC_TO_MS } = require("./constants");
const { getExtension } = require("./utils");

/** @type {Config} TODO: export config */
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
    renderer: "svg",
    /** 0 means repeat forever */
    repeat: 0,
    typing: {
      speedMs: 30,
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
 * Get all lines that have been displayed in the terminal as list
 *
 * @param {State} state
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
 * @param {State} state
 */
function getVisibleTerminalLines(state) {
  const paddingLength = 5;
  const lineNumber = (/** @type {number} */ n) =>
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
 * @param {State} state
 */
function recordFrame(state) {
  state.frames.push(getVisibleTerminalLines(state));
}

/**
 * Delay function
 *
 * @param {State} state
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
 * @param {State} state
 */
function getVisibleTerminalContent(state) {
  return getVisibleTerminalLines(state).join(TOKEN_NL);
}

/**
 * Update the terminal's display content
 *
 * @param {State} state
 */
function updateTerminal(state) {
  terminalBox.setContent(getVisibleTerminalContent(state));
  screen.render();
  recordFrame(state);
}

/**
 * Utility to terminate and save recording
 *
 * @param {State} state
 */
async function finishRecording(state, exitCode = 0) {
  await delay(state, SEC_TO_MS * 5);

  const renderers = {
    tlz: terminalizer.render,
    gif: gif.render,
    svg: svg.render,
  };
  const fileExt = getExtension(state.outputPath);
  const renderFormat =
    fileExt in renderers ? fileExt : config.animation.renderer;

  const filePath = renderers[renderFormat](state, config);

  console.log("Recording saved as", filePath);
  process.exit(exitCode);
}

/**
 * Utility to throw an error and abort execution
 *
 * @param {State} state
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

function randomTypeSpeedMs() {
  return (1 + Math.random()) * config.animation.typing.speedMs;
}

/**
  Registry of actions with their implementation
  @type {ActionHandlers}
*/
const actionsRegistry = {
  type: async ({ payload }, state) => {
    const text = `${payload}`;
    state.pendingExecution += text;
    for (const char of text) {
      state.terminalContent += char;
      updateTerminal(state);
      // randomise type speed
      await delay(state, randomTypeSpeedMs());
    }
    await delay(state, randomTypeSpeedMs());
  },
  delete: async (step, state) => {
    const deleteSlowDownMult = 3;
    if (typeof step.payload !== "number")
      throw Error(`Faulty payload: ${JSON.stringify(step)}`);
    for (let i = 0; i < step.payload; i++) {
      state.terminalContent = state.terminalContent.slice(0, -1);
      updateTerminal(state);
      await delay(state, randomTypeSpeedMs() * deleteSlowDownMult);
    }
    await delay(state, randomTypeSpeedMs() * deleteSlowDownMult);
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
    // TODO: show copy highlight in the terminal with delay
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
  clear: async (_, state) => {
    await actionsRegistry.type({ action: "type", payload: "clear" }, state);
    state.pendingExecution = "";
    state.terminalContent = "";
    updateTerminal(state);
  },
};

/**
 * Simulate steps with dynamic handling of actions
 *
 * @param {Step[]} steps
 * @param {string} outputPath
 */
async function simulateSteps(steps, outputPath) {
  /** @type {State} */
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
      if (step.action in actionsRegistry) {
        // @ts-ignore faulty type intersection
        await actionsRegistry[step.action](step, state);
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
