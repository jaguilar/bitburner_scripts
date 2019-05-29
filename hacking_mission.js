export async function main(ns) {
  while (true) {
    let board = readBoard();
    console.debug(board);
    await ns.sleep(10000);
  }
}

class Board {
  constructor() {
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

const NODE_TYPE_CORE = 1;
const NODE_TYPE_SPAM = 2;
const NODE_TYPE_SHIELD = 3;
const NODE_TYPE_TRANSFER = 4;
const NODE_TYPE_DATABASE = 5;
const NODE_TYPE_FIREWALL = 6;
function nodeTypeFromName(name) {
  switch (name) {
    case "CPU Core":
      return NODE_TYPE_CORE;
    case "Spam":
      return NODE_TYPE_SPAM;
    case "Shield":
      return NODE_TYPE_SHIELD;
    case "Transfer":
      return NODE_TYPE_TRANSFER;
    case "Database":
      return NODE_TYPE_DATABASE;
    case "Firewall":
      return NODE_TYPE_FIREWALL;
  }
}

const NODE_OWNER_NEUTRAL = 1;
const NODE_OWNER_ME = 2;
const NODE_OWNER_ENEMY = 3;
function nodeOwnerFromClass(nodeClass) {
  if (nodeClass.contains("player")) return NODE_OWNER_ME;
  if (nodeClass.contains("enemy")) return NODE_OWNER_ENEMY;
  return NODE_OWNER_NEUTRAL;
}

const nodeIdRe = /^.*-(\d+)-(\d+)$/;
const nodeTextRe = /((?:CPU Core)|\w+)\s+HP: ((?:\.|\d)+)\sAtk: ((?:\.|\d)+)\s+Def: ((?:\.|\d)+)/m;

class GridElement {
  /**
   *
   * @param {HTMLElement} divNode
   */
  constructor(divNode) {
    this.node = divNode;
    const idMatch = nodeIdRe.exec(this.node.id);
    [this.y, this.x] = parseInt(idMatch[1], idMatch[2]);

    this.owner = nodeOwnerFromClass(this.node.className);

    const textMatch = nodeTextRe.exec(this.node.children[0].innerText);
    this.type = nodeTypeFromName(textMatch[1]);
    this.hp = parseFloat(textMatch[2]);
    this.atk = parseFloat(textMatch[3]);
    this.def = parseFloat(textMatch[4]);
  }
}

function readBoard() {
  const gridRoot = document.querySelectorAll("div .hack-mission-grid")[0];
  if (!gridRoot) return;

  const board = new Board();
  for (const child of gridRoot.children) {
    if (!child.id.startsWith("hacking-mission-node")) continue;

    const gridElement = new GridElement(child);
    board.set(gridElement.y, gridElement.x, gridElement);
  }

  return board;
}
