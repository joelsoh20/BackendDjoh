import { BaseRepository } from './BaseRepository';
import { Stock } from '../models/Stock';
import { Product } from '../models/Product';

export class StockRepository extends BaseRepository<Stock> {
  constructor() {
    super(Stock);
  }

  async findAllWithProduct(): Promise<Stock[]> {
    return this.findAll({
      include: [{ model: Product, as: 'produit' }]
    });
  }

  async findByProduct(productId: string): Promise<Stock | null> {
    return this.findOne({
      where: { product_id: productId },
      include: [{ model: Product, as: 'produit' }]
    });
  }

  async augmenterStock(productId: string, quantite: number): Promise<void> {
    const stock = await this.findByProduct(productId);
    if (stock) {
      stock.quantite += quantite;
      await stock.save();
    } else {
      await this.create({ product_id: productId, quantite });
    }
  }

  async reduireStock(productId: string, quantite: number): Promise<boolean> {
    const stock = await this.findByProduct(productId);
    if (!stock || stock.quantite < quantite) return false;
    stock.quantite -= quantite;
    await stock.save();
    return true;
  }
}