import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ServiceLivraison } from '../models/ServiceLivraison';
import { StockLivraison } from '../models/StockLivraison';
import { Stock } from '../models/Stock';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { Commande } from '../models/Commande';
import { CommandeLigne } from '../models/CommandeLigne';
import { Op } from 'sequelize';

export class ServiceLivraisonController extends BaseController {

  getAll = async (req: Request, res: Response): Promise<void> => {
    const services = await ServiceLivraison.findAll({
      include: [{ model: StockLivraison, as: 'stocks', include: [{ model: Product, as: 'produit' }] }]
    });
    this.success(res, services);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const { nom, contact, zone } = req.body;
    const service = await ServiceLivraison.create({ nom, contact, zone });
    this.created(res, service);
  };

  toggleActif = async (req: Request, res: Response): Promise<void> => {
    const service = await ServiceLivraison.findByPk(req.params.id as string);
    if (!service) return this.notFound(res, 'Service non trouvé');
    service.actif = !service.actif;
    await service.save();
    this.success(res, service);
  };

  ajouterStock = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const user = await User.findByPk(userId);
      const { service_id, product_id, quantite } = req.body;
      const qte = parseInt(quantite);

      // Manager : pas de diminution
      if (user?.role === 'manager' && qte < 0) {
        return this.forbidden(res, 'Vous ne pouvez pas diminuer le stock.');
      }

      // Vérifier le stock général disponible
      const stockGeneral = await Stock.findOne({ where: { product_id } });
      const disponible = stockGeneral ? stockGeneral.quantite : 0;

      if (qte > disponible) {
        return this.badRequest(res, `Stock insuffisant. Disponible dans le stock général : ${disponible}`);
      }

      // Déduire du stock général
      if (stockGeneral) {
        stockGeneral.quantite -= qte;
        await stockGeneral.save();
      }

      // Ajouter au stock du service de livraison
      const [stock] = await StockLivraison.findOrCreate({
        where: { service_id, product_id },
        defaults: { service_id, product_id, quantite: 0 }
      });
      stock.quantite += qte;
      await stock.save();

      // Notification à l'admin si c'est un manager
      if (user?.role === 'manager') {
        try {
          const admins = await User.findAll({
            where: { role: 'admin', actif: true },
            attributes: ['id']
          });

          const service = await ServiceLivraison.findByPk(service_id, { attributes: ['nom'] });
          const produit = await Product.findByPk(product_id, { attributes: ['nom'] });

          const { NotificationService } = require('../services/NotificationService');
          const notifService = new NotificationService();

          for (const admin of admins) {
            await notifService.sendToUser(
              admin.id,
              '🚚 Stock service modifié',
              `${user.nom} (manager) a transféré ${qte} unité(s) de ${produit?.nom || 'produit'} vers le service "${service?.nom || 'Inconnu'}".`
            );
          }
        } catch (notifErr) {
          console.error('Erreur notification stock service:', notifErr);
        }
      }

      this.success(res, stock, `${qte} unité(s) transférée(s) du stock général au service`);
    } catch (err: any) {
      console.error('Erreur ajouterStock:', err.message);
      this.error(res, 'Erreur');
    }
  };

  getStocks = async (req: Request, res: Response): Promise<void> => {
    const stocks = await StockLivraison.findAll({
      where: { service_id: req.params.serviceId as string },
      include: [{ model: Product, as: 'produit' }]
    });
    this.success(res, stocks);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUser = (req as any).utilisateur;
      
      if (currentUser.role !== 'admin') {
        return this.forbidden(res, 'Seul l\'administrateur peut supprimer un service de livraison.');
      }

      const id = req.params.id as string;
      const service = await ServiceLivraison.findByPk(id);
      if (!service) return this.notFound(res, 'Service non trouvé');

      const stocksService = await StockLivraison.findAll({ where: { service_id: id } });

      for (const s of stocksService) {
        const stockGeneral = await Stock.findOne({ where: { product_id: s.product_id } });
        if (stockGeneral) {
          stockGeneral.quantite += s.quantite;
          await stockGeneral.save();
        } else {
          await Stock.create({ product_id: s.product_id, quantite: s.quantite });
        }
      }

      await StockLivraison.destroy({ where: { service_id: id } });
      await service.destroy();

      this.success(res, null, `Service supprimé. ${stocksService.length} produit(s) retourné(s) au stock général.`);
    } catch (err: any) {
      console.error('Erreur DELETE service:', err.message);
      this.error(res, 'Erreur lors de la suppression');
    }
  };

  /**
   * Stats par service de livraison : nombre de commandes, valeur des
   * produits livrés, frais de livraison versés, bénéfice net.
   * Réservé admin/manager (route protégée par adminOrManager).
   */
  getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const periode = (req.query.periode as string) || 'jour';
      const { debut, fin } = this.getPlagePeriode(periode);
      const resultat = await this.calculerStatsParService(debut, fin);
      this.success(res, { periode, debut, fin, services: resultat });
    } catch (err: any) {
      console.error('Erreur getStats services livraison:', err.message);
      this.error(res, 'Erreur lors de la récupération des statistiques');
    }
  };

  /**
   * Stats du jour ET de la veille (utilisé par la page réservée admin :
   * suivi journalier des encaissements par service de livraison).
   */
  getStatsJourHier = async (req: Request, res: Response): Promise<void> => {
    try {
      const maintenant = new Date();
      const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
      const finJour = new Date(debutJour.getTime() + 24 * 60 * 60 * 1000);
      const debutHier = new Date(debutJour.getTime() - 24 * 60 * 60 * 1000);

      const [jour, hier] = await Promise.all([
        this.calculerStatsParService(debutJour, finJour),
        this.calculerStatsParService(debutHier, debutJour),
      ]);

      this.success(res, { jour, hier });
    } catch (err: any) {
      console.error('Erreur getStatsJourHier services livraison:', err.message);
      this.error(res, 'Erreur lors de la récupération des statistiques');
    }
  };

  private async calculerStatsParService(debut: Date | null, fin: Date | null) {
    const where: any = { statut: 'livree_payee' };
    if (debut && fin) {
      where.date_statut_livree = { [Op.between]: [debut, fin] };
    }

    const commandes = await Commande.findAll({
      where,
      include: [
        { model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] },
        { model: ServiceLivraison, as: 'service_livraison', attributes: ['id', 'nom'] }
      ]
    });

    const services = await ServiceLivraison.findAll({ attributes: ['id', 'nom', 'actif'] });
    const parService = new Map<string, {
      serviceId: string; nom: string; actif: boolean;
      nombreCommandes: number; nombreProduitsLivres: number; valeurProduitsLivres: number;
      fraisLivraisonTotal: number; coutRevientTotal: number; commissionTotal: number;
    }>();

    for (const s of services) {
      parService.set(s.id, {
        serviceId: s.id, nom: s.nom, actif: s.actif,
        nombreCommandes: 0, nombreProduitsLivres: 0, valeurProduitsLivres: 0,
        fraisLivraisonTotal: 0, coutRevientTotal: 0, commissionTotal: 0
      });
    }

    for (const c of commandes) {
      const service = (c as any).service_livraison;
      if (!service) continue; // commande pas encore assignée à un service

      if (!parService.has(service.id)) {
        parService.set(service.id, {
          serviceId: service.id, nom: service.nom, actif: true,
          nombreCommandes: 0, nombreProduitsLivres: 0, valeurProduitsLivres: 0,
          fraisLivraisonTotal: 0, coutRevientTotal: 0, commissionTotal: 0
        });
      }

      const entree = parService.get(service.id)!;
      const lignes = (c as any).lignes as any[];
      const valeur = (lignes || []).reduce((s, l) => s + Number(l.prix_unitaire_reel) * l.quantite, 0);
      const coutRevient = (lignes || []).reduce((s, l) => s + (l.produit ? Number(l.produit.cout_revient) * l.quantite : 0), 0);
      const nbProduits = (lignes || []).reduce((s, l) => s + l.quantite, 0);

      entree.nombreCommandes += 1;
      entree.nombreProduitsLivres += nbProduits;
      entree.valeurProduitsLivres += valeur;
      entree.fraisLivraisonTotal += Number(c.frais_livraison);
      entree.coutRevientTotal += coutRevient;
      entree.commissionTotal += Number(c.commission_commercial);
    }

    return Array.from(parService.values()).map(e => {
      // Bénéfice net = prix de vente - prix d'achat - frais de livraison - commission
      const beneficeNet = e.valeurProduitsLivres - e.coutRevientTotal - e.fraisLivraisonTotal - e.commissionTotal;
      const montantAPercevoir = e.valeurProduitsLivres - e.fraisLivraisonTotal;
      return {
        serviceId: e.serviceId,
        nom: e.nom,
        actif: e.actif,
        nombreCommandes: e.nombreCommandes,
        nombreProduitsLivres: e.nombreProduitsLivres,
        valeurProduitsLivres: Math.round(e.valeurProduitsLivres),
        fraisLivraisonTotal: Math.round(e.fraisLivraisonTotal),
        montantAPercevoir: Math.round(montantAPercevoir),
        beneficeNet: Math.round(beneficeNet),
      };
    }).sort((a, b) => b.valeurProduitsLivres - a.valeurProduitsLivres);
  }

  /**
   * Stats d'une date précise choisie par l'admin (calendrier).
   * GET /services-livraison/stats-jour?date=YYYY-MM-DD
   */
  getStatsPourDate = async (req: Request, res: Response): Promise<void> => {
    try {
      const dateParam = req.query.date as string;
      if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return this.badRequest(res, 'Paramètre date requis au format AAAA-MM-JJ');
      }

      const [annee, mois, jourNum] = dateParam.split('-').map(Number);
      const debut = new Date(annee as number, (mois as number) - 1, jourNum);
      const fin = new Date(debut.getTime() + 24 * 60 * 60 * 1000);

      const services = await this.calculerStatsParService(debut, fin);
      this.success(res, { date: dateParam, services });
    } catch (err: any) {
      console.error('Erreur getStatsPourDate:', err.message);
      this.error(res, 'Erreur lors de la récupération des statistiques');
    }
  };

  private getPlagePeriode(periode: string): { debut: Date | null; fin: Date | null } {
    const maintenant = new Date();
    const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const finJour = new Date(debutJour.getTime() + 24 * 60 * 60 * 1000);

    switch (periode) {
      case 'jour':
        return { debut: debutJour, fin: finJour };
      case 'semaine': {
        const debutSemaine = new Date(maintenant);
        debutSemaine.setDate(maintenant.getDate() - maintenant.getDay());
        debutSemaine.setHours(0, 0, 0, 0);
        return { debut: debutSemaine, fin: finJour };
      }
      case 'mois': {
        const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
        return { debut: debutMois, fin: finJour };
      }
      case 'tout':
        return { debut: null, fin: null };
      default:
        return { debut: debutJour, fin: finJour };
    }
  }
}