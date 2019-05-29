import {Scheduler} from "scheduler.js";

export async function main(ns) {
    while (true) {
        await ns.sleep(1000);
        let scheduler = new Scheduler(ns);
        scheduler.load();

        let allRam = scheduler.ram();

        // We will buy a server if:
        // 1. It would increase our available ram by at least 0.2 OR
        //    it is the largest server class
        // 2. It costs less than half the money we currently have available.
        let buyRam = 1;
        let biggestServerRam = ns.getPurchasedServerMaxRam();
        ns.print(`maximum server size: ${biggestServerRam} MB`);
        const moneyAvailable = ns.getServerMoneyAvailable("home");
        for (;
            buyRam < biggestServerRam &&
                ns.getPurchasedServerCost(buyRam) < moneyAvailable * 0.5;
            buyRam = buyRam * 2) {
        }
        if (buyRam < allRam * 0.2 && buyRam < biggestServerRam) {
            await ns.sleep(60000);  // Run every 60s.
            continue;
        }

        // OK, we're gonna buy it. First maybe delete our smallest server.
        let purchasedByDeletionPreference = _(ns.getPurchasedServers()).map(
            hostname => _.find(scheduler.servers, s => s.hostname == hostname)
        ).orderBy(["ram"], ["asc"]).value();
        let killSomeServer = purchasedByDeletionPreference.length >= ns.getPurchasedServerLimit();
        if (killSomeServer) {
            if (purchasedByDeletionPreference[0].ram == biggestServerRam) {
                ns.tprint("We have maxed out our server count on the biggest servers. My work here is done.");
                return;
            }
            let toKill = purchasedByDeletionPreference[0].hostname;
            await scheduler.beginTransaction();
            ns.tprint("killing and deleting server: " + toKill)
            while (ns.killall(toKill)) await ns.sleep(1000);
            ns.deleteServer(toKill);
            await ns.sleep(10000);
        }
        ns.print(`ns.purchaseServer(${"pserv-" + buyRam}, ${buyRam})`);
        await ns.purchaseServer("pserv-" + buyRam, buyRam);

        if (killSomeServer) {
            try {
                scheduler.load();
                await scheduler.reschedule();
            } finally {
                scheduler.maybeCommitTransaction();
            }
        }
    }
}
