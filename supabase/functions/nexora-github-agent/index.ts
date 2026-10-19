import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { extractCodeStructure } from "./code-structure-extractor.ts";

const REPOSITORY = "zzzlegna-art/Bodega-6A";
const MAX_BYTES = 150_000;
const allowed = /^(src\/|supabase\/functions\/|docs\/)[a-zA-Z0-9_./-]+\.(ts|tsx|js|jsx|md|sql)$/;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  const expected = Deno.env.get("NEXORA_AGENT_API_TOKEN");
  if (!expected) return json({ error: "Agent authentication is not configured" }, 503);
  const authorization = request.headers.get("Authorization");
  if (authorization !== `Bearer ${expected}`) return json({ error: "Unauthorized" }, 401);

  let body: { action?: string; path?: string };
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }
  if (body.action !== "read" && body.action !== "analyze") return json({ error: "Unsupported action" }, 400);
  if (typeof body.path !== "string" || !allowed.test(body.path) || body.path.includes(".."))
    return json({ error: "Path is not allowed" }, 400);

  const token = Deno.env.get("NEXORA_GITHUB_READ_TOKEN");
  if (!token) return json({ error: "GitHub read token is not configured" }, 503);
  const url = `https://api.github.com/repos/${REPOSITORY}/contents/${body.path.split("/").map(encodeURIComponent).join("/")}?ref=main`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return json({ error: "GitHub read failed", status: response.status }, 502);
    const data = await response.json();
    if (data.type !== "file" || typeof data.size !== "number" || data.size > MAX_BYTES ||
        data.encoding !== "base64" || typeof data.content !== "string")
      return json({ error: "Unsupported or oversized file" }, 422);
    const binary = atob(data.content.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return json(body.action === "analyze"
      ? { repository: REPOSITORY, path: body.path, sha: data.sha, structure: extractCodeStructure(body.path, source) }
      : { repository: REPOSITORY, path: body.path, sha: data.sha, content: source });
  } catch {
    return json({ error: "Repository inspection failed" }, 502);
  }
});
