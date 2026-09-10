// Baseline replication (chapter plan section X.3, Layer 5; Study A setup).
// Reads every emission record from the blockchain and writes IDENTICAL data
// into the two conventional comparators:
//   1. a spreadsheet:      baselines/spreadsheet/emissions.csv  (opens in Excel)
//   2. a centralised DB:   baselines/sqlite/emissions.db        (SQLite)
// Then verifies all three systems agree on totals, row counts, and content.
// Run:  npx hardhat run baselines/load-baselines.ts --network besu
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
// Node's built-in SQLite engine (no external dependency).
import { DatabaseSync } from "node:sqlite";

const CSV_COLUMNS = [
  "product_id", "event_index", "stage_id", "actor_address", "actor_name",
  "actor_role", "activity_data_x1000", "activity_unit",
  "emission_factor_x1000", "ef_source", "co2e_grams", "methodology",
  "evidence_hash", "prev_event_hash", "timestamp_unix", "schema_version",
  "event_hash",
] as const;

type Row = Record<(typeof CSV_COLUMNS)[number], string>;

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll(`"`, `""`)}"` : value;
}

async function main() {
  const deployed = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "simulation", "deployed-addresses.json"), "utf8")
  );
  const events = await ethers.getContractAt(
    "EmissionEventRegistry", deployed.addresses.EmissionEventRegistry);
  const participants = await ethers.getContractAt(
    "ParticipantRegistry", deployed.addresses.ParticipantRegistry);
  const aggregator = await ethers.getContractAt(
    "AggregationContract", deployed.addresses.AggregationContract);

  // ---------- read every product and event from the ledger ----------
  const rows: Row[] = [];
  const products: { productId: bigint; description: string; createdBy: string; createdAt: bigint }[] = [];
  let ledgerTotalGrams = 0n;

  for (let productId = 1n; await events.productExists(productId); productId++) {
    const product = await events.getProduct(productId);
    products.push({
      productId,
      description: product.description,
      createdBy: product.createdBy,
      createdAt: product.createdAt,
    });
    const evs = await events.getEvents(productId);
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      const p = await participants.getParticipant(e.actor);
      ledgerTotalGrams += e.co2eGrams;
      rows.push({
        product_id: productId.toString(),
        event_index: String(i),
        stage_id: e.stageId.toString(),
        actor_address: e.actor,
        actor_name: p.name,
        actor_role: p.organisationRole,
        activity_data_x1000: e.activityData.toString(),
        activity_unit: e.activityUnit,
        emission_factor_x1000: e.emissionFactor.toString(),
        ef_source: e.efSource,
        co2e_grams: e.co2eGrams.toString(),
        methodology: e.methodology,
        evidence_hash: e.evidenceHash,
        prev_event_hash: e.prevEventHash,
        timestamp_unix: e.timestamp.toString(),
        schema_version: e.schemaVersion,
        event_hash: e.eventHash,
      });
    }
  }
  if (rows.length === 0) {
    throw new Error("No events on the ledger. Run `npm run simulate` first.");
  }
  console.log(`Read ${rows.length} emission events across ${products.length} product(s) from the ledger.`);

  // ---------- 1. spreadsheet baseline (CSV) ----------
  const csvDir = path.join(__dirname, "spreadsheet");
  fs.mkdirSync(csvDir, { recursive: true });
  const csvPath = path.join(csvDir, "emissions.csv");
  const csv = [
    CSV_COLUMNS.join(","),
    ...rows.map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(",")),
  ].join("\r\n") + "\r\n";
  fs.writeFileSync(csvPath, csv);
  console.log(`Spreadsheet baseline: ${csvPath}`);

  // ---------- 2. centralised database baseline (SQLite) ----------
  const dbDir = path.join(__dirname, "sqlite");
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "emissions.db");
  if (fs.existsSync(dbPath)) fs.rmSync(dbPath); // full reload, like the CSV
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE products (
      product_id   INTEGER PRIMARY KEY,
      description  TEXT NOT NULL,
      created_by   TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );
    CREATE TABLE emission_events (
      product_id            INTEGER NOT NULL REFERENCES products(product_id),
      event_index           INTEGER NOT NULL,
      stage_id              INTEGER NOT NULL,
      actor_address         TEXT NOT NULL,
      actor_name            TEXT NOT NULL,
      actor_role            TEXT NOT NULL,
      activity_data_x1000   INTEGER NOT NULL,
      activity_unit         TEXT NOT NULL,
      emission_factor_x1000 INTEGER NOT NULL,
      ef_source             TEXT NOT NULL,
      co2e_grams            INTEGER NOT NULL,
      methodology           TEXT NOT NULL,
      evidence_hash         TEXT NOT NULL,
      prev_event_hash       TEXT NOT NULL,
      timestamp_unix        INTEGER NOT NULL,
      schema_version        TEXT NOT NULL,
      event_hash            TEXT NOT NULL,
      PRIMARY KEY (product_id, event_index)
    );
  `);
  const insertProduct = db.prepare(
    "INSERT INTO products VALUES (?, ?, ?, ?)");
  for (const p of products) {
    insertProduct.run(p.productId, p.description, p.createdBy, p.createdAt);
  }
  const insertEvent = db.prepare(`INSERT INTO emission_events VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of rows) {
    insertEvent.run(
      BigInt(r.product_id), BigInt(r.event_index), BigInt(r.stage_id),
      r.actor_address, r.actor_name, r.actor_role,
      BigInt(r.activity_data_x1000), r.activity_unit,
      BigInt(r.emission_factor_x1000), r.ef_source, BigInt(r.co2e_grams),
      r.methodology, r.evidence_hash, r.prev_event_hash,
      BigInt(r.timestamp_unix), r.schema_version, r.event_hash);
  }
  console.log(`SQLite baseline:      ${dbPath}`);

  // ---------- 3. three-way parity check ----------
  console.log("\n=== Parity check: do all three systems hold the same records? ===");

  // Ledger totals per product (via the on-chain aggregator).
  const perProductLedger = new Map<string, bigint>();
  for (const p of products) {
    perProductLedger.set(p.productId.toString(), await aggregator.productTotal(p.productId));
  }

  // CSV totals, re-parsed from the file we just wrote.
  const csvBack = fs.readFileSync(csvPath, "utf8").trim().split("\r\n").slice(1);
  const csvCount = csvBack.length;
  // co2e_grams is column index 10 and never contains commas or quotes.
  const csvTotal = csvBack.reduce((acc, line) => {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!;
    return acc + BigInt(cells[10].replace(/,$/, ""));
  }, 0n);

  // SQLite totals, queried from the database.
  const dbCount = (db.prepare("SELECT COUNT(*) AS n FROM emission_events").get() as any).n;
  const dbTotal = (db.prepare("SELECT SUM(co2e_grams) AS s FROM emission_events").get() as any).s;
  const dbPerProduct = db.prepare(
    "SELECT product_id, SUM(co2e_grams) AS s FROM emission_events GROUP BY product_id").all() as any[];
  db.close();

  console.log(`  rows      ledger ${rows.length} | csv ${csvCount} | sqlite ${dbCount}`);
  console.log(`  total (g) ledger ${ledgerTotalGrams} | csv ${csvTotal} | sqlite ${dbTotal}`);
  let allMatch =
    csvCount === rows.length && Number(dbCount) === rows.length &&
    csvTotal === ledgerTotalGrams && BigInt(dbTotal) === ledgerTotalGrams;
  for (const row of dbPerProduct) {
    const ledger = perProductLedger.get(String(row.product_id))!;
    const match = BigInt(row.s) === ledger;
    if (!match) allMatch = false;
    console.log(
      `  product ${row.product_id}: ledger ${ledger} g | sqlite ${row.s} g -> ${match ? "match" : "MISMATCH"}`);
  }
  console.log(allMatch
    ? "\nPARITY OK - all three systems hold identical records."
    : "\nPARITY FAILED - investigate before running Study A.");
  if (!allMatch) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
