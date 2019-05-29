export async function main(ns) {
    while (true) {
        let board = readBoard();
        console.debug(board);
        await ns.sleep(10000);
    }
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
const nodeIdRe = /^.*-(\d+)-(\d+)$/;
const nodeTextRe = /((?:CPU Core)|\w+)\s+HP: ((?:\.|\d)+)\sAtk: ((?:\.|\d)+)\s+Def: ((?:\.|\d)+)/m;
class GridElement {
    constructor(node) {
        this.node = node;
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
        this.hp = parseFloat(textMatch[2]);
        this.atk = parseFloat(textMatch[3]);
        this.def = parseFloat(textMatch[4]);
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
