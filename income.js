export async function main(ns) {
    const filename = "ewma_income.txt";
    ns.rm(filename);
    let observations = 0;
    let average = 0;
    let money = ns.getServerMoneyAvailable("home");
    let when = Date.now();
    const alpha = 0.025;
    while (true) {
        await ns.sleep(1000);
        let newMoney = ns.getServerMoneyAvailable("home");
        let newWhen = Date.now();
        // Note that the timestamps are in milliseconds, so we have to multiply by 1000 to
        // get the per-second rate.
        const rate = 1000 * (newMoney - money) / (newWhen - when);
        money = newMoney;
        when = newWhen;
        if (rate < 0) {
            // Don't count ticks where we spent money on net.
            // Since spending tends to outstrip income, but only in moments when we spend,
            // we can somewhat count on getting a reliable income measurement whenever money
            // is going up.
            continue;
        }
        if (observations === 0 && average === 0) {
            // If we have no data, use our first observation as the average. If this is an anomaly, it may take
            // a while to correct. But after two minutes, it will only have a weight of 0.02, and its importance
            // will further diminish as time goes on.
            average = rate;
        }
        else {
            average = alpha * rate + (1 - alpha) * average;
        }
        ++observations;
        if (observations % 60 === 0) {
            ns.write(filename, average.toString(), "w");
            ns.tprint(average);
        }
    }
}
