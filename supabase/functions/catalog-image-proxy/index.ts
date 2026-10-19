import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PUBLIC_PRODUCT_IMAGE_PREFIX = "/storage/v1/object/public/product-images/";
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const jsonError = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  if (typeof body.url !== "string" || body.url.length > 2048) {
    return jsonError("A valid public image URL is required", 400);
  }

  const configuredSupabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!configuredSupabaseUrl) {
    return jsonError("Storage proxy is not configured", 500);
  }

  let imageUrl: URL;
  let projectUrl: URL;
  try {
    imageUrl = new URL(body.url);
    projectUrl = new URL(configuredSupabaseUrl);
  } catch {
    return jsonError("Invalid image URL", 400);
  }

  const extension = imageUrl.pathname.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? "";
  if (
    imageUrl.origin !== projectUrl.origin ||
    imageUrl.username ||
    imageUrl.password ||
    !imageUrl.pathname.startsWith(PUBLIC_PRODUCT_IMAGE_PREFIX) ||
    !IMAGE_MIME_BY_EXTENSION[extension]
  ) {
    return jsonError("Only public product images from this project are allowed", 400);
  }

  let upstream: Response;
  try {
    upstream = await fetch(imageUrl.href, {
      redirect: "error",
      headers: { Accept: "image/png,image/jpeg,image/webp,image/gif" },
    });
  } catch {
    return jsonError("Could not fetch the product image", 502);
  }
  if (!upstream.ok || !upstream.body) {
    return jsonError("Product image was not found", upstream.status === 404 ? 404 : 502);
  }

  const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_IMAGE_BYTES) {
    return jsonError("Product image exceeds the 8 MB limit", 413);
  }

  const upstreamType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (upstreamType && !upstreamType.startsWith("image/") && upstreamType !== "application/octet-stream") {
    return jsonError("The requested file is not an image", 415);
  }

  const reader = upstream.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return jsonError("Product image exceeds the 8 MB limit", 413);
      }
      chunks.push(value);
    }
  } catch {
    return jsonError("Could not read the product image", 502);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const contentType = upstreamType.startsWith("image/")
    ? upstreamType
    : IMAGE_MIME_BY_EXTENSION[extension];
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
