// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// La portada pública nunca importa React, Supabase ni datos de la operación.
const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("SEO público y privacidad de NEXORA", () => {
  const landing = read("public/landing.html");
  const app = read("index.html");
  const config = JSON.parse(read("vercel.json")) as {
    rewrites: { source: string; destination: string }[];
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const sitemap = read("public/sitemap.xml");
  const robots = read("public/robots.txt");

  it("sirve la portada estática antes de la aplicación autenticada", () => {
    expect(config.rewrites[0]).toEqual({ source: "/", destination: "/landing.html" });
    expect(config.rewrites[1]).toEqual({ source: "/(.*)", destination: "/index.html" });
    expect(landing).toContain('href="/login"');
    expect(landing).toContain('href="/branding/nexora-horizontal-dark.png"'.replace("href", "src"));
    expect(landing).not.toMatch(/supabase|access_token|anon[_-]key|\bsrc="\/src\//i);
  });

  it("solo indexa la portada pública y excluye el SPA privado", () => {
    expect(landing).toContain('name="robots" content="index, follow');
    expect(landing).toContain('<link rel="canonical" href="https://nexora-zermay.vercel.app/">');
    expect(app).toContain('name="robots" content="noindex, nofollow, noarchive"');
    expect(config.headers.some((header) =>
      header.source === "/landing.html" && header.headers.some(
        (entry) => entry.key === "X-Robots-Tag" && entry.value.includes("noindex"),
      ),
    )).toBe(true);
    expect(sitemap).toContain("<loc>https://nexora-zermay.vercel.app/</loc>");
    expect(sitemap).not.toMatch(/<loc>[^<]*(login|panel|garantias|inventario)[^<]*<\/loc>/);
    expect(robots).toContain("Sitemap: https://nexora-zermay.vercel.app/sitemap.xml");
  });

  it("describe el servicio sin publicar datos operativos o enlaces a módulos internos", () => {
    expect(landing).toContain("<title>NEXORA Smart Operations");
    expect(landing).toContain('property="og:title"');
    expect(landing).toContain('type="application/ld+json"');
    expect(landing).toContain("Acceso reservado para cuentas autorizadas.");
    expect(landing).not.toMatch(/href="\/(?:panel|clientes|inventario|garantias|pedidos|administracion)/);
  });
});
