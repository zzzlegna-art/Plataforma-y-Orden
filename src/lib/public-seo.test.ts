import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const site = "https://nexora-zermay.vercel.app/";
const read = (path: string) => readFileSync(path, "utf8");

describe("indexación de NEXORA sin exponer la plataforma", () => {
  it("publica metadatos y datos estructurados coherentes con el sitio oficial", () => {
    const html = read("index.html");
    expect(html).toContain('<link rel="canonical" href="' + site + '">');
    expect(html).toContain('<meta name="robots" content="index, follow');
    expect(html).toContain('property="og:site_name" content="NEXORA Smart Operations"');
    expect(html).toContain('name="description"');

    const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    expect(jsonLd).toBeDefined();
    const schema = JSON.parse(jsonLd ?? "{}");
    const organization = schema["@graph"].find((item: { "@type": string }) => item["@type"] === "Organization");
    const website = schema["@graph"].find((item: { "@type": string }) => item["@type"] === "WebSite");
    expect(organization).toMatchObject({
      name: "NEXORA Smart Operations",
      url: site,
      logo: site + "branding/nexora-logo-light.png",
    });
    expect(website).toMatchObject({
      name: "NEXORA Smart Operations",
      url: site,
    });
    expect(html).toContain('<meta name="google-site-verification" content="8uyXkW8QIPKPx_s0pq6ibLIK-3Jb06XMPLwNEMbgv50" />');
  });

  it("anuncia un sitemap con la portada como única URL pública", () => {
    const sitemap = read("public/sitemap.xml");
    const robots = read("public/robots.txt");
    expect(robots).toContain("Sitemap: " + site + "sitemap.xml");
    expect((sitemap.match(/<loc>/g) ?? [])).toHaveLength(1);
    expect(sitemap).toContain("<loc>" + site + "</loc>");
    expect(sitemap).not.toMatch(/\/login|\/panel|\/inventario|\/garantias/);
  });

  it("marca el login y todas las rutas operativas como noindex desde Vercel", () => {
    const config = JSON.parse(read("vercel.json")) as {
      rewrites: { source: string; destination: string }[];
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    expect(config.rewrites).toEqual(
      expect.arrayContaining([{ source: "/(.*)", destination: "/index.html" }]),
    );
    const noindexRules = config.headers.filter((rule) =>
      rule.headers.some((header) =>
        header.key === "X-Robots-Tag" && header.value.includes("noindex"),
      ),
    );
    expect(noindexRules).toHaveLength(2);
    for (const name of ["login", "panel", "recepcion", "inventario", "pedidos", "garantias", "clientes", "administracion"]) {
      expect(noindexRules.every((rule) => rule.source.includes(name))).toBe(true);
    }
    expect(noindexRules.every((rule) => rule.source !== "/")).toBe(true);
  });

  it("conserva el acceso directo al panel en la aplicación instalada", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest"));
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/panel");
  });
});
