/**
 * @param {IGame} ns
 */
export async function main(ns) {
  if (ns.args.length > 0) {
    await sync1(ns, ns.args[0]);
  } else {
    while (true) {
      await sync(ns);
      await ns.sleep(4000);
    }
  }
  ns.tprint("sync complete");
}

export async function sync(ns) {
  for (const f of ns.ls("home", "js")) {
    await sync1(ns, f);
  }
}

export async function sync1(ns, filename) {
  const url = `http://localhost:44524/${filename}`;
  const content = new TextDecoder("utf-8").decode(await (await fetch(url, {
    cache: "no-cache",
  })).arrayBuffer());
  if (content.length === 0) return;
  if (content != ns.read(filename)) {
    console.debug("changed content, overwriting " + filename);
    await ns.rm(filename);  // Clear the script so that the module also gets cleared.
    ns.write(filename, content, "w");
  }
}
