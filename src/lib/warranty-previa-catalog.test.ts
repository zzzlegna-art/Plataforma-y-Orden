import { describe, expect, it } from "vitest";
import { referenciasGarantiaPrevia, TIPOS_EQUIPOS_GARANTIA_PREVIA } from "./warranty-previa-catalog";

const productos = [
  { name: "iPhone 14", categoria: "celular" },
  { name: "iPhone 14", categoria: "celular" },
  { name: "  Galaxy S23 ", categoria: "celular" },
  { name: "Apple Watch", categoria: "reloj" },
  { name: "iPad Air", categoria: "tablet" },
  { name: "AirPods Pro", categoria: "audifono" },
  { name: "Batería iPhone", categoria: "repuesto" },
  { name: "Display Samsung", categoria: "repuesto" },
  { name: "Parlante", categoria: "parlante" },
  { name: "  ", categoria: "celular" },
];

describe("selector de referencia en garantía previa", () => {
  it("ofrece solo celulares, relojes, tablets y audífonos, nunca repuestos", () => {
    expect(TIPOS_EQUIPOS_GARANTIA_PREVIA).toEqual(["celular", "reloj", "tablet", "audifono"]);
    expect(TIPOS_EQUIPOS_GARANTIA_PREVIA).not.toContain("repuesto");
  });

  it("no muestra referencias hasta seleccionar el tipo de equipo", () => {
    expect(referenciasGarantiaPrevia(productos, "")).toEqual([]);
  });

  it("muestra únicamente los modelos de la categoría elegida y quita duplicados", () => {
    expect(referenciasGarantiaPrevia(productos, "celular")).toEqual(["Galaxy S23", "iPhone 14"]);
    expect(referenciasGarantiaPrevia(productos, "reloj")).toEqual(["Apple Watch"]);
    expect(referenciasGarantiaPrevia(productos, "tablet")).toEqual(["iPad Air"]);
    expect(referenciasGarantiaPrevia(productos, "audifono")).toEqual(["AirPods Pro"]);
    expect(referenciasGarantiaPrevia(productos, "celular")).not.toContain("Batería iPhone");
  });

  it("si el catálogo no tiene referencias para un tipo, devuelve lista vacía", () => {
    expect(referenciasGarantiaPrevia(productos.filter((p) => p.categoria === "repuesto"), "celular")).toEqual([]);
  });
});
