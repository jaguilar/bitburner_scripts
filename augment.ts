export async function main(ns: IGame) {
  await connectToServer(ns, "CSEC");
}

async function terminalCommand(ns: IGame, cmd: string) {
  (document.getElementById("terminal-menu-link") as HTMLButtonElement).click();
  let input = document.getElementById("terminal-input-text-box")! as HTMLInputElement;
  input.value = cmd;
  document.body.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      keyCode: 13,
  } as KeyboardEventInit));
  await ns.sleep(50);
}

function dfsToServer(ns: IGame, target: string) {
  function dfsToServerHelper(current: string, stack: string[]): string[] | null {
    let parent = stack.length > 0 ? stack[stack.length - 1] : null;
    stack.push(current);
    if (current == target) {
      return stack;
    }

    let neighbors = ns.scan(current);
    for (let n of neighbors) {
      // Don't add the parent back onto the stack.
      if (n == parent) continue;

      let res = dfsToServerHelper(n, stack);
      if (res) return res;
    }

    stack.pop();
    return null;
  }

  return dfsToServerHelper("home", []);
}

async function connectToServer(ns: IGame, server: string) {
  let path = dfsToServer(ns, server);
  if (!path) {
    throw new Error("no path to " + server);
  }
  console.info(path);

  await terminalCommand(ns, "home");
  for (let s of path.slice(1)) {
    console.info(s);
    await terminalCommand(ns, "connect " + s);
  }
  await terminalCommand(ns, "hack");
  await ns.sleep(5000);
  await terminalCommand(ns, "home");
}
