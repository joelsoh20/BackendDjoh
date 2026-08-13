import { BaseRepository } from './BaseRepository';
import { Commande } from '../models/Commande';
import { CommandeLigne } from '../models/CommandeLigne';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { ServiceLivraison } from '../models/ServiceLivraison';
import { Op } from 'sequelize';
import { StatutCommande } from '../types';

export class CommandeRepository extends BaseRepository<Commande> {
  constructor() {
    super(Commande);
  }

  async findAllWithRelations(options?: any): Promise<Commande[]> {
    return this.findAll({
      include: [
        { model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] },
        { model: User, as: 'commercial', attributes: { exclude: ['mot_de_passe'] } },
        { model: ServiceLivraison, as: 'service_livraison' }
      ],
      ...options
    });
  }

  async findByStatut(statut: StatutCommande): Promise<Commande[]> {
    return this.findAllWithRelations({ where: { statut } as any });
  }

  async findByCommercial(commercialId: string): Promise<Commande[]> {
    return this.findAllWithRelations({ where: { commercial_id: commercialId } as any });
  }

  async findByPeriode(debut: Date, fin: Date, statut?: StatutCommande): Promise<Commande[]> {
    const where: any = {
      date_statut_livree: { [Op.between]: [debut, fin] }
    };
    if (statut) where.statut = statut;

    return this.findAllWithRelations({ where });
  }
}
