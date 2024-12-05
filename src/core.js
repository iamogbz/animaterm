const { ChildProcess, exec, spawn } = require("child_process");
const fs = require("fs");
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
            reject(new Error(`Timeout waiting for output: "${step.payload}"`));
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
}

/**
 * Record a session using Terminalizer CLI
 * @param {string} outputPath
 * @returns {Promise<ChildProcess>}
 */
function startRecording(outputPath) {
  const paths = getPaths(outputPath);

  // Ensure recording directory exists
  if (!fs.existsSync(paths.recordingDir)) {
    fs.mkdirSync(paths.recordingDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    const execCmd = `terminalizer record ${paths.recordingData}`;
    const process = exec(execCmd, { shell: "bash" });

    console.log("Start recording", execCmd);

    process.on("error", (error) => {
      reject(error);
    });

    process.stdin?.write('echo "Recording started..."\n');
    resolve(process);
  });
}

/**
 * Stop recording
 * @param {ChildProcess} process
 * @returns {Promise<void>}
 */
function stopRecording(process) {
  return new Promise((resolve) => {
    process.stdin?.end();
    process.on("close", () => {
      console.log("Recording complete");
      resolve();
    });
  });
}

/**
 * Render the recorded session
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
function renderRecording(outputPath) {
  const paths = getPaths(outputPath);

  return new Promise((resolve, reject) => {
    exec(
      `terminalizer render ${paths.recordingName} --output ${paths.recordingDir}`,
      (err) => {
        if (err) {
          reject(err);
        } else {
          console.log("Recording rendered to", paths.renderedPath);
          resolve();
        }
      }
    );
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
    recorderProcess = await startRecording(outputPath);
    await executeSteps(recorderProcess, steps);
  } catch (error) {
    console.error("Unexpected error:", error.message);
  } finally {
    if (recorderProcess) {
      await stopRecording(recorderProcess);
      await renderRecording(outputPath);
    }
  }
}

module.exports = { simulateSteps };
