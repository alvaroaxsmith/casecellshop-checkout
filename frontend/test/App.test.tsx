import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
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

describe("App - checkout flow", () => {
  beforeEach(() => {
    vi.mocked(api.fetchProducts).mockResolvedValue([
      { id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 5 },
    ]);
  });

  it("disables the buy button and shows a loading message while processing", async () => {
    vi.mocked(api.postCheckout).mockReturnValue(new Promise(() => {})); // never resolves
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("Produto")).toBeInTheDocument());

    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", { name: /comprar/i });
    await user.click(buttons[0]);

    const processingButtons = screen.getAllByRole("button", { name: /processando/i });
    expect(processingButtons[0]).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/processando sua compra/i);
  });

  it("shows a friendly message when the product is out of stock", async () => {
    vi.mocked(api.postCheckout).mockResolvedValue({
      statusCode: 409,
      body: { error: { code: "OUT_OF_STOCK", message: "Este produto está esgotado no momento." } },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("Produto")).toBeInTheDocument());

    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", { name: /comprar/i });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/esgotado/i);
    });
  });

  it("shows the validation message when the quantity is invalid", async () => {
    vi.mocked(api.postCheckout).mockResolvedValue({
      statusCode: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "A quantidade deve ser maior que zero.", field: "quantity" } },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("Produto")).toBeInTheDocument());

    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", { name: /comprar/i });
    await user.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/quantidade deve ser maior que zero/i);
    });
  });

  it("polls order status and shows a success message once confirmed", async () => {
    vi.mocked(api.postCheckout).mockResolvedValue({
      statusCode: 202,
      body: { orderId: "ord_000001", status: "pending", statusUrl: "/orders/ord_000001" },
    });
    vi.mocked(api.fetchOrderStatus).mockResolvedValue({ orderId: "ord_000001", status: "confirmed" });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("Produto")).toBeInTheDocument());

    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", { name: /comprar/i });
    await user.click(buttons[0]);

    await waitFor(() => {
      const statuses = screen.getAllByRole("status");
      expect(statuses[statuses.length - 1]).toHaveTextContent(/compra confirmada/i);
    });
  });

  it("shows the failure message once polling reports a failed order", async () => {
    vi.mocked(api.postCheckout).mockResolvedValue({
      statusCode: 202,
      body: { orderId: "ord_000002", status: "pending", statusUrl: "/orders/ord_000002" },
    });
    vi.mocked(api.fetchOrderStatus).mockResolvedValue({
      orderId: "ord_000002",
      status: "failed",
      error: { code: "ERP_PROCESSING_FAILED", message: "Não conseguimos concluir seu pedido agora. Tente novamente em instantes." },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("Produto")).toBeInTheDocument());

    const user = userEvent.setup();
    const buttons = screen.getAllByRole("button", { name: /comprar/i });
    await user.click(buttons[0]);

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(alerts[alerts.length - 1]).toHaveTextContent(/não conseguimos concluir/i);
    });
  });
});
