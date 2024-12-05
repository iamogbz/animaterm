const { ChildProcess, spawn } = require("child_process");
const path = require("path");

// Configuration
const RECORDING_EXT = ".yml";
const ANIMATION_EXT = ".gif";
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Get paths to recording data
 * @param {string} outputPath
 */
function getPaths(outputPath) {
  const resolvedPath = path.resolve(outputPath);
  const recordingName = path.basename(resolvedPath, ANIMATION_EXT);
  const recordingDir = path.dirname(resolvedPath);

  return Object.freeze({
    recordingDir,
    recordingName,
    recordingData: path.join(recordingDir, `${recordingName}${RECORDING_EXT}`),
    renderedPath: path.join(recordingDir, `${recordingName}${ANIMATION_EXT}`),
  });
}

/**
 * Simulates typing a command character by character
 * @param {ChildProcess} process
 * @param {string} text
 * @param {number} delayMs
 */
async function simulateTyping(process, text, delayMs = 30) {
  for (const char of text) {
    process.stdin?.write(char);
    const timeoutMs = ((1 + Math.random()) * delayMs) / 2;
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  }
}

/**
 * Simulates pressing "Enter"
 * @param {ChildProcess} process
 */
function simulateEnter(process) {
  process.stdin?.write("\n");
}

/**
 * Captures specific output for copy simulation
 * @param {string} output
 * @param {{ line: number; position: number; }} start
 * @param {{ line: number; position: number; }} end
 */
function captureOutput(output, start, end) {
  const lines = output.split("\n");
  const selectedLines = lines.slice(start.line - 1, end.line);
  return selectedLines
    .map((line, i) => {
      if (i === 0 && i === selectedLines.length - 1) {
        return line.slice(start.position, end.position);
      } else if (i === 0) {
        return line.slice(start.position);
      } else if (i === selectedLines.length - 1) {
        return line.slice(0, end.position);
      }
      return line;
    })
    .join("\n");
}

/**
 * Simulates pasting text
 * @param {ChildProcess} process
 * @param {string} text
 */
function simulatePaste(process, text) {
  process.stdin?.write(text);
}

/**
 * Clears the terminal
 * @param {ChildProcess} process
 */
function clearTerminal(process) {
  process.stdin?.write("\u001b[2J\u001b[0;0H");
}

/**
 * Executes steps from the JSON configuration
 * @param {ChildProcess} process
 * @param {{action:string; payload: string | {startLine: number, endLine: number, startPos: number, endPos:number}; timeout: number}[]} steps
 */
async function executeSteps(process, steps) {
  let output = "";
  let clipboard = "";

  process.stdout?.on("data", (/** @type {unknown} */ data) => {
    output += `${data}`;
    console.log(data);
  });

  process.stderr?.on("data", (/** @type {unknown} */ data) => {
    console.error("Error [step]:", data);
  });

  try {
    for (const step of steps) {
      switch (step.action) {
        case "type": {
          await simulateTyping(process, `${step.payload}`);
        }
        case "enter": {
          simulateEnter(process);
        }
        case "waitForOutput": {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(
                new Error(`Timeout waiting for output: "${step.payload}"`)
              );
            }, step.timeout || DEFAULT_TIMEOUT_MS);

            const interval = setInterval(() => {
              if (output.includes(`${step.payload}`)) {
                clearTimeout(timeout);
                clearInterval(interval);
                resolve(null);
              }
            }, 100);
          });
        }
        case "paste": {
          simulatePaste(process, clipboard);
        }
        case "copy": {
          if (typeof step.payload !== "object")
            throw Error(`Faulty payload: ${JSON.stringify(step)}`);
          clipboard = captureOutput(
            output,
            { line: step.payload.startLine, position: step.payload.startPos },
            { line: step.payload.endLine, position: step.payload.endPos }
          );
          console.log("Copied", clipboard);
        }
        case "clear": {
          clearTerminal(process);
        }
        default: {
          console.error("Unknown action:", step.action);
        }
      }
    }
  } catch (e) {
    console.error("Error during step execution:", e.message);
  }
}

/**
 * Record a session using Terminalizer CLI
 * @param {string} outputPath
 * @returns {ChildProcess}
 */
function startRecording(outputPath) {
  const paths = getPaths(outputPath);
  return spawn(
    "terminalizer",
    ["record", paths.recordingName, "--directory", paths.recordingDir],
    {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    }
  );
}

/**
 * Stop recording
 * @param {ChildProcess} process
 */
function stopRecording(process) {
  process.stdin?.write("\x04"); // Send EOF to terminate recording
  process.stdin?.end();
}

/**
 * Render the recorded session
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
function renderRecording(outputPath) {
  const paths = getPaths(outputPath);

  return new Promise((resolve, reject) => {
    const renderProcess = spawn(
      "terminalizer",
      ["render", paths.recordingData],
      {
        shell: true,
      }
    );

    renderProcess.on("close", (code) => {
      if (code === 0) {
        console.log("Recording rendered to", paths.renderedPath);
        resolve();
      } else {
        reject(new Error("Failed to render the recording."));
      }
    });
  });
}

/**
 * Simulate steps with dynamic handling of actions
 * @param {object[]} steps
 * @param {string} outputPath
 */
async function simulateSteps(steps, outputPath) {
  /** @type {ChildProcess | null} */
  let recorderProcess = null;

  try {
    recorderProcess = startRecording(outputPath);
    // await executeSteps(recorderProcess, steps);
  } catch (error) {
    console.error("Unexpected error:", error.message);
  } finally {
    if (recorderProcess) {
      stopRecording(recorderProcess);
      await renderRecording(outputPath);
    }
  }
}

module.exports = { simulateSteps };
