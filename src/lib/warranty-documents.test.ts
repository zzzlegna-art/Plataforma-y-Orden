import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload: mocks.upload, createSignedUrl: mocks.createSignedUrl }) },
    from: mocks.from,
  },
}));

import { DomainError } from "@/lib/db";
import {
  listarDocumentosDeGarantia,
  subirDocumentoGarantia,
  urlDescargaDocumento,
} from "./warranty-documents";

const archivoPdf = (nombre = "relacion.pdf", tamañoBytes = 1024) => {
  const archivo = new File([new Uint8Array(tamañoBytes)], nombre, { type: "application/pdf" });
  return archivo;
};

beforeEach(() => {
  mocks.upload.mockReset().mockResolvedValue({ data: { path: "x" }, error: null });
  mocks.createSignedUrl.mockReset();
  mocks.from.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("subirDocumentoGarantia", () => {
  it("no hace nada si no hay garantías a las que enlazar (lista vacía)", async () => {
    await subirDocumentoGarantia(archivoPdf(), []);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("sube el archivo, registra el documento, y lo enlaza a cada garantía dada", async () => {
    const insertados: Record<string, unknown>[] = [];
    mocks.from.mockImplementation((tabla: string) => {
      if (tabla === "bodega_documents") {
        return {
          insert: (fila: Record<string, unknown>) => {
            insertados.push({ tabla, fila });
            return {
              select: () => ({
                single: async () => ({ data: { id: "doc-1" }, error: null }),
              }),
            };
          },
        };
      }
      if (tabla === "bodega_warranty_documents") {
        return {
          insert: async (filas: Record<string, unknown>[]) => {
            insertados.push({ tabla, filas });
            return { data: filas, error: null };
          },
        };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    });

    await subirDocumentoGarantia(archivoPdf("relacion.pdf", 2048), ["g1", "g2", "g3"]);

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [ruta, , opciones] = mocks.upload.mock.calls[0];
    expect(ruta).toMatch(/^\d{4}\/[a-f0-9-]+-relacion\.pdf$/);
    expect(opciones).toMatchObject({ contentType: "application/pdf", upsert: false });

    const documento = insertados.find((i) => i.tabla === "bodega_documents") as { fila: Record<string, unknown> };
    expect(documento.fila).toMatchObject({ file_name: "relacion.pdf", content_type: "application/pdf", size_bytes: 2048 });

    const enlaces = insertados.find((i) => i.tabla === "bodega_warranty_documents") as { filas: Record<string, unknown>[] };
    expect(enlaces.filas).toEqual([
      { warranty_id: "g1", document_id: "doc-1" },
      { warranty_id: "g2", document_id: "doc-1" },
      { warranty_id: "g3", document_id: "doc-1" },
    ]);
  });

  it("un archivo muy pesado se rechaza sin llegar a subirlo", async () => {
    const archivo = archivoPdf("grande.pdf", 60 * 1024 * 1024); // 60 MB > 50 MB
    await expect(subirDocumentoGarantia(archivo, ["g1"])).rejects.toBeInstanceOf(DomainError);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("si falla la subida al almacenamiento, se avisa y no intenta registrar el documento", async () => {
    mocks.upload.mockResolvedValue({ data: null, error: { message: "network" } });
    await expect(subirDocumentoGarantia(archivoPdf(), ["g1"])).rejects.toMatchObject({
      key: "warrantyDocs.uploadFailed",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("si falla el registro del documento, avisa (el archivo ya quedó subido, no se revierte)", async () => {
    mocks.from.mockReturnValue({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "db down" } }) }) }),
    });
    await expect(subirDocumentoGarantia(archivoPdf(), ["g1"])).rejects.toMatchObject({
      key: "warrantyDocs.uploadFailed",
    });
  });
});

describe("listarDocumentosDeGarantia", () => {
  it("arma la lista a partir del enlace, del más nuevo al más viejo", async () => {
    mocks.from.mockReturnValue({
      select: () => ({
        eq: async () => ({
          data: [
            { bodega_documents: { id: "d1", file_name: "a.pdf", content_type: "application/pdf", size_bytes: 100, created_at: "2026-09-01T00:00:00Z", storage_path: "p1" } },
            { bodega_documents: { id: "d2", file_name: "b.pdf", content_type: "application/pdf", size_bytes: 200, created_at: "2026-09-20T00:00:00Z", storage_path: "p2" } },
          ],
          error: null,
        }),
      }),
    });
    const lista = await listarDocumentosDeGarantia("g1");
    expect(lista.map((d) => d.id)).toEqual(["d2", "d1"]); // el más nuevo primero
    expect(lista[0]).toMatchObject({ fileName: "b.pdf", sizeBytes: 200, storagePath: "p2" });
  });

  it("sin documentos enlazados, devuelve una lista vacía", async () => {
    mocks.from.mockReturnValue({ select: () => ({ eq: async () => ({ data: [], error: null }) }) });
    expect(await listarDocumentosDeGarantia("g1")).toEqual([]);
  });

  it("si falla la consulta, lanza un error de dominio", async () => {
    mocks.from.mockReturnValue({ select: () => ({ eq: async () => ({ data: null, error: { message: "x" } }) }) });
    await expect(listarDocumentosDeGarantia("g1")).rejects.toBeInstanceOf(DomainError);
  });
});

describe("urlDescargaDocumento", () => {
  it("devuelve el enlace firmado", async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://x/y.pdf?token=1" }, error: null });
    expect(await urlDescargaDocumento("2026/x.pdf")).toBe("https://x/y.pdf?token=1");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("2026/x.pdf", 600);
  });

  it("si falla, lanza un error de dominio propio", async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: "no existe" } });
    await expect(urlDescargaDocumento("2026/x.pdf")).rejects.toMatchObject({ key: "warrantyDocs.downloadFailed" });
  });
});
