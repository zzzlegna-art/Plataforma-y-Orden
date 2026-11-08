// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import PublicLanding from "./index";

afterEach(cleanup);

describe("portada pública de NEXORA", () => {
  it("presenta la marca oficial y permite abrir el login sin exigir sesión", () => {
    render(<MemoryRouter><PublicLanding /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: /NEXORA Smart Operations/i, level: 1 })).toBeTruthy();
    expect(screen.getByText(/plataforma de acceso privado/i)).toBeTruthy();
    expect(screen.getByText(/reservado al personal autorizado/i)).toBeTruthy();

    const loginLinks = screen.getAllByRole("link").filter(
      (link) => link.getAttribute("href") === "/login",
    );
    expect(loginLinks).toHaveLength(2);
    expect(screen.getByAltText("Logotipo de NEXORA Smart Operations")).toBeTruthy();
  });

  it("no publica información interna, registros ni interfaces administrativas", () => {
    const { container } = render(<MemoryRouter><PublicLanding /></MemoryRouter>);

    expect(screen.queryByText(/GAR-\d+|\d{15}|@gmail\.com/)).toBeNull();
    expect(container.querySelector("input[type=password]")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
    expect(screen.queryByRole("link", { name: /crear cuenta|registro público/i })).toBeNull();
  });
});
