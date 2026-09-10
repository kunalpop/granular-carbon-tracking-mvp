// Waits until every node on the given ports answers RPC, has full peers, and
// the chain is producing blocks.  Usage: node wait-healthy.js 9545,9546,...
const ports = process.argv[2].split(",").map(Number);
const need = ports.length - 1;

async function rpc(port, method) {
  const res = await fetch(`http://localhost:${port}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
  });
  return parseInt((await res.json()).result, 16);
}

(async () => {
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      const states = await Promise.all(ports.map(async (p) => ({
        block: await rpc(p, "eth_blockNumber"),
        peers: await rpc(p, "net_peerCount"),
      })));
      const ok = states.every((s) => s.block >= 3 && s.peers >= need);
      console.log(states.map((s, i) => `${ports[i]}:#${s.block}/${s.peers}p`).join(" "));
      if (ok) { console.log("HEALTHY"); process.exit(0); }
    } catch (e) {
      console.log(`waiting (${e.message})...`);
    }
    if (Date.now() > deadline) { console.error("TIMEOUT"); process.exit(1); }
    await new Promise((r) => setTimeout(r, 5000));
  }
})();
