function monkeyPatchJsPlumb(container) {
    if (!globalThis.originalGetInstance) {
        globalThis.originalGetInstance = jsPlumb.getInstance;
    }
    jsPlumb.getInstance = (arg) => {
        if (!container.capturedInstance) {
            container.capturedInstance = globalThis.originalGetInstance(arg);
        }
        return container.capturedInstance;
    };
}
export async function main(ns) {
    try {
        await mainNoTry(ns);
    }
    catch (e) {
        // While we're in hacking missions, sometimes our exceptions don't get reported?
        throw e;
    }
    finally {
        // Restore JSPlumb to its original state, so we can play the game manually if we want.
        jsPlumb.getInstance = globalThis.originalGetInstance;
    }
}
async function mainNoTry(ns) {
    // Before starting the mission, we need to monkey-patch jsplumb so that we can get a handle
    // to the instance. This instance is used to make connections between nodes.
    let container = { capturedInstance: null };
    monkeyPatchJsPlumb(container);
    startMission("Sector-12");
    if (!container.capturedInstance) {
        throw new Error("Unable to grab jsplumb instance.");
    }
    let board = readBoard();
    if (!board)
        throw new Error("unable to read board even though we should be in a mission");
    let buttons = getButtons();
    const hackingMissionState = {
        board: board,
        buttons: buttons,
        jsp: container.capturedInstance,
    };
    if (true) {
        await solveGame(ns, hackingMissionState);
    }
    else {
        await debugGame(ns, hackingMissionState);
    }
}
function isGameRunning() {
    return document.querySelector("#mission-container") != null;
}
function startMission(faction) {
    // Try to cancel any currently running mission.
    const forfeitButton = Array.from(document.querySelectorAll("#mission-container > a")).find(el => el.innerText == "Forfeit Mission (Exit)");
    if (forfeitButton) {
        forfeitButton.click();
    }
    // Go to the faction menu.
    document.querySelectorAll("#factions-menu-link")[0].click();
    const thisFactionButton = Array.from(document.querySelectorAll("#factions-container > ul > a")).
        find(n => n.innerText == faction);
    if (!thisFactionButton)
        throw new Error("not member of faction: " + faction);
    thisFactionButton.click();
    const hackingMissionButton = Array.from(document.querySelectorAll(".faction-work-div > div > button")).
        find(el => el.innerText == "Hacking Mission");
    ;
    if (!hackingMissionButton)
        throw new Error("hacking missions not available for faction " + faction);
    hackingMissionButton.click();
    document.getElementById("hack-mission-start-btn").click();
}
async function solveGame(ns, h) {
    while (isGameRunning()) {
        doGameStep(h);
        await ns.sleep(250);
    }
}
async function debugGame(ns, h) {
    await ns.sleep(10000);
    while (isGameRunning()) {
        h.board.update(h.jsp);
        console.info(h.board.clone());
        await ns.sleep(30000);
    }
}
function doGameStep(h) {
    h.board.update(h.jsp);
    const overallStats = getOverallStats();
    handleTransferAndShield(h);
    // Decide what we're gonna do with our CPUs. If our attack is less than twice the enemy defense,
    // we'll get more transfer nodes. Otherwise, we'll hack toward the enemy. Note that we don't
    // change targets once we have them.
    for (const core of h.board.data.filter(n => n.type == NodeType.Core && n.owner == NodeOwner.Me)) {
        if (core.def > 10) {
            if (core.action == NodeAction.Overflowing)
                continue;
            core.node.click();
            h.buttons.overflow.click();
            continue;
        }
        if (!core.connectionTarget) {
            // If we don't have a target, pick a good next target. We'll try to find neutral transfer
            // nodes if our attack is less than half the enemy's defense. Otherwise, we'll find the nearest
            // enemy database.
            let targetRoute = null;
            if (overallStats.me.atk < 2 * overallStats.enemy.def) {
                targetRoute = h.board.findClosestRoute(overallStats.enemy.def, ge => ge.owner == NodeOwner.Neutral && ge.type == NodeType.Transfer);
            }
            if (!targetRoute) {
                // Either there are no more neutral transfer nodes, or else we are ready to start attacking.
                // Route to the database.
                targetRoute = h.board.findClosestRoute(overallStats.enemy.def, ge => ge.owner == NodeOwner.Enemy && ge.type == NodeType.Database);
            }
            if (!targetRoute) {
                throw new Error("Got null target route. That means there are no databases to hack, so the game should be over.");
            }
            h.jsp.connect({ source: core.node, target: targetRoute[1].node });
            core.connectionTarget = targetRoute[1];
        }
        const target = core.connectionTarget;
        // We scan longer before attacking the node if it's owned by the enemy.
        const shouldAttack = target.def < ((target.owner == NodeOwner.Enemy) ? 0.5 : 0.1) * overallStats.me.atk;
        if (shouldAttack && core.action != NodeAction.Attacking) {
            core.node.click();
            h.buttons.attack.click();
        }
        else if (!shouldAttack && core.action != NodeAction.Scanning) {
            core.node.click();
            h.buttons.scan.click();
        }
    }
}
function handleTransferAndShield(h) {
    for (const node of h.board.data) {
        if (node.owner != NodeOwner.Me)
            continue;
        if (node.type == NodeType.Shield && node.action != NodeAction.Fortifying) {
            node.node.click();
            h.buttons.fortify.click();
        }
        if (node.type == NodeType.Transfer) {
            if (node.action == NodeAction.Inactive ||
                (node.def > 20 && node.action != NodeAction.Overflowing)) {
                node.node.click();
                h.buttons.overflow.click();
            }
            else if (node.def < 10 && node.action != NodeAction.Fortifying) {
                node.node.click();
                h.buttons.fortify.click();
            }
        }
    }
}
const statsRe = /(?:Player|Enemy) Attack: ((?:[.,]|\d)+)\s*(?:Player|Enemy) Defense: ((?:[.,]|\d)+)/m;
function parseStats(statsNode) {
    let match = statsRe.exec(statsNode.innerText);
    if (!match)
        throw new Error("Expected match on node text: " + statsNode.innerText);
    return { atk: parseCommaNumber(match[1]), def: parseCommaNumber(match[2]) };
}
function getOverallStats() {
    return {
        me: parseStats(document.querySelector("#hacking-mission-player-stats")),
        enemy: parseStats(document.querySelector("#hacking-mission-enemy-stats"))
    };
}
function getButtons() {
    let overflow;
    let fortify;
    let attack;
    let scan;
    let drop;
    for (const node of document.querySelectorAll("span.hack-mission-action-buttons-container > a")) {
        if (node.innerText.startsWith("Overflow(r)")) {
            overflow = node;
        }
        else if (node.innerText.startsWith("Scan(s)")) {
            scan = node;
        }
        else if (node.innerText.startsWith("Attack(a)")) {
            attack = node;
        }
        else if (node.innerText.startsWith("Fortify(f)")) {
            fortify = node;
        }
        else if (node.innerText.startsWith("Drop Connection(d)")) {
            drop = node;
        }
    }
    return { overflow: overflow, scan: scan, attack: attack, fortify: fortify, drop: drop };
}
var NodeType;
(function (NodeType) {
    NodeType[NodeType["Core"] = 1] = "Core";
    NodeType[NodeType["Spam"] = 2] = "Spam";
    NodeType[NodeType["Shield"] = 3] = "Shield";
    NodeType[NodeType["Transfer"] = 4] = "Transfer";
    NodeType[NodeType["Database"] = 5] = "Database";
    NodeType[NodeType["Firewall"] = 6] = "Firewall";
})(NodeType || (NodeType = {}));
function nodeTypeFromName(name) {
    switch (name) {
        case "CPU Core":
            return NodeType.Core;
        case "Spam":
            return NodeType.Spam;
        case "Shield":
            return NodeType.Shield;
        case "Transfer":
            return NodeType.Transfer;
        case "Database":
            return NodeType.Database;
        case "Firewall":
            return NodeType.Firewall;
        default:
            throw new Error("Unsupported type: " + name);
    }
}
var NodeOwner;
(function (NodeOwner) {
    NodeOwner[NodeOwner["Me"] = 1] = "Me";
    NodeOwner[NodeOwner["Enemy"] = 2] = "Enemy";
    NodeOwner[NodeOwner["Neutral"] = 3] = "Neutral";
})(NodeOwner || (NodeOwner = {}));
function nodeOwnerFromClass(nodeClass) {
    if (nodeClass.indexOf("player") != -1)
        return NodeOwner.Me;
    if (nodeClass.indexOf("enemy") != -1)
        return NodeOwner.Enemy;
    return NodeOwner.Neutral;
}
var NodeAction;
(function (NodeAction) {
    NodeAction[NodeAction["Inactive"] = 0] = "Inactive";
    NodeAction[NodeAction["Overflowing"] = 1] = "Overflowing";
    NodeAction[NodeAction["Scanning"] = 2] = "Scanning";
    NodeAction[NodeAction["Attacking"] = 3] = "Attacking";
    NodeAction[NodeAction["Fortifying"] = 4] = "Fortifying";
    NodeAction[NodeAction["Weakening"] = 5] = "Weakening";
})(NodeAction || (NodeAction = {}));
function parseNodeAction(s) {
    switch (s) {
        case "Overflowing": return NodeAction.Overflowing;
        case "Scanning": return NodeAction.Scanning;
        case "Attacking": return NodeAction.Attacking;
        case "Fortifying": return NodeAction.Fortifying;
        case "Weakening": return NodeAction.Weakening;
        default: return NodeAction.Inactive;
    }
}
function parseCommaNumber(s) {
    return parseFloat(s.replace(",", ""));
}
const nodeIdRe = /^.*-(\d+)-(\d+)$/;
const nodeTextRe = /^((?:CPU Core)|\w+)\s*HP: ((?:[.,]|\d)+)\s*Atk: ((?:[.,]|\d)+)\s*Def: ((?:[.,]|\d)+)\s*(\w*)$/m;
class GridElement {
    constructor(node) {
        this.node = node;
        this.myTarget = 0;
        this.enemyTarget = 0;
        this.connectionTarget = null;
        this.update();
    }
    update() {
        const idMatch = nodeIdRe.exec(this.node.id);
        if (!idMatch) {
            throw new Error(`Expected match from ${this.node.id} with ${nodeIdRe}`);
        }
        this.y = parseInt(idMatch[1]);
        this.x = parseInt(idMatch[2]);
        this.owner = nodeOwnerFromClass(this.node.className);
        const textMatch = nodeTextRe.exec(this.node.innerText);
        if (!textMatch) {
            throw new Error(`Expected match from ${this.node.innerText} with ${nodeTextRe}`);
        }
        this.type = nodeTypeFromName(textMatch[1]);
        this.hp = parseCommaNumber(textMatch[2].replace(",", ""));
        this.atk = parseCommaNumber(textMatch[3]);
        this.def = parseCommaNumber(textMatch[4]);
        this.action = parseNodeAction(textMatch[5]);
    }
    clone() {
        const c = new GridElement(this.node);
        Object.assign(c, this);
        c.connectionTarget = this.connectionTarget ? this.connectionTarget.clone() : null;
        return c;
    }
}
class Board {
    constructor() {
        this.data = [];
        this.data = [];
        this.data.length = 64;
    }
    get(y, x) {
        return this.data[y * 8 + x];
    }
    set(y, x, u) {
        this.data[y * 8 + x] = u;
    }
    update(jsplumb) {
        for (const cell of this.data) {
            cell.update();
            cell.myTarget = 0;
            cell.enemyTarget = 0;
            cell.connectionTarget = null;
        }
        const connections = jsplumb.getAllConnections();
        for (const connection of connections) {
            this.updateConnection(connection);
        }
    }
    findClosestRoute(enemyDef, predicate) {
        var queue = [];
        var minDef = new Map();
        for (const node of this.data.filter(n => n.owner == NodeOwner.Me)) {
            queue.push({ routeDef: 0, route: [node] });
            minDef.set(node, 0);
        }
        while (queue.length > 0) {
            // Scan the list to find the lowest cost element.
            // Worst case queue length is 64. It would be faster to use a real priority queue.
            // But it's not faster enough to worry about.
            const index = queue.reduce((a, ge, index) => ge.routeDef < queue[a].routeDef ? index : a, 0);
            // Pop this element out of the queue.
            const entry = queue[index];
            queue[index] = queue[queue.length - 1];
            queue.pop();
            const lastGridElement = entry.route[entry.route.length - 1];
            if (predicate(lastGridElement)) {
                // We've found the route to the closest item that matches the predicate. Return it.
                if (entry.route.length < 2 || entry.route[0].owner != NodeOwner.Me || entry.route[1].owner == NodeOwner.Me) {
                    throw new Error("unexpected route: expected at least two elements. the first should be owned by us and the second shouldn't");
                }
                return entry.route;
            }
            // Otherwise, we'll enqueue any neighbors s.t. the path to the neighbor is cheaper than
            // any known path.
            for (const neighbor of this.neighbors(lastGridElement)) {
                const minCost = minDef.get(neighbor) || Infinity;
                let neighborCost = neighbor.owner == NodeOwner.Enemy ? enemyDef : neighbor.def;
                if (neighbor.type == NodeType.Transfer) {
                    // We prefer to go through transfer nodes, since that can allow us to build up some additional
                    // attack as we go.
                    neighborCost *= .5;
                }
                const newRouteCost = entry.routeDef + neighborCost;
                if (minCost <= newRouteCost) {
                    // Not a better route to this neighbor.
                    continue;
                }
                minDef.set(neighbor, newRouteCost);
                queue.push({ routeDef: newRouteCost, route: [...entry.route, neighbor] });
            }
        }
        return null;
    }
    *neighbors(g) {
        if (g.y - 1 >= 0)
            yield this.get(g.y - 1, g.x);
        if (g.y + 1 < 8)
            yield this.get(g.y + 1, g.x);
        if (g.x - 1 >= 0)
            yield this.get(g.y, g.x - 1);
        if (g.x + 1 < 8)
            yield this.get(g.y, g.x + 1);
    }
    updateConnection(c) {
        const node1 = this.data.find(cell => c.endpoints[0].getElement().id == cell.node.id);
        const node2 = this.data.find(cell => c.endpoints[1].getElement().id == cell.node.id);
        if (!node1 || !node2)
            throw new Error("one of the endpoints was not a member of the grid");
        const coreNode = node1.type == NodeType.Core ? node1 : node2;
        const targetNode = coreNode == node1 ? node2 : node1;
        coreNode.connectionTarget = targetNode;
        if (coreNode.owner == NodeOwner.Me)
            targetNode.myTarget++;
        else
            targetNode.enemyTarget++;
    }
    clone() {
        const b = new Board();
        b.data = [];
        for (const g of this.data) {
            b.data.push(g.clone());
        }
        return b;
    }
}
function readBoard() {
    const gridRoot = document.querySelectorAll("div .hack-mission-grid")[0];
    if (!gridRoot)
        return null;
    const board = new Board();
    for (const child of gridRoot.children) {
        if (!child.id.startsWith("hacking-mission-node") ||
            child.constructor != HTMLAnchorElement) {
            continue;
        }
        const gridElement = new GridElement(child);
        board.set(gridElement.y, gridElement.x, gridElement);
    }
    return board;
}
