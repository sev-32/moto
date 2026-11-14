// A worker thread of the ensemble: loads the body once, then runs the episodes it is sent.
import { parentPort } from "node:worker_threads";
import { METHODS } from "./methods/index.mjs";
import { byId } from "./events/index.mjs";
import { runEpisode } from "./core/episode.mjs";

parentPort.on("message", (job) => {
  if (job === "exit") { process.exit(0); }
  try {
    const rec = runEpisode({ method: METHODS[job.method], event: byId[job.event], seed: job.seed, mods: job.mods, trace: job.trace });
    parentPort.postMessage({ id: job.id, rec });
  } catch (e) {
    parentPort.postMessage({ id: job.id, error: String(e?.stack || e) });
  }
});
parentPort.postMessage({ ready: true });
