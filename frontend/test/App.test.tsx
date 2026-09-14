import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "../src/App";
import * as api from "../src/api";

vi.mock("../src/api");

describe("App - product list", () => {
  beforeEach(() => {
    vi.mocked(api.fetchProducts).mockResolvedValue([
      { id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 5 },
    ]);
  });

  it("renders the products fetched from the API", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Capinha Preta Fosca/)).toBeInTheDocument();
    });
  });
});
