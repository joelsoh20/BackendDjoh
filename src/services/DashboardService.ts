import { OrderRepository } from '../repositories/OrderRepository';
import { ChargeRepository } from '../repositories/ChargeRepository';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { Op } from 'sequelize';

export class DashboardService {
  private orderRepo: OrderRepository;
  private chargeRepo: ChargeRepository;

  constructor() {
    this.orderRepo = new OrderRepository();
    this.chargeRepo = new ChargeRepository();
  }

  async getDashboard(): Promise<any> {
    const maintenant = new Date();
    const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const finJour = new Date(debutJour.getTime() + 24 * 60 * 60 * 1000);
    const debutHier = new Date(debutJour.getTime() - 24 * 60 * 60 * 1000);
    const finHier = debutJour;

    const debutSemaine = new Date(maintenant);
    debutSemaine.setDate(maintenant.getDate() - maintenant.getDay());
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const debutAnnee = new Date(maintenant.getFullYear(), 0, 1);
    const debutSemestre = new Date(maintenant.getFullYear(), maintenant.getMonth() - 6, 1);

    const [
      statsJour, statsHier, statsSemaine, statsMois,
      statsAnnee, statsSemestre, topProduits, evolution, charges
    ] = await Promise.all([
      this.getStatsPeriode(debutJour, finJour),
      this.getStatsPeriode(debutHier, finHier),
      this.getStatsPeriode(debutSemaine, finJour),
      this.getStatsPeriode(debutMois, finJour),
      this.getStatsPeriode(debutAnnee, finJour),
      this.getStatsPeriode(debutSemestre, finJour),
      this.getTopProduits(debutMois, finJour),
      this.getEvolution(debutSemestre, finJour),
      this.chargeRepo.findByPeriode(debutMois, finJour)
    ]);

    const totalCharges = charges.reduce((sum, c) => sum + Number(c.montant), 0);
    const joursEcoules = Math.ceil((maintenant.getTime() - debutAnnee.getTime()) / (1000 * 60 * 60 * 24));
    const joursTotal = 365;

    return {
      jour: statsJour,
      hier: statsHier,
      semaine: statsSemaine,
      mois: {
        ...statsMois,
        beneficeBrut: statsMois.beneficeNet,
        beneficeNet: statsMois.beneficeNet - totalCharges,
        totalCharges,
        detailsCharges: charges.map(c => ({ type: c.type, montant: Number(c.montant) })),
      },
      semestre: {
        ...statsSemestre,
        moyenneMensuelle: Math.round(statsSemestre.chiffreAffaires / 6)
      },
      annee: {
        ...statsAnnee,
        projectionCA: Math.round((statsAnnee.chiffreAffaires / joursEcoules) * joursTotal),
        projectionBenefice: Math.round((statsAnnee.beneficeNet / joursEcoules) * joursTotal)
      },
      topProduits,
      evolutionMensuelle: evolution
    };
  }

  private async getStatsPeriode(debut: Date, fin: Date) {
    const orders = await this.orderRepo.findByPeriode(debut, fin, 'livree_payee');
    
    let chiffreAffaires = 0;
    let beneficeNet = 0;

    for (const o of orders) {
      const ca = Number(o.prix_unitaire_reel) * o.quantite;
      chiffreAffaires += ca;
      const produit = (o as any).produit;
      const coutRevient = produit ? Number(produit.cout_revient) * o.quantite : 0;
      beneficeNet += ca - Number(o.frais_livraison) - Number(o.commission_commercial) - coutRevient;
    }

    // Nombre de commandes distinctes (par group_id)
    const groupIds = new Set(orders.map(o => (o as any).group_id || o.id));
    const nombreCommandes = groupIds.size;

    return {
      chiffreAffaires: Math.round(chiffreAffaires),
      beneficeNet: Math.round(beneficeNet),
      nombreCommandes
    };
  }

  private async getTopProduits(debut: Date, fin: Date) {
    const orders = await Order.findAll({
      where: {
        statut: 'livree_payee',
        date_statut_livree: { [Op.between]: [debut, fin] }
      },
      include: [{ model: Product, as: 'produit' }],
    });

    const produitsMap = new Map<string, { id: string; nom: string; ca: number; nombre: number }>();

    for (const o of orders) {
      const produit = (o as any).produit;
      if (!produit) continue;

      const existing = produitsMap.get(o.product_id);
      const ca = Number(o.prix_unitaire_reel) * o.quantite;

      if (existing) {
        existing.ca += ca;
        existing.nombre += o.quantite;
      } else {
        produitsMap.set(o.product_id, { id: o.product_id, nom: produit.nom, ca, nombre: o.quantite });
      }
    }

    return Array.from(produitsMap.values())
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 5)
      .map(p => ({ ...p, chiffreAffaires: Math.round(p.ca) }));
  }

  private async getEvolution(debut: Date, fin: Date) {
    const evolution = [];
    const current = new Date(debut);

    while (current <= fin) {
      const debutMois = new Date(current.getFullYear(), current.getMonth(), 1);
      const finMois = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      
      const stats = await this.getStatsPeriode(debutMois, finMois);
      
      const moisNoms = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
      evolution.push({
        mois: `${moisNoms[current.getMonth()]} ${current.getFullYear()}`,
        ...stats
      });

      current.setMonth(current.getMonth() + 1);
    }

    return evolution;
  }
}