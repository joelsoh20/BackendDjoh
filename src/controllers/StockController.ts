import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { StockRepository } from '../repositories/StockRepository';
import { StockMouvement } from '../models/StockMouvement';
import { User } from '../models/User';

const UNE_HEURE_MS = 60 * 60 * 1000;

export class StockController extends BaseController {
  private stockRepo: StockRepository;

  constructor() {
    super();
    this.stockRepo = new StockRepository();
  }

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const stocks = await this.stockRepo.findAllWithProduct();
      this.success(res, stocks);
    } catch (err) {
      this.error(res, 'Erreur');
    }
  };

  getByProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const stock = await this.stockRepo.findByProduct(req.params.productId as string);
      this.success(res, stock);
    } catch (err) {
      this.error(res, 'Erreur');
    }
  };

  /**
   * Ajoute (ou retire, admin uniquement) du stock, et trace le mouvement
   * pour permettre au manager de corriger une saisie récente (< 1h).
   * Le manager peut TOUJOURS ajouter — l'ancienne logique bloquait à tort
   * l'ajout dès que le stock n'avait pas été touché depuis plus d'1h, ce
   * qui rendait la fonctionnalité quasi inutilisable en pratique.
   */
  ajouter = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const user = await User.findByPk(userId);
      const { product_id, quantite } = req.body;
      const qte = parseInt(quantite);

      if (user?.role === 'manager' && qte < 0) {
        return this.forbidden(res, 'Vous ne pouvez pas diminuer le stock. Contactez l\'administrateur.');
      }

      await this.stockRepo.augmenterStock(product_id, qte);
      await StockMouvement.create({ product_id, user_id: userId, quantite: qte });

      // Notification à l'admin si c'est un manager qui modifie
      if (user?.role === 'manager') {
        try {
          const admins = await User.findAll({
            where: { role: 'admin', actif: true },
            attributes: ['id']
          });

          const { NotificationService } = require('../services/NotificationService');
          const notifService = new NotificationService();
          const produit = await this.stockRepo.findByProduct(product_id);

          for (const admin of admins) {
            await notifService.sendToUser(
              admin.id,
              '📦 Stock modifié',
             `${user.nom} (manager) a ${qte >= 0 ? 'ajouté' : 'retiré'} ${Math.abs(qte)} unité(s) ${(produit as any)?.produit?.nom ? `de ${(produit as any).produit.nom}` : ''} au stock général.`
            );
          }
        } catch (notifErr) {
          console.error('Erreur notification stock:', notifErr);
        }
      }

      const updated = await this.stockRepo.findByProduct(product_id);
      const action = qte >= 0 ? 'augmenté' : 'diminué';
      this.success(res, updated, `Stock ${action} (${qte >= 0 ? '+' : ''}${qte})`);
    } catch (err: any) {
      console.error('Erreur ajout stock:', err.message);
      this.error(res, 'Erreur');
    }
  };

  /**
   * Historique des ajouts récents pour un produit, avec indication de
   * savoir si LA PERSONNE QUI CONSULTE peut encore corriger chaque ligne.
   */
  getMouvements = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUser = (req as any).utilisateur;
      const { productId } = req.params;

      const mouvements = await StockMouvement.findAll({
        where: { product_id: productId },
        include: [{ model: User, as: 'auteur', attributes: ['id', 'nom', 'role'] }],
        order: [['date_creation', 'DESC']],
        limit: 20,
      });

      const resultat = mouvements.map((m: any) => {
        const estAuteur = m.user_id === currentUser.id;
        const dansDelai = Date.now() - new Date(m.date_creation).getTime() <= UNE_HEURE_MS;
        const peutModifier = currentUser.role === 'admin' || (estAuteur && dansDelai);

        return {
          id: m.id,
          quantite: m.quantite,
          date_creation: m.date_creation,
          auteur: m.auteur ? { id: m.auteur.id, nom: m.auteur.nom, role: m.auteur.role } : null,
          peutModifier,
        };
      });

      this.success(res, resultat);
    } catch (err: any) {
      console.error('Erreur getMouvements:', err.message);
      this.error(res, 'Erreur');
    }
  };

  /**
   * Corrige un ajout de stock déjà enregistré (ex : erreur de saisie).
   * - Admin : toujours autorisé.
   * - Manager : uniquement sur SA PROPRE saisie, et seulement dans
   *   l'heure qui suit — passé ce délai, contact admin requis.
   */
  modifierMouvement = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUser = (req as any).utilisateur;
      const id = req.params.id as string;
      const nouvelleQuantite = parseInt(req.body.quantite);

      if (isNaN(nouvelleQuantite) || nouvelleQuantite < 0) {
        return this.badRequest(res, 'Quantité invalide');
      }

      const mouvement = await StockMouvement.findByPk(id);
      if (!mouvement) return this.notFound(res, 'Mouvement non trouvé');

      if (currentUser.role !== 'admin') {
        if (mouvement.user_id !== currentUser.id) {
          return this.forbidden(res, 'Vous ne pouvez corriger que vos propres ajouts');
        }
        const tempsEcoule = Date.now() - new Date(mouvement.date_creation).getTime();
        if (tempsEcoule > UNE_HEURE_MS) {
          return this.forbidden(res, 'Délai de correction dépassé (1h). Contactez l\'administrateur.');
        }
      }

      const difference = nouvelleQuantite - mouvement.quantite;
      await this.stockRepo.augmenterStock(mouvement.product_id, difference);

      mouvement.quantite = nouvelleQuantite;
      await mouvement.save();

      const updated = await this.stockRepo.findByProduct(mouvement.product_id);
      this.success(res, updated, 'Mouvement corrigé');
    } catch (err: any) {
      console.error('Erreur modifierMouvement:', err.message);
      this.error(res, 'Erreur');
    }
  };
}
