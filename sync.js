/**
 * @param {IGame} ns
 */
export async function main(ns) {
  await sync(ns);
}

export async function sync(ns) {
  for (const f of ns.ls("home", "js")) {
    await sync1(ns, f);
  }
}

export async function sync1(ns, filename) {
  const tmpfile = `tmp-${Math.floor(Math.random() * 100000)}.js`;
  await ns.wget(`https://raw.githubusercontent.com/jaguilar/bitburner_scripts/master/${filename}`, tmpfile);
  const content = ns.read(tmpfile);
  if (content.length === 0) continue;
  if (content != ns.read(filename)) {
    console.debug("changed content, overwriting " + filename);
    ns.write(filename, content, "w");
  }
  ns.rm(tmpfile);
}
