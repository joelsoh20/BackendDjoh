import { Commande } from '../models/Commande';
import { CommandeLigne } from '../models/CommandeLigne';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { Charge } from '../models/Charge';
import { MonthlyClosing } from '../models/MonthlyClosing';
import { ServiceLivraison } from '../models/ServiceLivraison';
import { Op } from 'sequelize';
import PDFDocument from 'pdfkit';
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

  private ligneCle(doc: PDFKit.PDFDocument, label: string, valeur: string): void {
    const y = doc.y;
    doc.fontSize(10).font('Helvetica').fillColor('#555').text(label, 50, y);
    doc.font('Helvetica-Bold').fillColor('#000').text(valeur, 300, y);
    doc.moveDown(0.6);
  }

  async generateFEC(): Promise<string> {
    const commandes = await Commande.findAll({
      where: { statut: 'livree_payee' },
      include: [
        { model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] },
        { model: User, as: 'commercial', attributes: ['id', 'nom'] }
      ],
      order: [['date_statut_livree', 'ASC']]
    });

    let csv = 'Date;Libellé;Débit;Crédit;Type\n';

    for (const commande of commandes) {
      const date = commande.date_statut_livree?.toISOString().split('T')[0] || '';
      const lignes = (commande as any).lignes as any[];
      for (const ligne of lignes || []) {
        const libelle = `Vente ${ligne.produit?.nom || ''} - ${commande.client_nom}`;
        const ca = Number(ligne.prix_unitaire_reel) * ligne.quantite;
        csv += `${date};${libelle};;${ca};CA\n`;
      }
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
        { model: Commande, as: 'commandes', include: [{ model: CommandeLigne, as: 'lignes', include: ['produit'] }, 'commercial'] }
      ]
    });

    // Génération d'un vrai PDF
    const filename = `Rapport_${m}_${a}.pdf`;
    const filepath = path.join(this.exportDir, filename);
    const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);
      stream.on('finish', () => resolve());
      stream.on('error', reject);

      doc.fontSize(20).font('Helvetica-Bold').text('Rapport mensuel', { align: 'center' });
      doc.fontSize(14).font('Helvetica').fillColor('#555')
        .text(`${moisNoms[m - 1]} ${a}`, { align: 'center' });
      doc.moveDown(1.5);
      doc.strokeColor('#DDDDDD').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(1);

      if (closing) {
        doc.fillColor('#000').fontSize(12).font('Helvetica-Bold').text('Chiffres clés');
        doc.moveDown(0.5);
        this.ligneCle(doc, 'Chiffre d\'affaires total', `${Number(closing.ca_total).toLocaleString('fr-FR')} FCFA`);
        this.ligneCle(doc, 'Bénéfice net', `${Number(closing.benefice_net_total).toLocaleString('fr-FR')} FCFA`);
        this.ligneCle(doc, 'Clôturé par', (closing as any).cloturePar?.nom || '-');
        this.ligneCle(doc, 'Date de clôture', new Date(closing.date_cloture).toLocaleDateString('fr-FR'));

        doc.moveDown(1);
        doc.fontSize(12).font('Helvetica-Bold').text('Commissions par commercial');
        doc.moveDown(0.5);

        const commissions = (closing.commissions_json as any[]) || [];
        if (commissions.length === 0) {
          doc.fontSize(10).font('Helvetica').fillColor('#777').text('Aucune commission ce mois.');
        } else {
          const startX = 50;
          let y = doc.y;
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#000');
          doc.text('Commercial', startX, y);
          doc.text('Produits vendus', startX + 250, y);
          doc.text('Montant dû', startX + 400, y);
          y += 16;
          doc.moveTo(startX, y).lineTo(545, y).strokeColor('#DDDDDD').stroke();
          y += 8;

          doc.font('Helvetica').fillColor('#333');
          let totalCommissions = 0;
          for (const comm of commissions) {
            doc.text(comm.nom || '-', startX, y);
            doc.text(String(comm.produits_vendus ?? 0), startX + 250, y);
            doc.text(`${Number(comm.montant_du || 0).toLocaleString('fr-FR')} FCFA`, startX + 400, y);
            totalCommissions += Number(comm.montant_du || 0);
            y += 18;
          }
          y += 4;
          doc.moveTo(startX, y).lineTo(545, y).strokeColor('#DDDDDD').stroke();
          y += 8;
          doc.font('Helvetica-Bold').fillColor('#000');
          doc.text('Total', startX + 250, y);
          doc.text(`${totalCommissions.toLocaleString('fr-FR')} FCFA`, startX + 400, y);
        }
      } else {
        doc.fontSize(12).font('Helvetica').fillColor('#777')
          .text(`Le mois de ${moisNoms[m - 1]} ${a} n'a pas encore été clôturé.`, { align: 'center' });
      }

      doc.end();
    });

    return `/exports/${filename}`;
  }

  /**
   * Solde à payer par commercial (commissions) et par service de
   * livraison (frais de livraison) sur les commandes livrées.
   */
  async generateBalance(): Promise<string> {
    const commandes = await Commande.findAll({
      where: { statut: 'livree_payee' },
      include: [
        { model: User, as: 'commercial', attributes: ['id', 'nom'] },
        { model: ServiceLivraison, as: 'service_livraison', attributes: ['id', 'nom'] }
      ]
    });

    let csv = 'Commercial;Commissions dues;Service de livraison;Frais dus\n';

    const parCommercial: Record<string, number> = {};
    const parServiceLivraison: Record<string, number> = {};

    for (const c of commandes) {
      const com = (c as any).commercial;
      const service = (c as any).service_livraison;

      if (com) {
        parCommercial[com.nom] = (parCommercial[com.nom] || 0) + Number(c.commission_commercial);
      }
      if (service) {
        parServiceLivraison[service.nom] = (parServiceLivraison[service.nom] || 0) + Number(c.frais_livraison);
      }
    }

    const commerciaux = Object.keys(parCommercial);
    const services = Object.keys(parServiceLivraison);
    const max = Math.max(commerciaux.length, services.length);

    for (let i = 0; i < max; i++) {
      const c = commerciaux[i] || '';
      const s = services[i] || '';
      csv += `${c};${parCommercial[c]?.toLocaleString() || ''};${s};${parServiceLivraison[s]?.toLocaleString() || ''}\n`;
    }

    const filename = `Balance_${new Date().toISOString().split('T')[0]}.csv`;
    const filepath = path.join(this.exportDir, filename);
    fs.writeFileSync(filepath, csv, 'utf-8');

    return `/exports/${filename}`;
  }
}
