/**
 * @param {IGame} ns
 */
export async function main(ns) {
  if (ns.args.length > 0) {
    await sync1(ns, ns.args[0]);
  } else {
    await sync(ns);
  }
}

export async function sync(ns) {
  for (const f of ns.ls("home", "js")) {
    await sync1(ns, f);
  }
}

export async function sync1(ns, filename) {
  const url = `https://raw.githubusercontent.com/jaguilar/bitburner_scripts/master/${filename}`;
  const content = new TextDecoder("utf-8").decode(await (await fetch(url, {
    cache: "no-cache",
  })).arrayBuffer());
  if (content.length === 0) return;
  if (content != ns.read(filename)) {
    console.debug("changed content, overwriting " + filename);
    ns.write(filename, content, "w");
  }
}
