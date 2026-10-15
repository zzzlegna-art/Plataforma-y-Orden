import { assertEquals } from "jsr:@std/assert@1.0.14";
import { extractCodeStructure } from "./code-structure-extractor.ts";

Deno.test("extracts imports, exported functions and components", () => {
  const result = extractCodeStructure("src/components/Inventory.tsx",
    'import { x } from "./lib"; export function Inventory() {} function calculateStock() {}');
  assertEquals(result.imports, ["./lib"]);
  assertEquals(result.functions, ["Inventory", "calculateStock"]);
  assertEquals(result.components.includes("Inventory"), true);
  assertEquals(result.exports, ["Inventory"]);
});

Deno.test("detects TypeScript source files", () => {
  const result = extractCodeStructure("src/lib/store.ts", "export function load() {}");
  assertEquals(result.language, "typescript");
  assertEquals(result.functions, ["load"]);
});

Deno.test("captures arrow functions and reexports", () => {
  const result = extractCodeStructure("src/components/Widget.tsx",
    'import "./setup"; export { util } from "./util"; export const Widget = () => null; const calc = async (x: number) => x;');
  assertEquals(result.imports, ["./setup", "./util"]);
  assertEquals(result.functions, ["Widget", "calc"]);
  assertEquals(result.components, ["Widget"]);
  assertEquals(result.exports, ["Widget", "util"]);
});

import { prepareIndexChunks } from "./index-preparation.ts";

Deno.test("prepares deterministic bounded chunks without database writes", () => {
  const sha = "a".repeat(40);
  const chunks = prepareIndexChunks("src/lib/sample.ts", sha, "x".repeat(4_100));
  assertEquals(chunks.map(chunk => chunk.content.length), [2_000, 2_000, 100]);
  assertEquals(chunks.map(chunk => chunk.chunk_index), [0, 1, 2]);
  assertEquals(chunks.every(chunk => chunk.sha === sha), true);
});

Deno.test("rejects unsafe paths and invalid hashes", () => {
  let rejected = 0;
  for (const [path, sha] of [
    ["src/../secret.ts", "a".repeat(40)],
    [".env", "a".repeat(40)],
    ["src/ok.ts", "not-a-sha"],
  ]) {
    try { prepareIndexChunks(path, sha, "source"); } catch { rejected++; }
  }
  assertEquals(rejected, 3);
});
