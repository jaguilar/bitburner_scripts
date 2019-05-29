/**
 * @param {IGame} ns
 */
export async function main(ns) {
  for (const f of ns.ls("home", "js")) {
    const tmpfile = `tmp-${Math.floor(Math.random() * 100000)}.js`;
    await ns.wget(`https://raw.githubusercontent.com/jaguilar/bitburner_scripts/master/${f}`, tmpfile);
    const content = ns.read(tmpfile);
    if (content.length === 0) continue;
    if (content != ns.read(f)) {
      console.debug("changed content, overwriting " + f);
      ns.write(f, content, "w");
    }
    ns.rm(tmpfile);
  }
}
