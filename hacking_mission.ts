import { jsPlumbInstance, Defaults, Connection } from "./node_modules/jsplumb/index";

interface IJSPlumb {
  getInstance: (arg: Defaults | undefined) => jsPlumbInstance;
}

declare global {
  var jsPlumb: IJSPlumb;
  namespace globalThis {
    function originalGetInstance(arg: Defaults | undefined): jsPlumbInstance;
  }
}

interface IJSPlumbContainer {
  capturedInstance: jsPlumbInstance | null;
}

function monkeyPatchJsPlumb(container: IJSPlumbContainer) {
  if (!globalThis.originalGetInstance) {
    globalThis.originalGetInstance = jsPlumb.getInstance;
  }

  jsPlumb.getInstance = (arg: Defaults | undefined) => {
    if (!container.capturedInstance) {
      container.capturedInstance = globalThis.originalGetInstance(arg);
    }
    return container.capturedInstance;
  }
}

interface IHackingMissionState {
  ns: IGame;
  board: Board;
  buttons: Buttons;
  jsp: jsPlumbInstance;
}

export async function main(ns: IGame) {
  ns.disableLog("ALL");
  try {
    let consecutiveLosses = 0;
    while (consecutiveLosses < 3) {
      const victory = await mainNoTry(ns, ns.args[0]);
      if (victory) {
        consecutiveLosses = 0;
      } else {
        ++consecutiveLosses;
      }
    }
  } catch (e) {
    // While we're in hacking missions, sometimes our exceptions don't get reported?
    throw e;
  } finally {
    // Restore JSPlumb to its original state, so we can play the game manually if we want.
    jsPlumb.getInstance = globalThis.originalGetInstance;
  }
}

async function mainNoTry(ns: IGame, faction: string) {
  // Before starting the mission, we need to monkey-patch jsplumb so that we can get a handle
  // to the instance. This instance is used to make connections between nodes.
  let container: IJSPlumbContainer = {capturedInstance: null};
  monkeyPatchJsPlumb(container);
  let board: Board;
  do {
    container.capturedInstance = null;
    startMission(faction);

    if (!container.capturedInstance) {
      throw new Error("Unable to grab jsplumb instance.");
    }

    board = readBoard()!;
  } while (!goodBoard(board));

  let buttons = getButtons();
  const hackingMissionState: IHackingMissionState = {
    ns: ns,
    board: board,
    buttons: buttons,
    jsp: container.capturedInstance,
  };

  if (true) {
    await solveGame(ns, hackingMissionState);

    const dbox = document.querySelector<HTMLDivElement>("div.dialog-box-content");
    return dbox && dbox.innerText.includes("Mission won!");
  } else {
    await debugGame(ns, hackingMissionState);
    return false;
  }
}

function goodBoard(board: Board) {
  const seen = new Set<GridElement>();

  // Starting from one of our CPU nodes (which are always adjacent and always start
  // in the top left?) how many transfer nodes can we find without going through any
  // other type of node.
  const queue = [board.get(0, 0)];
  let count = 0;
  while (queue.length > 0) {
    const ge = queue.pop()!;
    if (ge.type == NodeType.Transfer) ++count;
    if (ge.type == NodeType.Transfer || ge.owner == NodeOwner.Me) {
      for (const neighbor of board.neighbors(ge)) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  let numOwnCpus = board.data.reduce(
    (a, n) => a + ((n.type == NodeType.Core && n.owner == NodeOwner.Me) ? 1 : 0),
    0);
  return count >= numOwnCpus;
}

function isGameRunning(): boolean {
  return document.querySelector("#hacking-mission-player-stats") != null;
}

function startMission(faction: string) {
  // Try to cancel any currently running mission.
  const forfeitButton = Array.from(document.querySelectorAll<HTMLAnchorElement>("#mission-container > a")).find(el => el.innerText == "Forfeit Mission (Exit)");
  if (forfeitButton) {
    forfeitButton.click();
  }

  // Go to the faction menu.
  document.querySelectorAll<HTMLAnchorElement>("#factions-menu-link")[0].click();

  const thisFactionButton = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("#factions-container > ul > a")).
    find(n => n.innerText == faction);
  if (!thisFactionButton) throw new Error("not member of faction: " + faction);
  thisFactionButton.click();

  const hackingMissionButton =
      Array.from(document.querySelectorAll<HTMLButtonElement>(".faction-work-div > div > button")).
      find(el => el.innerText == "Hacking Mission");;
  if (!hackingMissionButton) throw new Error("hacking missions not available for faction " + faction);
  hackingMissionButton.click();

  document.getElementById("hack-mission-start-btn")!.click();
}

async function solveGame(ns: IGame, h: IHackingMissionState) {
  while (isGameRunning()) {
    doGameStep(h);
    await ns.sleep(250);
  }
}

async function debugGame(ns: IGame, h: IHackingMissionState) {
  await ns.sleep(10000);
  while (isGameRunning()) {
    h.board.update(h.jsp);
    console.info(h.board.clone());
    await ns.sleep(30000);
  }
}

function fortifyEffect(h: IHackingMissionState) {
  return 0.9 * h.ns.getHackingLevel() / 130;
}
function overflowEffect(h: IHackingMissionState) {
  return 0.95 * h.ns.getHackingLevel() / 130;
}

function doGameStep(h: IHackingMissionState) {
  h.board.update(h.jsp);
  const overallStats = getOverallStats();

  handleTransferAndShield(h);

  // Decide what we're gonna do with our CPUs. If our attack is less than twice the enemy defense,
  // we'll get more transfer nodes. Otherwise, we'll hack toward the enemy. Note that we don't
  // change targets once we have them.
  for (const core of h.board.data.filter(n => n.type == NodeType.Core && n.owner == NodeOwner.Me)) {
    if ((core.connectionTarget && core.connectionTarget.def > 1.2 * overallStats.me.atk) ||
        core.def > 2 * overflowEffect(h)) {
      // Treat the core like a transfer node until we have enough to hack something nearby.
      handleTransferNode(h, core);
      continue;
    }

    if (!core.connectionTarget) {
      // If we don't have a target, pick a good next target. We'll try to find neutral transfer
      // nodes if our attack is less than half the enemy's defense. Otherwise, we'll find the nearest
      // enemy database.
      let targetRoute: Array<GridElement> | null = null;
      if (overallStats.me.atk < 2 * overallStats.enemy.def) {
        targetRoute = h.board.findClosestRoute(
          overallStats.enemy.def,
          ge => ge.owner == NodeOwner.Neutral && ge.type == NodeType.Transfer/* && ge.myTarget + ge.enemyTarget == 0*/);
      }
      if (!targetRoute) {
        // Either there are no more neutral transfer nodes, or else we are ready to start attacking.
        // Route to the database.
        targetRoute = h.board.findClosestRoute(
          overallStats.enemy.def,
          ge => ge.owner == NodeOwner.Enemy && ge.type == NodeType.Database);
      }

      if (!targetRoute) {
        throw new Error("Got null target route. That means there are no databases to hack, so the game should be over.");
      }

      h.jsp.connect({source: core.node, target: targetRoute[1].node});

      core.connectionTarget = targetRoute[1];
      targetRoute[1].myTarget++;
    }

    const target = core.connectionTarget;

    // We scan longer before attacking the node if it's owned by the enemy.
    const shouldAttack = target.def < ((target.owner == NodeOwner.Enemy) ? 0.5 : 0.1) * overallStats.me.atk;
    if (shouldAttack && core.action != NodeAction.Attacking) {
      core.node.click();
      h.buttons.attack.click();
    } else if (!shouldAttack && core.action != NodeAction.Scanning) {
      core.node.click();
      h.buttons.scan.click();
    }
  }
}

function handleTransferAndShield(h: IHackingMissionState) {
  for (const node of h.board.data) {
    if (node.owner != NodeOwner.Me) continue;

    if (node.type == NodeType.Shield && node.action != NodeAction.Fortifying) {
      node.node.click();
      h.buttons.fortify.click();
    }

    if (node.type == NodeType.Transfer) {
      handleTransferNode(h, node);
    }
  }
}

function handleTransferNode(h: IHackingMissionState, node: GridElement) {
  if ((node.action != NodeAction.Overflowing && node.action != NodeAction.Fortifying) ||
      (node.def > 4 * fortifyEffect(h) && node.action != NodeAction.Overflowing)) {
    node.node.click();
    h.buttons.overflow.click();
  } else if (node.def < 2 * overflowEffect(h) && node.action != NodeAction.Fortifying) {
    node.node.click();
    h.buttons.fortify.click();
  }
}

const statsRe = /(?:Player|Enemy) Attack: ((?:[.,]|\d)+)\s*(?:Player|Enemy) Defense: ((?:[.,]|\d)+)/m;
interface IStats {
  atk: number;
  def: number;
}
function parseStats(statsNode: HTMLParagraphElement): IStats {
  let match = statsRe.exec(statsNode.innerText);
  if (!match) throw new Error("Expected match on node text: " + statsNode.innerText);
  return {atk: parseCommaNumber(match[1]), def: parseCommaNumber(match[2])};
}
function getOverallStats() {
  return {
    me: parseStats(document.querySelector<HTMLParagraphElement>("#hacking-mission-player-stats")!),
    enemy: parseStats(document.querySelector<HTMLParagraphElement>("#hacking-mission-enemy-stats")!)
  }
}

interface Buttons {
  overflow: HTMLAnchorElement,
  fortify: HTMLAnchorElement,
  attack: HTMLAnchorElement,
  scan: HTMLAnchorElement,
  drop: HTMLAnchorElement
}

function getButtons(): Buttons {
  let overflow: HTMLAnchorElement;
  let fortify: HTMLAnchorElement;
  let attack: HTMLAnchorElement;
  let scan: HTMLAnchorElement;
  let drop: HTMLAnchorElement;
  for (const node of document.querySelectorAll<HTMLAnchorElement>(
           "span.hack-mission-action-buttons-container > a")) {
    if (node.innerText.startsWith("Overflow(r)")) {
      overflow = node;
    } else if (node.innerText.startsWith("Scan(s)")) {
      scan = node;
    } else if (node.innerText.startsWith("Attack(a)")) {
      attack = node;
    } else if (node.innerText.startsWith("Fortify(f)")) {
      fortify = node;
    } else if (node.innerText.startsWith("Drop Connection(d)")) {
      drop = node;
    }
  }
  return {overflow: overflow!, scan: scan!, attack: attack!, fortify: fortify!, drop: drop!};
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

enum NodeAction {
  Inactive = 0,
  Overflowing,
  Scanning,
  Attacking,
  Fortifying,
  Weakening,
}
function parseNodeAction(s: string) {
  switch (s) {
    case "Overflowing": return NodeAction.Overflowing;
    case "Scanning": return NodeAction.Scanning;
    case "Attacking": return NodeAction.Attacking;
    case "Fortifying": return NodeAction.Fortifying;
    case "Weakening": return NodeAction.Weakening;
    default: return NodeAction.Inactive;
  }
}

function parseCommaNumber(s: string): number {
  return parseFloat(s.replace(",", ""));
}

const nodeIdRe = /^.*-(\d+)-(\d+)$/;
const nodeTextRe = /^((?:CPU Core)|\w+)\s*HP: ((?:[.,]|\d)+)\s*Atk: ((?:[.,]|\d)+)\s*Def: ((?:[.,]|\d)+)\s*(\w*)$/m;

class GridElement {
  public x!: number;
  public y!: number;
  public owner!: NodeOwner;
  public type!: NodeType;
  public hp!: number;
  public atk!: number;
  public def!: number;
  public action!: NodeAction;
  public myTarget: number = 0;
  public enemyTarget: number = 0;
  public connectionTarget: GridElement | null = null;

  constructor(public node: HTMLAnchorElement) {
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

  update(jsplumb: jsPlumbInstance) {
    for (const cell of this.data) {
      cell.update();
      cell.myTarget = 0;
      cell.enemyTarget = 0;
      cell.connectionTarget = null;
    }

    const connections = jsplumb.getAllConnections() as Array<Connection>;
    for (const connection of connections) {
      this.updateConnection(connection);
    }
  }

  findClosestRoute(enemyDef: number, predicate: (ge: GridElement) => boolean): Array<GridElement> | null {
    var queue: Array<{routeDef: number, route: Array<GridElement>}> = [];
    var minDef = new Map<GridElement, number>();
    for (const node of this.data.filter(n => n.owner == NodeOwner.Me)) {
      queue.push({routeDef: 0, route: [node]});
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
        const newRouteCost = entry.routeDef + neighborCost
        if (minCost <= newRouteCost) {
          // Not a better route to this neighbor.
          continue;
        }

        minDef.set(neighbor, newRouteCost);
        queue.push({routeDef: newRouteCost, route: [...entry.route, neighbor]});
      }
    }

    return null;
  }

  * neighbors(g: GridElement) {
    if (g.y - 1 >= 0) yield this.get(g.y - 1, g.x);
    if (g.y + 1 < 8) yield this.get(g.y + 1, g.x);
    if (g.x - 1 >= 0) yield this.get(g.y, g.x - 1);
    if (g.x + 1 < 8) yield this.get(g.y, g.x + 1);
  }

  updateConnection(c: Connection) {
    const node1 = this.data.find(cell => c.endpoints[0].getElement().id == cell.node.id);
    const node2 = this.data.find(cell => c.endpoints[1].getElement().id == cell.node.id);

    if (!node1 || !node2) throw new Error("one of the endpoints was not a member of the grid");

    const coreNode = node1.type == NodeType.Core ? node1 : node2;
    const targetNode = coreNode == node1 ? node2 : node1;

    coreNode.connectionTarget = targetNode;

    if (coreNode.owner == NodeOwner.Me) targetNode.myTarget++;
    else targetNode.enemyTarget++;
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
