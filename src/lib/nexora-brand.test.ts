import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const asPng = (name: string) => {
  const content = readFileSync(`public/${name}`);
  expect(content.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: content.readUInt32BE(16), height: content.readUInt32BE(20), bytes: content.length };
};

describe("Nexora branding for web and installable app", () => {
  it("generates genuine PNGs without remote dependencies for light/dark themes and the PWA", () => {
    execFileSync(process.execPath, ["scripts/generate-brand-assets.mjs"]);

    for (const variant of ["light", "dark"]) {
      expect(asPng(`branding/nexora-horizontal-${variant}.png`)).toMatchObject({ width: 556, height: 128 });
      expect(asPng(`branding/nexora-logo-${variant}.png`)).toMatchObject({ width: 448, height: 448 });
    }
    expect(asPng("branding/nexora-symbol.png")).toMatchObject({ width: 384, height: 400 });
    expect(asPng("branding/nexora-symbol-dark.png")).toMatchObject({ width: 384, height: 400 });

    expect(asPng("icons/favicon-32.png")).toMatchObject({ width: 32, height: 32 });
    expect(asPng("icons/apple-touch-icon.png")).toMatchObject({ width: 180, height: 180 });
    expect(asPng("icons/icon-192.png")).toMatchObject({ width: 192, height: 192 });
    expect(asPng("icons/icon-512.png")).toMatchObject({ width: 512, height: 512 });
    expect(asPng("icons/icon-maskable-512.png")).toMatchObject({ width: 512, height: 512 });
  });

  it("generates PNGs in the actual pnpm build and dev scripts", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts.build).toContain("node scripts/generate-brand-assets.mjs && vite build");
    expect(pkg.scripts.dev).toContain("node scripts/generate-brand-assets.mjs && vite");
  });

  it("describes the app as Nexora and keeps the 512px icon maskable", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
    expect(manifest.name).toContain("Nexora");
    expect(manifest.short_name).toBe("Nexora");
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }),
      expect.objectContaining({ src: "/icons/icon-maskable-512.png", sizes: "512x512", purpose: "maskable" }),
    ]));
  });
});
