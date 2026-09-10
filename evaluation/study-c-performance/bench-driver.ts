// Study C load driver - Caliper-equivalent metrics for the Besu network.
// Deploys a FRESH ParticipantRegistry + EmissionEventRegistry (so dissertation
// data stays untouched), registers 5 writer actors authorised for all stages,
// creates BENCH_PRODUCTS products, then fires BENCH_PRODUCTS x BENCH_EVENTS
// recordEvent transactions from 5 parallel writer accounts and measures:
//   - TPS (successful txs / wall-clock from first submit to last receipt)
//   - per-tx latency (submit -> finalised receipt): avg, median, p95, max
//   - block time (timestamps across the block range the load occupied)
//   - TTF (QBFT: finality at inclusion, so TTF == inclusion latency;
//     definitionally 0 additional blocks, vs 6+ confirmations for PoW)
//   - per-container CPU samples via `docker stats` (for the energy estimate)
// Env: BENCH_LABEL (required), BENCH_PRODUCTS (30), BENCH_EVENTS (10)
// Run:  npx hardhat run evaluation/study-c-performance/bench-driver.ts --network besu|besu7
import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { performance } from "node:perf_hooks";

const DOCKER = process.env.DOCKER_EXE ??
  "C:\\Users\\Silve\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe";
const LABEL = process.env.BENCH_LABEL ??
  (network.name === "besu7" ? "7-validators" : "4-validators");
const PRODUCTS = Number(process.env.BENCH_PRODUCTS ?? 30);
const EVENTS = Number(process.env.BENCH_EVENTS ?? 10);
const WRITER_ROLES = ["smelter", "pcbSupplier", "batteryMaker", "screenSupplier", "oem"];

type CpuSample = { tSec: number; totalCpuPct: number; containers: number };

// Besu (or Docker's port proxy) sporadically closes keep-alive sockets under
// bursts; a stray close on an idle pooled socket surfaces as an uncaught
// exception. Log and continue - the affected request rejects and is retried.
process.on("uncaughtException", (e: any) => {
  if (e?.code === "UND_ERR_SOCKET") { console.warn("  (transient socket close - retrying)"); return; }
  console.error(e);
  process.exit(1);
});

function isTransient(e: any): boolean {
  const m = String(e?.message ?? e);
  return e?.code === "UND_ERR_SOCKET" || m.includes("other side closed") ||
    m.includes("fetch failed") || m.includes("ECONNRESET");
}

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= tries || !isTransient(e)) throw e;
      await new Promise((r) => setTimeout(r, 250 * i));
    }
  }
}

function startCpuSampler(samples: CpuSample[]): () => void {
  const t0 = performance.now();
  const timer = setInterval(() => {
    const p = spawn(DOCKER, ["stats", "--no-stream", "--format", "{{.Name}},{{.CPUPerc}}"]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => {
      const rows = out.trim().split("\n")
        .map((l) => l.split(","))
        .filter((c) => c[0]?.startsWith("carbon"));
      if (rows.length) {
        samples.push({
          tSec: (performance.now() - t0) / 1000,
          totalCpuPct: rows.reduce((a, c) => a + parseFloat(c[1]) || a, 0),
          containers: rows.length,
        });
      }
    });
  }, 2000);
  return () => clearInterval(timer);
}

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return {
    avg: xs.reduce((a, b) => a + b, 0) / xs.length,
    median: q(0.5), p95: q(0.95), min: s[0], max: s[s.length - 1],
  };
}

async function sendBatch(txFactories: (() => Promise<any>)[]) {
  // Sequential broadcast (nonce order per signer), receipts awaited together.
  // Manual nonces make rebroadcasts idempotent, so retries are safe.
  const sent = [];
  for (const f of txFactories) sent.push(await withRetry(f));
  await Promise.all(sent.map((tx) => withRetry(() => tx.wait())));
}

async function main() {
  if (!process.env.BENCH_LABEL) console.log(`(BENCH_LABEL not set; using "${LABEL}")`);
  const accounts = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "..", "network", "accounts.json"), "utf8")) as { role: string }[];
  const signers = await ethers.getSigners();
  const signerFor = (role: string) => signers[accounts.findIndex((a) => a.role === role)];
  const admin = signerFor("deployer");
  const writers = WRITER_ROLES.map(signerFor);

  console.log(`=== Study C bench [${LABEL}]: ${PRODUCTS} products x ${EVENTS} events = ${PRODUCTS * EVENTS} txs ===`);

  // ---------- fresh, dedicated bench stack ----------
  const pr = await ethers.deployContract("ParticipantRegistry", [admin.address], admin);
  await pr.waitForDeployment();
  const eer = await ethers.deployContract("EmissionEventRegistry", [pr.target], admin);
  await eer.waitForDeployment();

  let nonce = await admin.getNonce();
  const setupTxs: (() => Promise<any>)[] = [];
  // Explicit gasLimit: these txs are pipelined before their predecessors are
  // mined, so the node's automatic gas estimation would simulate against
  // stale state and falsely revert.
  const G = { gasLimit: 400_000 };
  for (const [i, w] of writers.entries()) {
    setupTxs.push(() => pr.registerParticipant(w.address, `bench-writer-${i}`, "bench", { nonce: nonce++, ...G }));
    for (let s = 1; s <= 10; s++) {
      setupTxs.push(() => pr.authoriseStage(w.address, s, { nonce: nonce++, ...G }));
    }
  }
  await sendBatch(setupTxs);

  const productTxs: (() => Promise<any>)[] = [];
  const writerNonces = await Promise.all(writers.map((w) => w.getNonce()));
  for (let p = 1; p <= PRODUCTS; p++) {
    const wi = (p - 1) % writers.length;
    productTxs.push(() =>
      (eer.connect(writers[wi]) as any).createProduct(p, `bench product ${p}`, { nonce: writerNonces[wi]++, ...G }));
  }
  await sendBatch(productTxs);

  // Calibrate the real gas cost of recordEvent once, then use it for every
  // load tx (one RPC round-trip saved per tx; accurate block packing).
  const evidenceCal = ethers.keccak256(ethers.toUtf8Bytes("bench"));
  const gasEstimate = await (eer.connect(writers[0]) as any).recordEvent.estimateGas(
    1, 1, 5_000n, "kWh", 450_000n,
    "PLACEHOLDER / SOURCE NEEDED (bench)", "bench", evidenceCal, "1.0.0");
  const recordGas = (gasEstimate * 125n) / 100n;
  console.log(`Bench stack ready (5 writers x 10 stages, ${PRODUCTS} products; recordEvent ~${gasEstimate} gas).`);

  // ---------- idle CPU baseline (10 s) ----------
  const idleSamples: CpuSample[] = [];
  const stopIdle = startCpuSampler(idleSamples);
  await new Promise((r) => setTimeout(r, 10_000));
  stopIdle();

  // ---------- the load ----------
  // OPEN-LOOP load (Caliper-style): broadcast everything with sequential
  // nonces (fast RPC acks), then poll receipts on a fine interval. This
  // measures network capacity, not client round-trip pacing.
  const loadSamples: CpuSample[] = [];
  const stopLoad = startCpuSampler(loadSamples);
  const evidence = ethers.keccak256(ethers.toUtf8Bytes("bench"));
  const nonces = await Promise.all(writers.map((w) => w.getNonce()));
  const submitted: { hash: string; submitMs: number }[] = [];
  const tStart = performance.now();

  await Promise.all(writers.map(async (w, wi) => {
    const c = eer.connect(w) as any;
    for (let p = wi + 1; p <= PRODUCTS; p += writers.length) {
      for (let e = 0; e < EVENTS; e++) {
        const myNonce = nonces[wi]++;
        const tx = await withRetry(() => c.recordEvent(
          p, (e % 10) + 1, 5_000n, "kWh", 450_000n,
          "PLACEHOLDER / SOURCE NEEDED (bench)", "bench", evidence, "1.0.0",
          { nonce: myNonce, gasLimit: recordGas }));
        submitted.push({ hash: tx.hash, submitMs: performance.now() });
      }
    }
  }));
  console.log(`All ${submitted.length} txs broadcast in ${((performance.now() - tStart) / 1000).toFixed(1)} s; polling receipts...`);

  // Receipt poller: 250 ms interval, batched lookups.
  const latencies: number[] = [];
  const blockNumbers = new Set<number>();
  const pending = new Map(submitted.map((s) => [s.hash, s.submitMs]));
  let lastReceiptMs = tStart;
  const pollDeadline = performance.now() + 300_000;
  while (pending.size > 0) {
    if (performance.now() > pollDeadline) throw new Error(`${pending.size} txs never mined`);
    const hashes = [...pending.keys()];
    const receipts = await Promise.all(hashes.map((h) =>
      withRetry(() => ethers.provider.getTransactionReceipt(h))));
    const nowMs = performance.now();
    receipts.forEach((rc, i) => {
      if (rc) {
        if (rc.status !== 1) throw new Error(`tx ${hashes[i]} reverted`);
        latencies.push(nowMs - pending.get(hashes[i])!);
        blockNumbers.add(rc.blockNumber);
        pending.delete(hashes[i]);
        lastReceiptMs = nowMs;
      }
    });
    if (pending.size > 0) await new Promise((r) => setTimeout(r, 250));
  }
  const wallSec = (lastReceiptMs - tStart) / 1000;
  stopLoad();

  // ---------- block statistics over the occupied range ----------
  const bMin = Math.min(...blockNumbers), bMax = Math.max(...blockNumbers);
  const first = await ethers.provider.getBlock(bMin);
  const last = await ethers.provider.getBlock(bMax);
  let txsInRange = 0;
  for (let b = bMin; b <= bMax; b++) {
    txsInRange += (await ethers.provider.getBlock(b))!.transactions.length;
  }
  const blockTime = bMax > bMin
    ? Number(last!.timestamp - first!.timestamp) / (bMax - bMin) : NaN;

  const totalTx = PRODUCTS * EVENTS;
  const lat = stats(latencies);
  const idleCpu = idleSamples.length ? stats(idleSamples.map((s) => s.totalCpuPct)).avg : 0;
  const loadCpu = loadSamples.length ? stats(loadSamples.map((s) => s.totalCpuPct)).avg : 0;

  const result = {
    label: LABEL,
    network: network.name,
    validators: loadSamples[0]?.containers ?? null,
    config: { products: PRODUCTS, eventsPerProduct: EVENTS, writers: writers.length },
    totalTx,
    wallClockSec: wallSec,
    tps: totalTx / wallSec,
    latencyMs: lat,
    ttf: {
      definition: "QBFT finality is immediate at block inclusion; TTF equals inclusion latency and zero further confirmations are required",
      measuredMs: lat, // same distribution as latency, by definition above
    },
    blocks: { range: [bMin, bMax], count: bMax - bMin + 1, avgBlockTimeSec: blockTime, txsInRange },
    cpu: {
      containers: loadSamples[0]?.containers ?? null,
      idleTotalCpuPct: idleCpu,
      loadTotalCpuPct: loadCpu,
      note: "docker stats CPUPerc summed over carbon* containers; 100% = one logical core",
    },
  };

  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `results-${LABEL}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  console.log(`\nTPS ${result.tps.toFixed(1)} | latency avg ${lat.avg.toFixed(0)} ms ` +
    `(p95 ${lat.p95.toFixed(0)}) | block time ${blockTime.toFixed(2)} s | ` +
    `blocks ${bMin}-${bMax} | CPU idle ${idleCpu.toFixed(0)}% load ${loadCpu.toFixed(0)}%`);
  console.log(`Saved ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
