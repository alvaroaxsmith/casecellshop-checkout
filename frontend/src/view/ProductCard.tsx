import { Product } from "../services/products.service";
import { productImageSrcSet, productImageUrl } from "../utils/product-images";
import { formatCurrencyBRL } from "../utils/format";
import { cx } from "../utils/classnames";

interface ProductCardProps {
  product: Product;
  selected: boolean;
  disabled: boolean;
  onSelect: (productId: string) => void;
}

export function ProductCard({ product, selected, disabled, onSelect }: ProductCardProps) {
  const priceLabel = formatCurrencyBRL(product.priceCents);
  const lowStock = product.stock > 0 && product.stock <= 2;
  const outOfStock = product.stock <= 0;

  return (
    <label
      className={cx(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-surface transition",
        "has-[:checked]:border-accent has-[:checked]:ring-2 has-[:checked]:ring-accent",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:ring-offset-2",
        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
      )}
    >
      <input
        type="radio"
        name="product"
        value={product.id}
        checked={selected}
        onChange={() => onSelect(product.id)}
        disabled={disabled}
        aria-label={`${product.name} — ${priceLabel} — ${product.stock} em estoque`}
        className="sr-only"
      />

      {product.imageUrl ? (
        <img
          src={productImageUrl(product.imageUrl, 480)}
          srcSet={productImageSrcSet(product.imageUrl)}
          sizes="(min-width: 640px) 33vw, 100vw"
          alt={product.imageAlt}
          loading="lazy"
          className="h-40 w-full object-cover sm:h-44"
        />
      ) : (
        <div className="flex h-40 w-full items-center justify-center bg-line/40 text-sm text-ink/50 sm:h-44">
          Sem foto
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="font-display text-base font-semibold leading-snug">{product.name}</p>
        <p className="text-sm text-ink/70">{priceLabel}</p>
        <p
          className={cx(
            "mt-auto pt-2 text-xs font-medium",
            outOfStock && "text-clay",
            lowStock && "text-clay-dark",
            !outOfStock && !lowStock && "text-ink/50",
          )}
        >
          {outOfStock ? "Esgotado" : `${product.stock} em estoque`}
        </p>
      </div>
    </label>
  );
}
