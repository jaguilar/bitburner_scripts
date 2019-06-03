function haveEnoughRam(ns) {
    const scheduledJobs = JSON.parse(ns.read("scheduler_db.txt") || "[]");
    return scheduledJobs.some(j => j.args[1] == "extra_weakens");
}
function moneyAvailableToBuy(ns) {
    const cash = ns.getServerMoneyAvailable("home");
    let equities = 0;
    for (const sym of ns.getStockSymbols()) {
        equities += ns.getStockPosition(sym)[0] * ns.getStockPrice(sym);
    }
    const maxCommitment = (cash + equities) / 2;
    const available = Math.max(0, maxCommitment - equities);
    // We don't want to trade on very small fractions of our liquid assets,
    // because
    if (available < 0.1 * (cash + equities))
        return 0;
    return available;
}
function buy(ns, stockInfo, available) {
    if (available === 0)
        return;
    // Find some good stuff to buy.
    const minimumPosition = 100000 * 1000;
    const toBuy = stockInfo.filter(s => s.forecast > 0.7 && s.shares === 0);
    if (toBuy.length === 0) {
        return;
    }
    const amountPerStock = available / toBuy.length;
    if (amountPerStock < minimumPosition)
        return;
    for (const stock of toBuy) {
        const shares = Math.floor(amountPerStock / stock.askPrice);
        const actualCost = ns.getStockPurchaseCost(stock.sym, shares, "L");
        const actualCostRatio = actualCost / amountPerStock;
        if (actualCostRatio > 1.02) {
            // Don't buy, because either commissions or growth are adding significant transaction overhead.
            ns.print(`Didn't buy because actualCost=${actualCost} was much higher than theoretical cost=${amountPerStock}`);
            continue;
        }
        ns.print(`ns.buystock(${stock.sym}, ${Math.floor(shares / actualCostRatio)})`);
        ns.buyStock(stock.sym, Math.floor(shares / actualCostRatio));
    }
}
function trade(ns, tradeHistory) {
    if (!haveEnoughRam(ns))
        return;
    let availableForPurchases = moneyAvailableToBuy(ns);
    ns.print(`$${availableForPurchases} is available to buy stocks`);
    const stockInfo = ns.getStockSymbols().map(sym => {
        const pos = ns.getStockPosition(sym);
        const shares = pos[0];
        const sharePrice = ns.getStockPrice(sym);
        return {
            sym: sym,
            shares: shares,
            sharePrice: sharePrice,
            askPrice: ns.getStockAskPrice(sym),
            bidPrice: ns.getStockBidPrice(sym),
            fmv: shares * sharePrice,
            costBasis: pos[1] * sharePrice,
            forecast: ns.getStockForecast(sym),
        };
    });
    console.info(stockInfo);
    // Find stocks we need to sell.
    for (const stock of stockInfo) {
        if (stock.shares === 0 || stock.forecast > 0.5)
            continue;
        const moneyBefore = ns.getServerMoneyAvailable("home");
        const gains = ns.getStockSaleGain(stock.sym, stock.shares, "L");
        ns.print(`Selling ${stock.sym} for a profit of ` +
            `${(gains - stock.costBasis).toExponential()} on a basis of ${stock.costBasis.toExponential()}`);
        ns.sellStock(stock.sym, stock.shares);
        const profitByMoney = ns.getServerMoneyAvailable("home") - moneyBefore;
        const profitByGains = gains - stock.costBasis;
        if (Math.abs(profitByMoney - profitByGains) > profitByMoney * 0.01) {
            throw new Error(`byMoney=${profitByMoney} byGains=${profitByGains} gains=${gains} costBasis=${stock.costBasis}`);
        }
        tradeHistory.push(profitByMoney);
        availableForPurchases += gains;
    }
    buy(ns, stockInfo, availableForPurchases);
}
export async function main(ns) {
    ns.disableLog("ALL");
    let tradeHistory = [];
    while (true) {
        trade(ns, tradeHistory);
        const maxHistoryLength = 20;
        while (tradeHistory.length > maxHistoryLength) {
            tradeHistory.shift();
        }
        const sum = tradeHistory.reduce((a, b) => a + b, 0);
        if (tradeHistory.length > 0) {
            ns.tprint(`average profit per trade: $${(sum / tradeHistory.length).toPrecision(2)}`);
        }
        if (tradeHistory.length == maxHistoryLength && sum < 0) {
            ns.tprint(`our absolute profit over the last ${tradeHistory.length} trades is ${sum}, which is less than 0`);
            return;
        }
        await ns.sleep(60000);
    }
}
