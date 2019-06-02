import { Job } from "scheduler.js";

function haveEnoughRam(ns: IGame): boolean {
  const scheduledJobs: Job[] = JSON.parse(ns.read("scheduler_db.txt") || "[]");
  return scheduledJobs.some(j => j.args[1] == "extra_weakens");
}

function moneyAvailableToBuy(ns: IGame) {
  const cash = ns.getServerMoneyAvailable("home")
  let equities = 0;
  for (const sym of ns.getStockSymbols()) {
      equities += ns.getStockPosition(sym)[0] * ns.getStockPrice(sym);
  }
  const maxCommitment = (cash + equities) / 2;
  const available = Math.max(0, maxCommitment - equities);

  // We don't want to trade on very small fractions of our liquid assets,
  // because
  if (available < 0.1 * (cash + equities)) return 0;

  return available;
}

function buy(ns: IGame, stockInfo: StockInfo[], available: number) {
  if (available === 0) return;

  // Find some good stuff to buy.
  const minimumPosition = 100000 * 1000;
  const toBuy = stockInfo.filter(s => s.forecast > 0.7 && s.shares === 0);
  if (toBuy.length === 0) {
      return;
  }
  const amountPerStock = available / toBuy.length;
  if (amountPerStock < minimumPosition) return;
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

interface StockInfo {
  sym: string;
  shares: number;
  sharePrice: number;
  askPrice: number;
  bidPrice: number;
  costBasis: number;
  forecast: number;
}

function trade(ns: IGame, tradeHistory: number[]) {
  if (!haveEnoughRam(ns)) return;

  let availableForPurchases = moneyAvailableToBuy(ns);
  ns.print(`$${availableForPurchases} is available to buy stocks`);

  const stockInfo: StockInfo[] = ns.getStockSymbols().map(sym => {
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
      if (stock.shares === 0 || stock.forecast > 0.5) continue;

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

export async function main(ns: IGame) {
  ns.disableLog("ALL");

  let tradeHistory: number[] = []

  while (true) {
      trade(ns, tradeHistory);

      const historyLength = 20;
      while (tradeHistory.length > historyLength) {
        tradeHistory.shift();
      }
      if (tradeHistory.length == historyLength) {
        const sum = tradeHistory.reduce((a, b) => a + b);
        if (sum < 0) {
          ns.tprint(`our absolute profit over the last ${tradeHistory.length} trades is ${sum}, which is less than 1`);
          return;
        }
      }

      await ns.sleep(60000);
  }
}
