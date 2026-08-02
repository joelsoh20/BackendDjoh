import { CommandeRepository } from '../repositories/CommandeRepository';
import { ChargeRepository } from '../repositories/ChargeRepository';
import { Commande } from '../models/Commande';
import { CommandeLigne } from '../models/CommandeLigne';
import { Product } from '../models/Product';
import { ServiceLivraison } from '../models/ServiceLivraison';
import { Op } from 'sequelize';

export class DashboardService {
  private commandeRepo: CommandeRepository;
  private chargeRepo: ChargeRepository;

  constructor() {
    this.commandeRepo = new CommandeRepository();
    this.chargeRepo = new ChargeRepository();
  }

  async getDashboard(): Promise<any> {
    const maintenant = new Date();
    const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const finJour = new Date(debutJour.getTime() + 24 * 60 * 60 * 1000);
    const debutHier = new Date(debutJour.getTime() - 24 * 60 * 60 * 1000);
    const finHier = debutJour;

    const debutSemaine = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - maintenant.getDay());
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const debutAnnee = new Date(maintenant.getFullYear(), 0, 1);
    const debutSemestre = new Date(maintenant.getFullYear(), maintenant.getMonth() - 6, 1);

    const [
      statsJour, statsHier, statsSemaine, statsMois,
      statsAnnee, statsSemestre, topProduits, evolution, charges,
      ventesServiceJour, ventesServiceHier
    ] = await Promise.all([
      this.getStatsPeriode(debutJour, finJour),
      this.getStatsPeriode(debutHier, finHier),
      this.getStatsPeriode(debutSemaine, finJour),
      this.getStatsPeriode(debutMois, finJour),
      this.getStatsPeriode(debutAnnee, finJour),
      this.getStatsPeriode(debutSemestre, finJour),
      this.getTopProduits(debutMois, finJour),
      this.getEvolution(debutSemestre, finJour),
      this.chargeRepo.findByPeriode(debutMois, finJour),
      this.getVentesParService(debutJour, finJour),
      this.getVentesParService(debutHier, finHier)
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
      evolutionMensuelle: evolution,
      ventesParServiceLivraison: {
        jour: ventesServiceJour,
        hier: ventesServiceHier
      }
    };
  }

  /**
   * Ventes (commandes livrées) regroupées par service de livraison sur une
   * période donnée. Utilisé pour le dashboard (jour/veille) et peut servir
   * de base à d'autres vues par service.
   */
  private async getVentesParService(debut: Date, fin: Date) {
    const commandes = await Commande.findAll({
      where: {
        statut: 'livree_payee',
        date_statut_livree: { [Op.between]: [debut, fin] }
      },
      include: [
        { model: CommandeLigne, as: 'lignes' },
        { model: ServiceLivraison, as: 'service_livraison', attributes: ['id', 'nom'] }
      ]
    });

    console.log(`[getVentesParService] ${debut.toISOString()} → ${fin.toISOString()} : ${commandes.length} commande(s) livrée(s) trouvée(s)`);

    const parService = new Map<string, { serviceId: string; nom: string; montant: number; nombreCommandes: number }>();

    for (const c of commandes) {
      const service = (c as any).service_livraison;
      const cle = service?.id || 'non_assigne';
      const nom = service?.nom || 'Non assigné';
      const lignes = (c as any).lignes as any[];
      const montant = (lignes || []).reduce((s, l) => s + Number(l.prix_unitaire_reel) * l.quantite, 0);

      if (!parService.has(cle)) {
        parService.set(cle, { serviceId: cle, nom, montant: 0, nombreCommandes: 0 });
      }
      const entree = parService.get(cle)!;
      entree.montant += montant;
      entree.nombreCommandes += 1;
    }

    return Array.from(parService.values())
      .map(e => ({ ...e, montant: Math.round(e.montant) }))
      .sort((a, b) => b.montant - a.montant);
  }

  private async getStatsPeriode(debut: Date, fin: Date) {
    const commandes = await this.commandeRepo.findByPeriode(debut, fin, 'livree_payee');

    let chiffreAffaires = 0;
    let beneficeNet = 0;

    for (const c of commandes) {
      const lignes = (c as any).lignes as any[];
      let caCommande = 0;
      let coutRevientCommande = 0;

      for (const ligne of lignes || []) {
        const ca = Number(ligne.prix_unitaire_reel) * ligne.quantite;
        caCommande += ca;
        const produit = ligne.produit;
        coutRevientCommande += produit ? Number(produit.cout_revient) * ligne.quantite : 0;
      }

      chiffreAffaires += caCommande;
      beneficeNet += caCommande - Number(c.frais_livraison) - Number(c.commission_commercial) - coutRevientCommande;
    }

    return {
      chiffreAffaires: Math.round(chiffreAffaires),
      beneficeNet: Math.round(beneficeNet),
      nombreCommandes: commandes.length
    };
  }

  private async getTopProduits(debut: Date, fin: Date) {
    const commandes = await Commande.findAll({
      where: {
        statut: 'livree_payee',
        date_statut_livree: { [Op.between]: [debut, fin] }
      },
      include: [{ model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] }],
    });

    const produitsMap = new Map<string, { id: string; nom: string; ca: number; nombre: number }>();

    for (const c of commandes) {
      const lignes = (c as any).lignes as any[];
      for (const ligne of lignes || []) {
        const produit = ligne.produit;
        if (!produit) continue;

        const existing = produitsMap.get(ligne.product_id);
        const ca = Number(ligne.prix_unitaire_reel) * ligne.quantite;

        if (existing) {
          existing.ca += ca;
          existing.nombre += ligne.quantite;
        } else {
          produitsMap.set(ligne.product_id, { id: ligne.product_id, nom: produit.nom, ca, nombre: ligne.quantite });
        }
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
