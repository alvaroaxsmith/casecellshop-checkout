import { useEffect, useState } from "react";
import { fetchProducts, postCheckout, fetchOrderStatus, Product } from "./api";

type CheckoutState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>({ kind: "idle" });

  useEffect(() => {
    fetchProducts().then((data) => {
      setProducts(data);
      if (data.length > 0) setSelectedProductId(data[0].id);
    });
  }, []);

  async function handleBuy() {
    setCheckoutState({ kind: "loading" });
    const idempotencyKey = crypto.randomUUID();
    const { statusCode, body } = await postCheckout({ productId: selectedProductId, quantity, idempotencyKey });

    if (statusCode === 202 && "orderId" in body) {
      pollOrderStatus(body.orderId);
      return;
    }
    if ("error" in body) {
      setCheckoutState({ kind: "error", message: body.error.message });
      return;
    }
    setCheckoutState({ kind: "error", message: "Ocorreu um erro inesperado. Tente novamente." });
  }

  async function pollOrderStatus(orderId: string) {
    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await fetchOrderStatus(orderId);
      if (status.status === "confirmed") {
        setCheckoutState({ kind: "success", message: "Compra confirmada!" });
        return;
      }
      if (status.status === "failed") {
        setCheckoutState({
          kind: "error",
          message: status.error?.message ?? "Não conseguimos concluir seu pedido agora. Tente novamente.",
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setCheckoutState({
      kind: "error",
      message: "Está demorando mais que o esperado. Você pode conferir o status mais tarde.",
    });
  }

  const isLoading = checkoutState.kind === "loading";

  return (
    <main>
      <h1>CaseCellShop</h1>

      <label htmlFor="product-select">Produto</label>
      <select
        id="product-select"
        value={selectedProductId}
        onChange={(e) => setSelectedProductId(e.target.value)}
        disabled={isLoading}
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — R$ {(p.priceCents / 100).toFixed(2)} — {p.stock} em estoque
          </option>
        ))}
      </select>

      <label htmlFor="quantity-input">Quantidade</label>
      <input
        id="quantity-input"
        type="number"
        min={1}
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
        disabled={isLoading}
      />

      <button onClick={handleBuy} disabled={isLoading || !selectedProductId}>
        {isLoading ? "Processando..." : "Comprar"}
      </button>

      {checkoutState.kind === "loading" && <p role="status">Processando sua compra...</p>}
      {checkoutState.kind === "success" && <p role="status">{checkoutState.message}</p>}
      {checkoutState.kind === "error" && <p role="alert">{checkoutState.message}</p>}
    </main>
  );
}
