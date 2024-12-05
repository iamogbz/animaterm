const blessed = require("blessed");
const { createCanvas } = require("canvas");
const GIFEncoder = require("gifencoder");
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
    fps: 15,
    quality: 10,
    /** 0 means repeat forever */
    repeat: 0,
    timing: {
      secondMs: 1000,
    },
    typing: {
      speedMs: 100,
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

// Canvas and GIF setup
const { height, width } = config.dimensionsPx;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext("2d");
const encoder = new GIFEncoder(width, height);
encoder.start();
encoder.setRepeat(config.animation.repeat);
encoder.setDelay(config.animation.delay);
encoder.setQuality(config.animation.quality);

/**
 * Get all lines that have been displayed in the terminal as list
 * @param {{ terminalContent: string; }} state
 */
function getTerminalLines(state) {
  return state.terminalContent.split(TOKEN_NL);
}

/**
 * Get visible lines from the terminal content as list
 * @param {{ terminalContent: string; }} state
 */
function getVisibleTerminalLines(state) {
  const lines = getTerminalLines(state);
  return lines.slice(-config.lineCount);
}
/**
 * Get visible lines from the terminal content as single string blob
 * @param {{ terminalContent: string; }} state
 */
function getVisibleTerminalContent(state) {
  return getVisibleTerminalLines(state).join(TOKEN_NL);
}

/**
 * Update the terminal's display content
 * @param {{ terminalContent: any; clipboard?: string; }} state
 */
function updateTerminal(state) {
  terminalBox.setContent(getVisibleTerminalContent(state));
  screen.render();
  recordFrame(state);
}

/**
 * Record a frame of the terminal state
 * @param {{ terminalContent: string; }} state
 */
function recordFrame(state) {
  ctx.fillStyle = config.animation.css.backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${config.animation.css.fontSize} ${config.animation.css.fontStyle}`;
  ctx.fillStyle = config.animation.css.color;
  getVisibleTerminalLines(state).forEach((line, index) => {
    ctx.fillText(
      line,
      config.dimensionsPx.padding.x,
      config.dimensionsPx.padding.y + index * config.dimensionsPx.lineHeight
    );
  });

  // @ts-ignore - Ignore type checking for {CanvasRenderingContext2D}, as it's valid JS
  encoder.addFrame(ctx);
}

/**
 * Utility to terminate and save recording
 * @param {{ outputPath: string; terminalContent: string; }} state
 */
async function finishRecording(state, exitCode = 0) {
  // delay last frame for easy grok
  await delay(config.animation.timing.secondMs * 5);
  recordFrame(state);
  const { outputPath } = state;
  encoder.finish();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, encoder.out.getData());
  console.log(`Recording saved as '${outputPath}'`);
  process.exit(exitCode);
}

/**
 * Utility to throw an error and abort execution
 * @param {{ clipboard?: string | undefined; outputPath: string; pendingExecution: string; terminalContent: string; }} state
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
      step: {action:string; payload: string | {startLine: number, endLine: number, startPos: number, endPos:number}; timeoutMs: number},
      state: { pendingExecution:string; terminalContent: string; clipboard: string; }
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
      await delay((1 + Math.random()) * config.animation.typing.speedMs);
    }
  },
  enter: async (_, state) => {
    // execute the last set of instructions typed
    const toExecute = state.pendingExecution.trim();
    state.pendingExecution = "";
    state.terminalContent += TOKEN_NL;
    updateTerminal(state);
    return new Promise((resolve, reject) => {
      if (toExecute) {
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
          // wait for a while between executed commands
          await delay(config.animation.timing.secondMs);
          updateTerminal(state);
          resolve();
        });

        child.on("error", (error) => {
          reject(error);
        });
      }
    });
  },
  waitForOutput: async ({ payload, timeoutMs = 5000 }, state) => {
    const startTime = Date.now();
    while (!state.terminalContent.includes(`${payload}`)) {
      if (Date.now() - startTime > timeoutMs) {
        throw Error(`Timeout waiting for output: "${payload}"`);
      }
      await delay(config.animation.timing.secondMs);
      updateTerminal(state);
    }
  },
  paste: async (_, state) => {
    state.pendingExecution += state.clipboard;
    state.terminalContent += state.clipboard;
    updateTerminal(state);
    // wait for a while after pasting
    await delay(config.animation.timing.secondMs);
    updateTerminal(state);
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
  clear: async (_, state) => {
    state.pendingExecution = "";
    state.terminalContent = "";
    updateTerminal(state);
  },
});

// Delay function
function delay(/** @type {number} */ ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Simulate steps with dynamic handling of actions
 * @param {object[]} steps
 * @param {string} outputPath
 */
async function simulateSteps(steps, outputPath) {
  // Run core simulation
  const state = {
    clipboard: "",
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

module.exports = { encoder, screen, simulateSteps };
