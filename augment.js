export async function main(ns) {
    await connectToServer(ns, "CSEC");
}
async function terminalCommand(ns, cmd) {
    document.getElementById("terminal-menu-link").click();
    let input = document.getElementById("terminal-input-text-box");
    input.value = cmd;
    document.body.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        keyCode: 13,
    }));
    await ns.sleep(50);
}
function dfsToServer(ns, target) {
    function dfsToServerHelper(current, stack) {
        let parent = stack.length > 0 ? stack[stack.length - 1] : null;
        stack.push(current);
        if (current == target) {
            return stack;
        }
        let neighbors = ns.scan(current);
        for (let n of neighbors) {
            // Don't add the parent back onto the stack.
            if (n == parent)
                continue;
            let res = dfsToServerHelper(n, stack);
            if (res)
                return res;
        }
        stack.pop();
        return null;
    }
    return dfsToServerHelper("home", []);
}
async function connectToServer(ns, server) {
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
