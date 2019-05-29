export async function main(ns) {
  const args = [...ns.args];
  if (args.length > 2) {
      args[2] = parseInt(args[2]);
  }
  ns.exec(...args);
}
