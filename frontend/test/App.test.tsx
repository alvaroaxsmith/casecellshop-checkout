import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import * as productsService from "../src/services/products.service";
import * as checkoutService from "../src/services/checkout.service";
import * as ordersService from "../src/services/orders.service";

vi.mock("../src/services/products.service");
vi.mock("../src/services/checkout.service");
vi.mock("../src/services/orders.service");

afterEach(cleanup);

describe("App - product list", () => {
  beforeEach(() => {
    vi.mocked(productsService.fetchProducts).mockResolvedValue([
      { id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 5, imageUrl: "", imageAlt: "" },
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
    vi.mocked(productsService.fetchProducts).mockResolvedValue([
      { id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 5, imageUrl: "", imageAlt: "" },
    ]);
  });

  it("disables the buy button and shows a loading message while processing", async () => {
    vi.mocked(checkoutService.postCheckout).mockReturnValue(new Promise(() => {})); // never resolves
    render(<App />);
    await waitFor(() => expect(screen.getByText("Capinha Preta Fosca")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /comprar/i }));

    expect(screen.getByRole("button", { name: /processando/i })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/processando sua compra/i);
  });

  it("shows a friendly message when the product is out of stock", async () => {
    vi.mocked(checkoutService.postCheckout).mockResolvedValue({
      statusCode: 409,
      body: { error: { code: "OUT_OF_STOCK", message: "Este produto está esgotado no momento." } },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Capinha Preta Fosca")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /comprar/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/esgotado/i);
    });
  });

  it("shows the validation message when the quantity is invalid", async () => {
    vi.mocked(checkoutService.postCheckout).mockResolvedValue({
      statusCode: 400,
      body: { error: { code: "VALIDATION_ERROR", message: "A quantidade deve ser maior que zero.", field: "quantity" } },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Capinha Preta Fosca")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /comprar/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/quantidade deve ser maior que zero/i);
    });
  });

  it("polls order status and shows a success message once confirmed", async () => {
    vi.mocked(checkoutService.postCheckout).mockResolvedValue({
      statusCode: 202,
      body: { orderId: "ord_000001", status: "pending", statusUrl: "/orders/ord_000001" },
    });
    vi.mocked(ordersService.fetchOrderStatus).mockResolvedValue({ orderId: "ord_000001", status: "confirmed" });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Capinha Preta Fosca")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /comprar/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/compra confirmada/i);
    });
  });

  it("shows the failure message once polling reports a failed order", async () => {
    vi.mocked(checkoutService.postCheckout).mockResolvedValue({
      statusCode: 202,
      body: { orderId: "ord_000002", status: "pending", statusUrl: "/orders/ord_000002" },
    });
    vi.mocked(ordersService.fetchOrderStatus).mockResolvedValue({
      orderId: "ord_000002",
      status: "failed",
      error: { code: "ERP_PROCESSING_FAILED", message: "Não conseguimos concluir seu pedido agora. Tente novamente em instantes." },
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Capinha Preta Fosca")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /comprar/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/não conseguimos concluir/i);
    });
  });

  it("refreshes the displayed stock after a purchase is confirmed", async () => {
    vi.mocked(productsService.fetchProducts)
      .mockResolvedValueOnce([{ id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 5, imageUrl: "", imageAlt: "" }])
      .mockResolvedValueOnce([{ id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 4, imageUrl: "", imageAlt: "" }])
      .mockResolvedValueOnce([{ id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 4, imageUrl: "", imageAlt: "" }]);
    vi.mocked(checkoutService.postCheckout).mockResolvedValue({
      statusCode: 202,
      body: { orderId: "ord_000003", status: "pending", statusUrl: "/orders/ord_000003" },
    });
    vi.mocked(ordersService.fetchOrderStatus).mockResolvedValue({ orderId: "ord_000003", status: "confirmed" });

    render(<App />);
    await waitFor(() => expect(screen.getByText("5 em estoque")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /comprar/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/compra confirmada/i);
    });
    await waitFor(() => {
      expect(screen.getByText("4 em estoque")).toBeInTheDocument();
    });
  });

  it("shows a connection error and re-enables the buy button when the request fails outright", async () => {
    vi.mocked(checkoutService.postCheckout).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<App />);
    await waitFor(() => expect(screen.getByText("Capinha Preta Fosca")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /comprar/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /comprar/i })).not.toBeDisabled();
  });
});
