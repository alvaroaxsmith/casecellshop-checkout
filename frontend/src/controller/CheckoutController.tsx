import { useEffect, useState } from "react";
import { useProducts } from "../hooks/useProducts";
import { useCheckout } from "../hooks/useCheckout";
import { Header } from "../view/Header";
import { ProductGrid } from "../view/ProductGrid";
import { CheckoutPanel } from "../view/CheckoutPanel";
import { StatusBanner } from "../view/StatusBanner";

export function CheckoutController() {
  const { products, reloadProducts } = useProducts();
  const { state, buy } = useCheckout(reloadProducts);

  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);

  // seleciona o primeiro produto assim que a lista chega, sem sobrescrever
  // uma escolha que o cliente já tenha feito (ex.: depois de uma recarga de
  // estoque disparada por uma compra).
  useEffect(() => {
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  const isLoading = state.kind === "loading";

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <Header />

        <ProductGrid
          products={products}
          selectedProductId={selectedProductId}
          disabled={isLoading}
          onSelect={setSelectedProductId}
        />

        <CheckoutPanel
          quantity={quantity}
          onQuantityChange={setQuantity}
          onBuy={() => buy(selectedProductId, quantity)}
          loading={isLoading}
          canBuy={Boolean(selectedProductId)}
        />

        <StatusBanner state={state} />
      </div>
    </main>
  );
}
