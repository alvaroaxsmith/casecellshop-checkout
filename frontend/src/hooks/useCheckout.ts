import { useState } from "react";
import { postCheckout } from "../services/checkout.service";
import { fetchOrderStatus } from "../services/orders.service";

export type CheckoutState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const MAX_POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 1000;
const NETWORK_ERROR_MESSAGE = "Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// onStockChanged é chamado sempre que uma reserva pode ter mudado o estoque
// disponível (reservada ao aceitar o pedido, liberada se ele falhar depois),
// para a tela pedir a lista de produtos de novo e mostrar o número atual.
export function useCheckout(onStockChanged: () => void) {
  const [state, setState] = useState<CheckoutState>({ kind: "idle" });

  async function buy(productId: string, quantity: number): Promise<void> {
    setState({ kind: "loading" });
    const idempotencyKey = crypto.randomUUID();

    let response: Awaited<ReturnType<typeof postCheckout>>;
    try {
      response = await postCheckout({ productId, quantity, idempotencyKey });
    } catch {
      setState({ kind: "error", message: NETWORK_ERROR_MESSAGE });
      return;
    }

    const { statusCode, body } = response;

    if (statusCode === 202 && "orderId" in body) {
      onStockChanged();
      await pollOrderStatus(body.orderId);
      return;
    }
    if ("error" in body) {
      setState({ kind: "error", message: body.error.message });
      return;
    }
    setState({ kind: "error", message: "Ocorreu um erro inesperado. Tente novamente." });
  }

  async function pollOrderStatus(orderId: string): Promise<void> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      let status: Awaited<ReturnType<typeof fetchOrderStatus>>;
      try {
        status = await fetchOrderStatus(orderId);
      } catch {
        setState({ kind: "error", message: NETWORK_ERROR_MESSAGE });
        return;
      }

      if (status.status === "confirmed") {
        setState({ kind: "success", message: "Compra confirmada!" });
        onStockChanged();
        return;
      }
      if (status.status === "failed") {
        setState({
          kind: "error",
          message: status.error?.message ?? "Não conseguimos concluir seu pedido agora. Tente novamente.",
        });
        onStockChanged();
        return;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    setState({
      kind: "error",
      message: "Está demorando mais que o esperado. Você pode conferir o status mais tarde.",
    });
  }

  return { state, buy };
}
