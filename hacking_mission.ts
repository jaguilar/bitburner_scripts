export async function main(ns: IGame) {
  try {
    while (true) {
      let board = readBoard();
      console.debug(board);
      await ns.sleep(10000);
    }
  } catch (e) {
    console.warn(e);
  }
}

enum NodeType {
  Core = 1,
  Spam = 2,
  Shield = 3,
  Transfer = 4,
  Database = 5,
  Firewall = 6,
}
function nodeTypeFromName(name: string) {//
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

enum NodeOwner {
  Me = 1,
  Enemy = 2,
  Neutral = 3,
}
function nodeOwnerFromClass(nodeClass: string) {
  if (nodeClass.indexOf("player") != -1) return NodeOwner.Me;
  if (nodeClass.indexOf("enemy") != -1) return NodeOwner.Enemy;
  return NodeOwner.Neutral;
}

const nodeIdRe = /^.*-(\d+)-(\d+)$/;
const nodeTextRe = /((?:CPU Core)|\w+)\s+HP: ((?:[.,]|\d)+)\sAtk: ((?:[.,]|\d)+)\s+Def: ((?:\[.,]|\d)+)/m;

class GridElement {
  public x: number;
  public y: number;
  public owner: NodeOwner;
  public type: NodeType;
  public hp: Number;
  public atk: Number;
  public def: Number;

  constructor(public node: HTMLAnchorElement) {
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
  data: Array<GridElement> = [];

  constructor() {
    this.data = [];
    this.data.length = 64;
  }

  get(y: number, x: number) {
    return this.data[y * 8 + x];
  }

  set(y: number, x: number, u: GridElement) {
    this.data[y * 8 + x] = u;
  }
}

function readBoard(): Board | null {
  const gridRoot = document.querySelectorAll("div .hack-mission-grid")[0];
  if (!gridRoot) return null;

  const board = new Board();
  for (const child of gridRoot.children) {
    if (!child.id.startsWith("hacking-mission-node") ||
        child.constructor != HTMLAnchorElement) {
      continue;
    }

    const gridElement = new GridElement(child as HTMLAnchorElement);
    board.set(gridElement.y, gridElement.x, gridElement);
  }

  return board;
}
