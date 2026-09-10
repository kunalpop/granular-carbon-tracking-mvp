// Entry point: run the lifecycle simulation using the SYNTHETIC reference
// laptop produced by simulation/synthetic/generate.js.
// Run:  npm run simulate:synthetic
import * as path from "path";
process.env.LIFECYCLE_FILE = path.join(__dirname, "synthetic", "output", "reference-laptop.json");
require("./run-lifecycle");
