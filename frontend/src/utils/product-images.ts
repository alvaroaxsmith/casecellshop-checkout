// A URL da imagem vem do backend (Product.imageUrl, servida direto do CDN de
// um banco de imagens) — aqui só derivamos as variantes de largura para o
// srcset, sem manter um segundo mapa produto→imagem no frontend.
export function productImageSrcSet(imageUrl: string): string {
  const widths = [240, 480, 720];
  return widths.map((w) => `${productImageUrl(imageUrl, w)} ${w}w`).join(", ");
}

export function productImageUrl(imageUrl: string, width: number): string {
  return `${imageUrl}?auto=format&fit=crop&w=${width}&q=80`;
}
