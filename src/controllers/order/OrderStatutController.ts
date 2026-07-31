import { Request, Response } from 'express';
import { OrderController } from './OrderController';
import { CommissionService } from '../../services/CommissionService';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { User } from '../../models/User';
import { Op } from 'sequelize';

export class OrderStatutController extends OrderController {
  private commissionService: CommissionService;

  constructor() {
    super();
    this.commissionService = new CommissionService();
  }

  updateStatut = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { statut, frais_livraison, service_livraison_id } = req.body;

    console.log("======================================");
    console.log("🚀 UPDATE STATUT");
    console.log("ID :", id);
    console.log("Statut demandé :", statut);

    const order = await this.orderRepo.findById(id);

    if (!order) {
      console.log("❌ Commande introuvable");
      return this.notFound(res, "Commande non trouvée");
    }

    console.log("📦 Commande trouvée");
    console.log({
      id: order.id,
      statut: order.statut,
      client: order.client_nom,
      cloture: order.cloture_id
    });

    if (order.cloture_id)
      return this.badRequest(res, "Commande clôturée");

    const statutActuel = order.statut;

    console.log("Statut actuel :", statutActuel);
    console.log("Nouveau statut :", statut);

    if (statut === "livree_payee") {

      console.log("➡️ Traitement livraison");

      order.date_statut_livree = new Date();
      order.frais_livraison = frais_livraison || 1000;
      order.service_livraison_id = service_livraison_id || null;

      if (order.commission_commercial === 0) {
        order.commission_commercial =
          await this.commissionService.calculerCommission(order);

        console.log(
          "💰 Commission calculée :",
          order.commission_commercial
        );
      }

      if (service_livraison_id) {

        console.log("📦 Mise à jour stock livraison");

        const { StockLivraison } = require("../../models/StockLivraison");

        const stockLivraison = await StockLivraison.findOne({
          where: {
            service_id: service_livraison_id,
            product_id: order.product_id
          }
        });

        if (stockLivraison) {

          console.log(
            "Stock avant :",
            stockLivraison.quantite
          );

          if (stockLivraison.quantite >= order.quantite) {

            stockLivraison.quantite -= order.quantite;

            await stockLivraison.save();

            console.log(
              "Stock après :",
              stockLivraison.quantite
            );
          }
        }
      }
    }

    if (statut === "annulee") {

      console.log("➡️ Traitement annulation");

      if (order.date_statut_livree) {

        const uneHeure = 60 * 60 * 1000;

        const tempsEcoule =
          Date.now() -
          new Date(order.date_statut_livree).getTime();

        if (tempsEcoule > uneHeure) {
          return this.badRequest(
            res,
            "Délai d'annulation dépassé"
          );
        }
      }

      order.motif_annulation = req.body.motif || null;
    }

    console.log("========== AVANT SAVE ==========");
    console.log({
      statutAvantSave: order.statut
    });

    order.statut = statut;

    console.log({
      statutApresModification: order.statut
    });

    await order.save();

    console.log("✅ save() terminé");

    const verification = await Order.findByPk(id);

    console.log("========== VERIFICATION DB ==========");
    console.log({
      statutEnBase: verification?.statut
    });

    const { ServiceLivraison } = require("../../models/ServiceLivraison");

    const orderWithService = await Order.findByPk(id, {
      include: [
        {
          model: Product,
          as: "produit"
        },
        {
          model: User,
          as: "commercial",
          attributes: ["id", "nom"]
        },
        {
          model: ServiceLivraison,
          as: "service_livraison"
        }
      ]
    });

    console.log("======================================");

    this.success(res, orderWithService);

  } catch (err: any) {
    console.error("❌ updateStatut :", err);
    this.error(res, "Erreur lors de la modification");
  }
};
}