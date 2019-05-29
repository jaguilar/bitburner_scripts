export async function main(ns) {
  while (true) await ns.grow(ns.args[0]);
}
