import { CheckoutState } from "../hooks/useCheckout";
import { cx } from "../utils/classnames";

interface StatusBannerProps {
  state: CheckoutState;
}

export function StatusBanner({ state }: StatusBannerProps) {
  if (state.kind === "idle") return null;

  const message = state.kind === "loading" ? "Processando sua compra..." : state.message;

  return (
    <div
      role={state.kind === "error" ? "alert" : "status"}
      className={cx(
        "animate-fade-in mt-5 rounded-xl border px-4 py-3 text-sm font-medium",
        state.kind === "loading" && "border-accent/30 bg-accent/10 text-accent-dark",
        state.kind === "success" && "border-sage/40 bg-sage-tint text-sage-dark",
        state.kind === "error" && "border-clay/40 bg-clay-tint text-clay-dark",
      )}
    >
      {message}
    </div>
  );
}
