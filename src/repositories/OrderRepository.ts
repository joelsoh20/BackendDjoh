import { BaseRepository } from './BaseRepository';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { Op } from 'sequelize';
import { StatutCommande } from '../types';

export class OrderRepository extends BaseRepository<Order> {
  constructor() {
    super(Order);
  }

  async findAllWithRelations(options?: any): Promise<Order[]> {
  return this.findAll({
    include: [
      { model: Product, as: 'produit' },
      { model: User, as: 'commercial', attributes: { exclude: ['mot_de_passe'] } }
    ],
    ...options
  });
}

  async findByStatut(statut: StatutCommande): Promise<Order[]> {
    return this.findAllWithRelations({ where: { statut } as any });
  }

 async findByCommercial(commercialId: string): Promise<Order[]> {
  return this.findAllWithRelations({ where: { commercial_id: commercialId } as any });
}

  async findByPeriode(debut: Date, fin: Date, statut?: StatutCommande): Promise<Order[]> {
    const where: any = {
      date_statut_livree: { [Op.between]: [debut, fin] }
    };
    if (statut) where.statut = statut;
    
    return this.findAllWithRelations({ where });
  }

  async getTotalCA(debut: Date, fin: Date): Promise<number> {
    const orders = await this.findAll({
      where: {
        statut: 'livree_payee',
        date_statut_livree: { [Op.between]: [debut, fin] }
      }
    });

    return orders.reduce((sum, o) => sum + (Number(o.prix_unitaire_reel) * o.quantite), 0);
  }
}