import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { Charge } from '../models/Charge';
import { MonthlyClosing } from '../models/MonthlyClosing';
import { Op } from 'sequelize';
import fs from 'fs';
import path from 'path';

export class ExportService {

  private exportDir: string;

  constructor() {
    this.exportDir = path.join(__dirname, '../../exports');
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  async generateFEC(): Promise<string> {
    const orders = await Order.findAll({
      where: { statut: 'livree_payee' },
      include: [
        { model: Product, as: 'produit' },
        { model: User, as: 'commercial', attributes: ['id', 'nom'] }
      ],
      order: [['date_statut_livree', 'ASC']]
    });

    let csv = 'Date;Libellé;Débit;Crédit;Type\n';

    for (const order of orders) {
      const date = order.date_statut_livree?.toISOString().split('T')[0] || '';
      const libelle = `Vente ${(order as any).produit?.nom || ''} - ${order.client_nom}`;
      const ca = Number(order.prix_unitaire_reel) * order.quantite;

      csv += `${date};${libelle};;${ca};CA\n`;
    }

    const charges = await Charge.findAll({ order: [['date', 'ASC']] });
    for (const charge of charges) {
      csv += `${charge.date};${charge.description || charge.type};${charge.montant};;Charge\n`;
    }

    const filename = `FEC_${new Date().toISOString().split('T')[0]}.csv`;
    const filepath = path.join(this.exportDir, filename);
    fs.writeFileSync(filepath, csv, 'utf-8');

    return `/exports/${filename}`;
  }

  async generatePDF(mois?: number, annee?: number): Promise<string> {
    const maintenant = new Date();
    const m = mois || maintenant.getMonth() + 1;
    const a = annee || maintenant.getFullYear();

    const closing = await MonthlyClosing.findOne({
      where: { mois: m, annee: a },
      include: [
        { model: User, as: 'cloturePar', attributes: ['nom'] },
        { model: Order, as: 'commandes', include: ['produit', 'commercial'] }
      ]
    });

    // Génération simple d'un fichier texte (remplacer par PDF si besoin)
    let content = `RAPPORT MENSUEL - ${m}/${a}\n`;
    content += '='.repeat(40) + '\n\n';

    if (closing) {
      content += `CA Total : ${Number(closing.ca_total).toLocaleString()} FCFA\n`;
      content += `Bénéfice Net : ${Number(closing.benefice_net_total).toLocaleString()} FCFA\n`;
      content += `Clôturé par : ${(closing as any).cloturePar?.nom}\n`;
      content += `Date clôture : ${closing.date_cloture}\n\n`;

      content += 'COMMISSIONS\n';
      content += '-'.repeat(40) + '\n';
      for (const comm of closing.commissions_json as any[]) {
        content += `${comm.nom} : ${comm.produits_vendus} produits → ${comm.montant_du.toLocaleString()} FCFA\n`;
      }
    } else {
      content += 'Mois non clôturé.\n';
    }

    const filename = `Rapport_${m}_${a}.txt`;
    const filepath = path.join(this.exportDir, filename);
    fs.writeFileSync(filepath, content, 'utf-8');

    return `/exports/${filename}`;
  }

  async generateBalance(): Promise<string> {
    const orderRepo = new (await import('../repositories/OrderRepository')).OrderRepository();
    const orders = await orderRepo.findAllWithRelations({
      where: { statut: 'livree_payee' }
    });

    let csv = 'Commercial;Commissions dues;Livreur;Frais dus\n';

    const parCommercial: Record<string, number> = {};
    const parLivreur: Record<string, number> = {};

    for (const o of orders) {
      const com = (o as any).commercial;
      const liv = (o as any).livreur;

      if (com) {
        parCommercial[com.nom] = (parCommercial[com.nom] || 0) + Number(o.commission_commercial);
      }
      if (liv) {
        parLivreur[liv.nom] = (parLivreur[liv.nom] || 0) + Number(o.frais_livraison);
      }
    }

    const commerciaux = Object.keys(parCommercial);
    const livreurs = Object.keys(parLivreur);
    const max = Math.max(commerciaux.length, livreurs.length);

    for (let i = 0; i < max; i++) {
      const c = commerciaux[i] || '';
      const l = livreurs[i] || '';
      csv += `${c};${parCommercial[c]?.toLocaleString() || ''};${l};${parLivreur[l]?.toLocaleString() || ''}\n`;
    }

    const filename = `Balance_${new Date().toISOString().split('T')[0]}.csv`;
    const filepath = path.join(this.exportDir, filename);
    fs.writeFileSync(filepath, csv, 'utf-8');

    return `/exports/${filename}`;
  }
}