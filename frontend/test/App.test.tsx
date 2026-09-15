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

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(cleanup);

const PRODUCT_IMAGE_URL = "https://images.unsplash.com/photo-1764053430686-5435fe548fca";
const PRODUCT_IMAGE_ALT = "Capinha preta fosca em detalhe, apoiada sobre a caixa do aparelho";

describe("App - product list", () => {
  beforeEach(() => {
    vi.mocked(productsService.fetchProducts).mockResolvedValue([
      {
        id: "capinha-preta",
        name: "Capinha Preta Fosca",
        priceCents: 3990,
        stock: 5,
        imageUrl: PRODUCT_IMAGE_URL,
        imageAlt: PRODUCT_IMAGE_ALT,
      },
    ]);
  });

  it("renders the products fetched from the API", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Capinha Preta Fosca/)).toBeInTheDocument();
    });
  });

  it("renders the product photo with a responsive srcset built from imageUrl", async () => {
    render(<App />);
    const img = await screen.findByAltText(PRODUCT_IMAGE_ALT);
    expect(img).toHaveAttribute("src", `${PRODUCT_IMAGE_URL}?auto=format&fit=crop&w=480&q=80`);
    expect(img).toHaveAttribute(
      "srcset",
      `${PRODUCT_IMAGE_URL}?auto=format&fit=crop&w=240&q=80 240w, ${PRODUCT_IMAGE_URL}?auto=format&fit=crop&w=480&q=80 480w, ${PRODUCT_IMAGE_URL}?auto=format&fit=crop&w=720&q=80 720w`,
    );
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

  it("keeps polling while the order is still pending, then shows success once it confirms", async () => {
    vi.mocked(checkoutService.postCheckout).mockResolvedValue({
      statusCode: 202,
      body: { orderId: "ord_000005", status: "pending", statusUrl: "/orders/ord_000005" },
    });
    vi.mocked(ordersService.fetchOrderStatus)
      .mockResolvedValueOnce({ orderId: "ord_000005", status: "pending" })
      .mockResolvedValueOnce({ orderId: "ord_000005", status: "confirmed" });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Capinha Preta Fosca")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /comprar/i }));

    await waitFor(
      () => {
        expect(screen.getByRole("status")).toHaveTextContent(/compra confirmada/i);
      },
      { timeout: 2000 },
    );
    expect(ordersService.fetchOrderStatus).toHaveBeenCalledTimes(2);
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

  it("shows a connection error if polling itself fails after the order was accepted", async () => {
    vi.mocked(checkoutService.postCheckout).mockResolvedValue({
      statusCode: 202,
      body: { orderId: "ord_000004", status: "pending", statusUrl: "/orders/ord_000004" },
    });
    vi.mocked(ordersService.fetchOrderStatus).mockRejectedValue(new TypeError("Failed to fetch"));
    render(<App />);
    await waitFor(() => expect(screen.getByText("Capinha Preta Fosca")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /comprar/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível falar com o servidor/i);
    });
  });

  it("shows a generic error message when the checkout response is neither an accepted order nor a typed error", async () => {
    vi.mocked(checkoutService.postCheckout).mockResolvedValue({
      statusCode: 500,
      body: {} as never,
    });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Capinha Preta Fosca")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /comprar/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/ocorreu um erro inesperado/i);
    });
  });
});
