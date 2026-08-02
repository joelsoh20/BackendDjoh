import { Request, Response } from 'express';
import { OrderController } from './OrderController';
import { Commande } from '../../models/Commande';
import { CommandeLigne } from '../../models/CommandeLigne';
import { Product } from '../../models/Product';
import { Op } from 'sequelize';

export class OrderDashboardController extends OrderController {

  getMonDashboard = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const maintenant = new Date();
      const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
      const uneSemaine = new Date(maintenant.getTime() - 7 * 24 * 60 * 60 * 1000);
      const debut6Mois = new Date(maintenant.getFullYear(), maintenant.getMonth() - 5, 1);

      // Activité (commandes SOUMISES ce mois) : sert à afficher "envoyées",
      // "en attente", "annulées" et le fil des dernières commandes — peu
      // importe quand elles seront (ou ont été) livrées.
      const commandesSoumisesMois = await Commande.findAll({
        where: { commercial_id: userId, date_creation: { [Op.gte]: debutMois } },
        include: [{ model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] }],
        order: [['date_creation', 'DESC']]
      }) as any[];

      // Chiffre d'affaires / commissions : une commande compte dans la
      // comptabilité du mois où elle a été LIVRÉE, peu importe quand elle
      // a été soumise par le commercial.
      const commandesLivreesMois = await Commande.findAll({
        where: { commercial_id: userId, statut: 'livree_payee', date_statut_livree: { [Op.gte]: debutMois } },
        include: [{ model: CommandeLigne, as: 'lignes' }]
      }) as any[];

      // 6 derniers mois de commandes livrées, pour le graphique d'évolution
      // (regroupées ensuite par mois de LIVRAISON, pas de soumission).
      const commandesLivrees6Mois = await Commande.findAll({
        where: { commercial_id: userId, statut: 'livree_payee', date_statut_livree: { [Op.gte]: debut6Mois } },
        include: [{ model: CommandeLigne, as: 'lignes' }]
      }) as any[];

      const recentes = commandesSoumisesMois.filter((c: any) => new Date(c.date_creation) >= uneSemaine);

      const recues = commandesSoumisesMois.filter(c => c.statut === 'recue').length;
      const annulees = commandesSoumisesMois.filter(c => c.statut === 'annulee').length;
      const totalCommandesMois = commandesSoumisesMois.length;

      const commandesLivrees = commandesLivreesMois.length;
      const commissionTotale = commandesLivreesMois.reduce(
        (sum: number, c: any) => sum + Number(c.commission_commercial), 0
      );
      const produitsVendus = commandesLivreesMois.reduce(
        (sum: number, c: any) => sum + (c.lignes || []).reduce((s: number, l: any) => s + l.quantite, 0), 0
      );
      const totalVentes = commandesLivreesMois.reduce(
        (sum: number, c: any) => sum + (c.lignes || []).reduce((s: number, l: any) => s + Number(l.prix_unitaire_reel) * l.quantite, 0), 0
      );
      const bonus = totalCommandesMois >= 110 ? 10000 : 0;

      // Évolution sur 6 mois (par mois de LIVRAISON)
      const evolution = [];
      for (let i = 5; i >= 0; i--) {
        const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
        const fin = i === 0
          ? maintenant
          : new Date(maintenant.getFullYear(), maintenant.getMonth() - i + 1, 0);

        const commandesPeriode = commandesLivrees6Mois.filter((c: any) => {
          const date = new Date(c.date_statut_livree);
          return date >= debut && date <= fin;
        });

        evolution.push({
          mois: debut.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
          nb_commandes: commandesPeriode.length,
          total_ventes: commandesPeriode.reduce(
            (sum: number, c: any) => sum + (c.lignes || []).reduce((s: number, l: any) => s + Number(l.prix_unitaire_reel) * l.quantite, 0),
            0
          ),
        });
      }

      const commandesSimplifiees = recentes.map((c: any) => {
        const lignes = c.lignes || [];
        const total = lignes.reduce((s: number, l: any) => s + Number(l.prix_unitaire_reel) * l.quantite, 0);
        const produits = lignes.map((l: any) => `${l.produit?.nom || 'Sans nom'} x${l.quantite}`);
        return {
          id: c.id,
          client_nom: c.client_nom,
          client_telephone: c.client_telephone,
          date_creation: c.date_creation,
          statut: c.statut,
          produits,
          total,
        };
      });

      this.success(res, {
        commandesEnvoyees: recues,
        commandesLivrees,
        commandesAnnulees: annulees,
        commissionTotale,
        produitsVendus,
        totalVentes,
        totalCommandesMois,
        bonus,
        evolution,
        dernieresCommandes: commandesSimplifiees.slice(0, 50),
      });
    } catch (err: any) {
      console.error('getMonDashboard erreur:', err.message);
      this.error(res, 'Erreur');
    }
  };
}
