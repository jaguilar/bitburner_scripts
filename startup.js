export async function main(ns) {
  await ns.rm("db_hack_calculator.txt");
  await ns.rm("scheduler_lock.txt");
  await ns.rm("scheduler_db.txt");

  await ns.run("hack_calculator_auto.js");
  await ns.run("server_buyer.js");
  await ns.run("scan_nuke.js");
  await ns.run("darkweb.js");
}
