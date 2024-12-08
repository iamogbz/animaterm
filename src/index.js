#!/usr/bin/env node
const path = require("path");
const { simulateSteps } = require("./core");

const [, _, scriptPath, outputPath] = process.argv;
// prefer using the path provided in the terminal but fallback to env config
const finalOutputPath = outputPath || process.env.OUTPUT_PATH || outputPath;
/** @type {Step[]} imported as {@link JSON} */
const script = require(path.resolve(scriptPath));

// Run the simulation
simulateSteps(script, path.resolve(finalOutputPath));
