const path = require("path");
const pty = require("node-pty");
const { spawn } = require("child_process");

/**
 * Records a Terminalizer session, types a message, and renders it.
 * @param {string} outputPath - Path for the rendered output (without extension)
 */
async function recordAndRender(outputPath) {
  const recordingName = outputPath.replace(/\.[^/.]+$/, ""); // Remove any extension
  const recordingDir = "./"; // Output in the current directory
  const recordingPath = `${recordingDir}${recordingName}.yml`;

  // Start Terminalizer recording with -k flag (keep recording open)
  const recordProcess = pty.spawn("terminalizer", ["record", recordingName, "-k"], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env,
  });

  console.log("Recording started. Simulating input...");

  // Simulate typing "Testing testing 1 2 3" and stop the recording
  setTimeout(() => {
    recordProcess.write("echo 'Testing testing 1 2 3'\n");
    console.log("Input written.");
  }, 1000);

  setTimeout(() => {
    recordProcess.write("\x04"); // Send EOF to stop recording
    console.log("Recording stopped.");
  }, 2000);

  // Use `onData` to handle output from the terminal
  recordProcess.onData((data) => {
    console.log(data); // You can log or process terminal output here
  });

  // Use `onExit` to handle the exit of the recording process
  recordProcess.onExit((exitCode, signal) => {
    console.log(`Recording process exited with code ${exitCode} and signal ${signal}`);

    console.log("Rendering output...");
    const renderProcess = spawn("terminalizer", ["render", recordingPath], {
      shell: true,
    });

    renderProcess.on("close", (code) => {
      if (code === 0) {
        console.log(`Recording rendered successfully to ${recordingName}.gif`);
      } else {
        console.error(`Rendering failed with exit code ${code}`);
      }
    });
  });

  // No need to handle errors with recordProcess.on('error')
  // As we are using the specific event handlers for node-pty.
}

// Example usage
recordAndRender("test_recording");
