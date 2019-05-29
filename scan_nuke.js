function tryCrack(ns, host) {
  if (ns.getHackingLevel() < ns.getServerRequiredHackingLevel(host)) return false;
  let has = f => ns.fileExists(f, "home");
  let openedPorts = 0;
  if (has("brutessh.exe")) { ns.brutessh(host); ++openedPorts; }
  if (has("ftpcrack.exe")) { ns.ftpcrack(host); ++openedPorts; }
  if (has("relaysmtp.exe")) { ns.relaysmtp(host); ++openedPorts; }
  if (has("httpworm.exe")) { ns.httpworm(host); ++openedPorts; }
  if (has("sqlinject.exe")) { ns.sqlinject(host); ++openedPorts; }
  if (openedPorts < ns.getServerNumPortsRequired(host)) return false;
  ns.nuke(host);
  return true;
}

async function doScanNuke(ns) {
  let visited = {home: true};
  let queue = ["home"];
  while (queue.length > 0) {
      let toVisit = (await ns.scan(queue.shift())).filter(h => !visited[h]);
      for (let i = 0; i < toVisit.length; ++i) {
          let h = toVisit[i];
          if (tryCrack(ns, h)) {
              visited[h] = true;
              queue.push(h);
          }
      }
  }
}

export async function main(ns) {
  while (true) {
      await doScanNuke(ns);
      await ns.sleep(60000);
  }
}
