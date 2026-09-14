import { useCallback, useEffect, useState } from "react";
import { fetchProducts, Product } from "../services/products.service";

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);

  const reloadProducts = useCallback(() => {
    fetchProducts()
      .then(setProducts)
      .catch(() => {
        // mantém a última lista conhecida na tela em vez de zerar o catálogo
      });
  }, []);

  useEffect(() => {
    reloadProducts();
  }, [reloadProducts]);

  return { products, reloadProducts };
}
