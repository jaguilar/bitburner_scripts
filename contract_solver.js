import { Scheduler } from "scheduler.js";

function* primeGen() {
    let primes = [2, 3, 5, 7, 11];
    for (let i = 0; i < primes.length; ++i) yield primes[i];
    for (let i = 13; ; i += 2) {
        if (_.some(primes, p => (i % p) === 0)) {
            continue;
        }
        primes.push(i);
        yield i;
    }
}

async function largestPrimeFactor(n) {
    let primes = primeGen()
    let remainder = n;
    let limit = Math.sqrt(remainder);
    let largestFactor = 1;
    let attempts = 0;  // We sleep from time to time so as not to freeze the UI.
    for (let f = primes.next().value; f < limit; f = primes.next().value) {
        while ((remainder % f) === 0) {
            remainder = remainder / f;
            limit = Math.sqrt(remainder);
            largestFactor = f;
        }
        ++attempts;
        if (attempts > 1000) {
            await ns.sleep(30);
            attempts = 0;
        }
    }
    return Math.max(largestFactor, remainder);
}

function generateTrailingIPComponents(s, depth, soFar) {
    if (depth == 5) {
        if (s.length === 0) return [soFar];
        return [];
    }
    let solutions = [];
    for (let i = 1; i <= 3 && i <= s.length; ++i) {
        let part = s.slice(0, i);
        let asInt = parseInt(part);

        if (asInt > 255 || (part[0] == '0' && part.length > 1)) continue;

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

function mergeOverlapping(n) {
    let sortedByStart = _.sortBy(n, [x => x[0]]);

    let solution = [];
    for (const interval of sortedByStart) {
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

async function solveContract(ns, {hostname: hostname, filename: filename}) {
    let cc = ns.codingcontract;
    let type = cc.getContractType(filename, hostname);
    let solution;

    if (type == "Find Largest Prime Factor") {
        solution = await largestPrimeFactor(cc.getData(filename, hostname));
    } else if (type == "Generate IP Addresses") {
        solution = generateIPAddresses(cc.getData(filename, hostname));
    } else if (type == "Merge Overlapping Intervals") {
        solution = mergeOverlapping(cc.getData(filename, hostname));
    } else {
        ns.write("contract_log.txt", `unhandled coding contract ${hostname}/${filename}: ${type}\n`);
        return;
    }

    if (cc.attempt(solution, filename, hostname)) {
        ns.write("contract_log.txt", `contract solved: ${hostname}/${filename}\n`);
    } else {
        throw new Error(`incorrect solution on contract ${hostname}/${filename}: ${solution}`)
    }
}

function findContractsOn(ns, hostname) {
    return _.map(ns.ls(hostname, "cct"), f => { return {hostname: hostname, filename: f} });
}

function findContracts(ns) {
    let scheduler = new Scheduler(ns);
    scheduler.load();

    return _(scheduler.servers).
        map(s => findContractsOn(ns, s.hostname)).
        flatten().
        value();
}

async function solveAllPendingContracts(ns) {
    ns.rm("contract_log.txt");
    for (let contract of findContracts(ns)) {
        await solveContract(ns, contract);
        await ns.sleep(100);
    }
}

export async function main(ns) {
    while (true) {
        await solveAllPendingContracts(ns);
        await ns.sleep(60000);
    }
}
