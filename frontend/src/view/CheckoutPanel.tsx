import { cx } from "../utils/classnames";
import { QuantityStepper } from "./QuantityStepper";

interface CheckoutPanelProps {
  quantity: number;
  onQuantityChange: (value: number) => void;
  onBuy: () => void;
  loading: boolean;
  canBuy: boolean;
}

export function CheckoutPanel({ quantity, onQuantityChange, onBuy, loading, canBuy }: CheckoutPanelProps) {
  return (
    <section
      aria-label="Finalizar compra"
      className="mt-8 flex flex-col gap-5 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-end sm:justify-between"
    >
      <QuantityStepper value={quantity} onChange={onQuantityChange} disabled={loading} />

      <button
        onClick={onBuy}
        disabled={loading || !canBuy}
        className={cx(
          "w-full rounded-full bg-accent px-8 py-3 font-display text-sm font-semibold text-white transition sm:w-auto",
          "hover:bg-accent-dark disabled:cursor-not-allowed disabled:bg-ink/20 disabled:text-ink/50 disabled:hover:bg-ink/20",
        )}
      >
        {loading ? "Processando..." : "Comprar"}
      </button>
    </section>
  );
}
