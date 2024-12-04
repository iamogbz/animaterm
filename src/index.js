const path = require("path");
const { simulateSteps } = require("./core");

// Example script demonstrating extensibility
const [, _, scriptPath, outputPath] = process.argv;
const script = require(path.resolve(scriptPath));

// Run the simulation
simulateSteps(script, path.resolve(process.env.OUTPUT_PATH || outputPath));
