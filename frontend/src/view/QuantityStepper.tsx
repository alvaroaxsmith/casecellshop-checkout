interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}

export function QuantityStepper({ value, onChange, disabled }: QuantityStepperProps) {
  return (
    <div>
      <label htmlFor="quantity-input" className="mb-1.5 block text-sm font-medium text-ink/80">
        Quantidade
      </label>
      <div className="inline-flex items-stretch overflow-hidden rounded-xl border border-line">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, value - 1))}
          disabled={disabled || value <= 1}
          aria-label="Diminuir quantidade"
          className="px-3 text-lg text-ink/70 transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <input
          id="quantity-input"
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="w-14 border-x border-line text-center outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset disabled:bg-paper"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={disabled}
          aria-label="Aumentar quantidade"
          className="px-3 text-lg text-ink/70 transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
