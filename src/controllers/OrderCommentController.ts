import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { OrderComment } from '../models/OrderComment';
import { User } from '../models/User';
import { Commande } from '../models/Commande';
import { Op } from 'sequelize';

export class OrderCommentController extends BaseController {

  // Lister les commentaires d'une commande
  getByOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const commandeId = req.params.orderId as string;
      const comments = await OrderComment.findAll({
        where: { commande_id: commandeId },
        include: [{ model: User, as: 'User', attributes: ['id', 'nom', 'role'] }],
        order: [['date_creation', 'ASC']],
      });
      this.success(res, comments);
    } catch (err: any) {
      console.error('Erreur getByOrder:', err.message);
      this.error(res, 'Erreur lors de la récupération des commentaires');
    }
  };

  // Ajouter un commentaire
  add = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = (req as any).utilisateur;
      const { order_id, message } = req.body;
      if (!order_id || !message?.trim()) {
        return this.badRequest(res, 'Commande et message requis');
      }

      const commande = await Commande.findByPk(order_id, {
        include: [{ model: User, as: 'commercial', attributes: ['id', 'nom'] }]
      });
      if (!commande) return this.notFound(res, 'Commande non trouvée');

      if (user.role === 'commercial' && commande.commercial_id !== user.id) {
        return this.forbidden(res, 'Vous ne pouvez commenter que vos propres commandes');
      }

      const comment = await OrderComment.create({
        commande_id: order_id,
        user_id: user.id,
        message: message.trim(),
      });

      try {
        const { NotificationService } = require('../services/NotificationService');
        const notifService = new NotificationService();
        const authorName = user.nom;

        if (user.role === 'commercial') {
          const recipients = await User.findAll({
            where: { role: { [Op.in]: ['admin', 'manager'] }, actif: true },
            attributes: ['id']
          });
          for (const r of recipients) {
            await notifService.sendToUser(r.id,
              '💬 Nouveau commentaire',
              `${authorName} a commenté sa commande pour ${commande.client_nom}`
            );
          }
        } else {
          await notifService.sendToUser(commande.commercial_id,
            '💬 Nouveau commentaire',
            `${authorName} a commenté votre commande pour ${commande.client_nom}`
          );
        }
      } catch (notifErr) {
        console.error('Erreur notification commentaire:', notifErr);
      }

      this.created(res, comment);
    } catch (err: any) {
      console.error('Erreur ajout commentaire:', err.message);
      this.error(res, 'Erreur lors de l\'ajout du commentaire');
    }
  };
}
