export async function main(ns) {
  while (true) await ns.weaken(ns.args[0]);
}
