import { BaseRepository } from './BaseRepository';
import { Product } from '../models/Product';
import { Op } from 'sequelize';

export class ProductRepository extends BaseRepository<Product> {
  constructor() {
    super(Product);
  }

  async findActifs(): Promise<Product[]> {
    return this.findAll({ where: { actif: true } as any });
  }

  async toggleActif(id: string): Promise<Product | null> {
    const product = await this.findById(id);
    if (product) {
      product.actif = !product.actif;
      await product.save();
    }
    return product;
  }

  async search(query: string): Promise<Product[]> {
    return this.findAll({
      where: {
        nom: { [Op.iLike]: `%${query}%` },
        actif: true
      } as any
    });
  }
}