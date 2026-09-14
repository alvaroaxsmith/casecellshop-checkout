import { Product } from "../services/products.service";
import { ProductCard } from "./ProductCard";

interface ProductGridProps {
  products: Product[];
  selectedProductId: string;
  disabled: boolean;
  onSelect: (productId: string) => void;
}

export function ProductGrid({ products, selectedProductId, disabled, onSelect }: ProductGridProps) {
  return (
    <section aria-labelledby="products-heading">
      <h2 id="products-heading" className="font-display mb-4 text-lg font-semibold">
        Escolha sua capinha
      </h2>

      <div role="radiogroup" aria-label="Produto" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            selected={selectedProductId === product.id}
            disabled={disabled}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
