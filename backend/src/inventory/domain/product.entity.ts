export class Product {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly priceCents: number,
    private stockQuantity: number,
  ) {}

  get stock(): number {
    return this.stockQuantity;
  }

  deduct(quantity: number): void {
    if (quantity > this.stockQuantity) {
      throw new Error(`Cannot deduct ${quantity} units of "${this.id}" — only ${this.stockQuantity} in stock.`);
    }
    this.stockQuantity -= quantity;
  }
}
