#!/usr/bin/env node
const path = require("path");
const { getArgs, simulateSteps } = require("./core");

const args = getArgs();

/** @type {Step[]} imported as {@link JSON} */
const script = require(path.resolve(args.animationScript));

// Run the simulation
simulateSteps(script, path.resolve(args.animationOutput));
