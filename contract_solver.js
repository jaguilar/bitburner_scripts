function* servers(ns) {
    let queue = [];
    let visited = new Set();
    while (queue.length > 0) {
        const elt = queue.shift();
        yield elt;
        visited.add(elt);
        for (const neighbor of ns.scan(elt)) {
            if (visited.has(neighbor))
                continue;
            queue.push(neighbor);
        }
    }
}
function* contracts(ns) {
    for (const server of servers(ns)) {
        yield* ns.ls(server, "cct").map(f => { return { hostname: server, filename: f }; });
    }
}
function* primeGen() {
    let primes = [2, 3, 5, 7, 11];
    for (let i = 0; i < primes.length; ++i)
        yield primes[i];
    for (let i = 13;; i += 2) {
        if (primes.some(p => (i % p) === 0))
            continue;
        primes.push(i);
        yield i;
    }
}
async function largestPrimeFactor(ns, n) {
    let primes = primeGen();
    let remainder = n;
    let limit = Math.sqrt(remainder);
    let largestFactor = 1;
    let attempts = 0; // We sleep from time to time so as not to freeze the UI.
    for (let f = primes.next().value; f < limit; f = primes.next().value) {
        while ((remainder % f) === 0) {
            remainder = remainder / f;
            limit = Math.sqrt(remainder);
            largestFactor = f;
        }
        ++attempts;
        if (attempts > 1000) {
            await ns.sleep(30); // Allow an animation frame to occur.
            attempts = 0;
        }
    }
    return Math.max(largestFactor, remainder);
}
function generateTrailingIPComponents(s, depth, soFar) {
    if (depth == 5) {
        if (s.length === 0)
            return [soFar];
        return [];
    }
    let solutions = [];
    for (let i = 1; i <= 3 && i <= s.length; ++i) {
        let part = s.slice(0, i);
        let asInt = parseInt(part);
        if (asInt > 255 || (part[0] == '0' && part.length > 1))
            continue;
        let partial = soFar.length === 0 ? part : `${soFar}.${part}`;
        for (const solution of generateTrailingIPComponents(s.slice(i), depth + 1, partial)) {
            solutions.push(solution);
        }
    }
    return solutions;
}
function generateIPAddresses(n) {
    return generateTrailingIPComponents(n.toString(), 1, "");
}
function algoStockTrader(prices, remainingTransactions) {
    if (remainingTransactions == 0)
        return 0;
    let lowestSeen = Infinity;
    let bestTrade = 0;
    for (let i = 0; i < prices.length; ++i) {
        if (lowestSeen > prices[i]) {
            lowestSeen = prices[i];
        }
        // Consider whether to sell this stock. Only local maxima are valid sale points.
        if (i == 0)
            continue;
        if (prices[i] < prices[i - 1])
            continue;
        if (i < prices.length - 1 && prices[i + 1] > prices[i])
            continue;
        // This is a local maximum. The profit for selecting this as the selling
        // point is the profit from this trade plus the profit from running the algorithm
        // again on the rest of the prices.
        const thisTrade = prices[i] - lowestSeen + algoStockTrader(prices.slice(i + 1), remainingTransactions - 1);
        if (thisTrade > bestTrade)
            bestTrade = thisTrade;
    }
    return bestTrade;
}
function mergeOverlapping(n) {
    n.sort((x, y) => x[0] - y[0]);
    let solution = [];
    for (const interval of n) {
        if (solution.length === 0) {
            solution.push(interval);
            continue;
        }
        let lastInterval = solution[solution.length - 1];
        if (lastInterval[1] <= interval[0]) {
            // Non-overlapping. Since the intervals are sorted, we know that no
            // more overlapping intervals are coming. So, push this interval and continue.
            solution.push(interval);
            continue;
        }
        // Overlapping. Maybe extend the lastInterval.
        lastInterval[1] = Math.max(interval[1], lastInterval[1]);
    }
    return solution;
}
async function solveContract(ns, contract) {
    let cc = ns.codingcontract;
    let type = cc.getContractType(contract.filename, contract.hostname);
    let solution;
    const nameForDbg = `${contract.hostname}/${contract.filename}`;
    const data = cc.getData(contract.filename, contract.hostname);
    if (type == "Find Largest Prime Factor") {
        solution = await largestPrimeFactor(ns, data);
    }
    else if (type == "Generate IP Addresses") {
        solution = generateIPAddresses(data);
    }
    else if (type == "Merge Overlapping Intervals") {
        solution = mergeOverlapping(data);
    }
    else if (type == "Algorithmic Stock Trader I") {
        solution = algoStockTrader(data, 1);
    }
    else if (type == "Algorithmic Stock Trader II") {
        solution = algoStockTrader(data, Infinity);
    }
    else if (type == "Algorithmic Stock Trader III") {
        solution = algoStockTrader(data, 2);
    }
    else if (type == "Algorithmic Stock Trader IV") {
        const numTradesAllowed = data[0];
        const prices = data[1];
        solution = algoStockTrader(prices, numTradesAllowed);
    }
    else {
        ns.write("contract_log.txt", `unhandled coding contract ${nameForDbg}: ${type}\n`);
        return;
    }
    if (cc.attempt(solution, contract.filename, contract.hostname)) {
        ns.write("contracts_solved.txt", `contract solved: ${nameForDbg}\n`);
    }
    else {
        throw new Error(`incorrect solution on contract ${nameForDbg}: ${solution}`);
    }
}
async function solveAllPendingContracts(ns) {
    ns.rm("contract_log.txt");
    for (let contract of contracts(ns)) {
        await solveContract(ns, contract);
        await ns.sleep(100);
    }
}
export async function main(ns) {
    ns.disableLog("rm");
    while (true) {
        await solveAllPendingContracts(ns);
        await ns.sleep(60000);
    }
}
