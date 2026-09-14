import { useEffect, useState } from "react";
import { fetchProducts, Product } from "./api";

export function App() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetchProducts().then(setProducts);
  }, []);

  return (
    <main>
      <h1>CaseCellShop</h1>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            {p.name} — R$ {(p.priceCents / 100).toFixed(2)} — {p.stock} em estoque
          </li>
        ))}
      </ul>
    </main>
  );
}
