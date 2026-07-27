import { Request, Response } from 'express';
import { OrderController } from './OrderController';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { User } from '../../models/User';
import { Op } from 'sequelize';

export class OrderDashboardController extends OrderController {

  getMonDashboard = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const maintenant = new Date();
      const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
      const uneSemaine = new Date(maintenant.getTime() - 7 * 24 * 60 * 60 * 1000);

      const toutesMois = await Order.findAll({
        where: { commercial_id: userId, date_creation: { [Op.gte]: debutMois } },
        include: [
          { model: Product, as: 'produit' },
          { model: User, as: 'commercial', attributes: ['id', 'nom'] }
        ],
        order: [['date_creation', 'DESC']]
      }) as any[];

      // Commandes récentes (7 jours) pour l'affichage
      const toutes = toutesMois.filter((o: any) => new Date(o.date_creation) >= uneSemaine);

      // ----- compteurs basés sur les commandes groupées (group_id) -----
      const recuesGroupIds = new Set(
        toutesMois.filter(o => o.statut === 'recue').map(o => o.group_id || o.id)
      );
      const recues = recuesGroupIds.size;

      const livrees = toutesMois.filter((o: any) => o.statut === 'livree_payee');
      const livreesGroupIds = new Set(livrees.map(o => o.group_id || o.id));
      const commandesLivrees = livreesGroupIds.size;

      const annuleesGroupIds = new Set(
        toutesMois.filter(o => o.statut === 'annulee').map(o => o.group_id || o.id)
      );
      const annulees = annuleesGroupIds.size;

      // Total commandes du mois = group_id distincts
      const allGroupIds = new Set(toutesMois.map(o => o.group_id || o.id));
      const totalCommandesMois = allGroupIds.size;
      // ----------------------------------------------------------------

      const commissionTotale = livrees.reduce(
        (sum: number, o: any) => sum + Number(o.commission_commercial), 0
      );
      const produitsVendus = livrees.reduce(
        (sum: number, o: any) => sum + o.quantite, 0
      );
      const totalVentes = livrees.reduce(
        (sum: number, o: any) => sum + (Number(o.prix_unitaire_reel) * o.quantite), 0
      );
      const bonus = totalCommandesMois >= 110 ? 10000 : 0;

      // Évolution sur 6 mois (par mois)
      const evolution = [];
      for (let i = 5; i >= 0; i--) {
        const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
        const fin = i === 0
          ? maintenant
          : new Date(maintenant.getFullYear(), maintenant.getMonth() - i + 1, 0);

        const commandesPeriode = toutesMois.filter((o: any) => {
          const date = new Date(o.date_creation);
          return date >= debut && date <= fin && o.statut === 'livree_payee';
        });

        const periodeGroupIds = new Set(
          commandesPeriode.map(o => o.group_id || o.id)
        );

        evolution.push({
          mois: debut.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
          nb_commandes: periodeGroupIds.size,
          total_ventes: commandesPeriode.reduce(
            (sum: number, o: any) => sum + (Number(o.prix_unitaire_reel) * o.quantite),
            0
          ),
        });
      }

      const commandesSimplifiees = toutes.map((o: any) => ({
        id: o.id,
        group_id: o.group_id,
        client_nom: o.client_nom,
        client_telephone: o.client_telephone,
        date_creation: o.date_creation,
        statut: o.statut,
        produit_nom: o.produit?.nom || 'Sans nom',
        quantite: o.quantite,
        prix_unitaire_reel: o.prix_unitaire_reel,
        total: Number(o.prix_unitaire_reel) * o.quantite,
      }));

      this.success(res, {
        commandesEnvoyees: recues,
        commandesLivrees: commandesLivrees,
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