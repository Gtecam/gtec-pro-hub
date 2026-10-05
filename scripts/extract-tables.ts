import * as fs from "fs";
import * as path from "path";

const dir = "src/convex";
const skip = new Set(["schema.ts", "schemaExtensions.ts"]);
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && !skip.has(f));

const schemaSrc = fs.readFileSync(path.join(dir, "schema.ts"), "utf8");
const defined = new Set(
  [...schemaSrc.matchAll(/^    ([a-zA-Z0-9_]+): defineTable/gm)].map((m) => m[1]),
);
const extSrc = fs.readFileSync(path.join(dir, "schemaExtensions.ts"), "utf8");
for (const m of extSrc.matchAll(/export const (\w+) = defineTable/g)) defined.add(m[1]);

const info: Record<string, { indexes: Map<string, Set<string>>; inserts: any[]; patches: any[]; tablesRef: Set<string> }> = {};
const get = (t: string) => (info[t] ??= { indexes: new Map(), inserts: [], patches: [], tablesRef: new Set() });

function matchBraces(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function topKeys(objSrc: string): string[] {
  const keys: string[] = [];
  let depth = 0, cur = "", inStr: string | null = null;
  for (let i = 0; i < objSrc.length; i++) {
    const c = objSrc[i];
    if (inStr) { cur += c; if (c === inStr && objSrc[i - 1] !== "\\") inStr = null; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; cur += c; continue; }
    if (c === "{" || c === "[" || c === "(") depth++;
    if (c === "}" || c === "]" || c === ")") depth--;
    if (c === ":" && depth === 1) {
      const key = cur.trim().replace(/^["']|["']$/g, "");
      keys.push(key);
      cur = "";
      continue;
    }
    if (c === "," && depth === 1) { cur = ""; continue; }
    cur += c;
  }
  return keys;
}

for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  // tables referenced
  for (const m of src.matchAll(/\.(?:query|insert)\("(\w+)"/g)) get(m[1]).tablesRef.add(f);
  for (const m of src.matchAll(/v\.id\("(\w+)"/g)) get(m[1]).tablesRef.add(f);
  // withIndex: query("T") ... .withIndex("name", q => q.eq("field"...)...)
  for (const m of src.matchAll(/\.query\("(\w+)"\)([\s\S]{0,600}?)\.withIndex\("(\w+)"\s*,\s*\(?q[^=]*=>\s*([\s\S]{0,300}?)(?:\)\s*\.\w|\)\s*;|\)\s*\n\s*\.\w|$)/g)) {
    const [, table, , idxName, cb] = m;
    const eqFields = [...cb.matchAll(/\.eq\("(\w+)"/g)].map((e) => e[1]);
    const idx = get(table).indexes;
    if (!idx.has(idxName)) idx.set(idxName, new Set());
    eqFields.forEach((x) => idx.get(idxName)!.add(x));
  }
  // inserts with full object
  for (const m of src.matchAll(/\.insert\("(\w+)",\s*\{/g)) {
    const table = m[1];
    const openIdx = m.index! + m[0].length - 1;
    const closeIdx = matchBraces(src, openIdx);
    if (closeIdx > 0) {
      const objSrc = src.slice(openIdx, closeIdx + 1);
      get(table).inserts.push({ file: f, src: objSrc, keys: topKeys(objSrc) });
    }
  }
  // patches (best effort): capture db.patch(id, {...}) objects
  for (const m of src.matchAll(/\.patch\([^,]+,\s*\{/g)) {
    const openIdx = m.index! + m[0].length - 1;
    const closeIdx = matchBraces(src, openIdx);
    if (closeIdx > 0) {
      get("PATCH").inserts.push({ file: f, src: src.slice(openIdx, closeIdx + 1) });
    }
  }
}

const missing = [...Object.keys(info)].filter((t) => t !== "PATCH" && !defined.has(t)).sort();
console.log("=== MISSING TABLES:", missing.length, "===");
for (const t of missing) {
  const i = info[t];
  console.log(`\n--- ${t} (refs: ${[...i.tablesRef].join(",")})`);
  for (const [name, fields] of i.indexes) console.log(`  index ${name}: [${[...fields].join(", ")}]`);
  for (const ins of i.inserts) {
    console.log(`  insert keys [${ins.file}]: ${ins.keys.join(", ")}`);
  }
}
console.log("\n=== PATCH SAMPLES (first 10) ===");
for (const p of (info["PATCH"]?.inserts ?? []).slice(0, 10)) {
  console.log(`\n-- ${p.file}:\n${p.src.slice(0, 400)}`);
}
