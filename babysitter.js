import {sync} from "sync.js";

export async function main(ns) {
  while (true) {
    if (ns.isRunning(ns.args[0], "home", ...ns.args.slice(1))) {
      await ns.sleep(1000);
      continue;
    }

    // If it's not running, sync all of our JS and restart the program.
    await sync(ns);
    await ns.run(ns.args[0], 1, ...ns.args.slice(1));
    await 15000;
  }
}
