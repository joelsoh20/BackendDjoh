import { User } from '../models/User';
import { Product } from '../models/Product';
import { ProductCommission } from '../models/ProductCommission';
import { Commande } from '../models/Commande';
import { CommandeLigne } from '../models/CommandeLigne';
import { OrderComment } from '../models/OrderComment';
import { Charge } from '../models/Charge';
import { MonthlyClosing } from '../models/MonthlyClosing';
import { Stock } from '../models/Stock';
import { StockLivraison } from '../models/StockLivraison';
import { ServiceLivraison } from '../models/ServiceLivraison';


export const setupAssociations = (): void => {

  // ============================================
  // USER ↔ COMMANDE
  // ============================================
  User.hasMany(Commande, {
    foreignKey: { name: 'commercial_id', allowNull: false },
    as: 'commandes'
  });
  Commande.belongsTo(User, {
    foreignKey: 'commercial_id',
    as: 'commercial'
  });

  // ============================================
  // COMMANDE ↔ COMMANDE_LIGNE
  // ============================================
  Commande.hasMany(CommandeLigne, {
    foreignKey: { name: 'commande_id', allowNull: false },
    as: 'lignes'
  });
  CommandeLigne.belongsTo(Commande, {
    foreignKey: 'commande_id',
    as: 'commande'
  });

  // ============================================
  // PRODUCT ↔ COMMANDE_LIGNE
  // ============================================
  Product.hasMany(CommandeLigne, {
    foreignKey: { name: 'product_id', allowNull: false },
    as: 'lignes'
  });
  CommandeLigne.belongsTo(Product, {
    foreignKey: 'product_id',
    as: 'produit'
  });


  // ============================================
  // MONTHLYCLOSING ↔ COMMANDE
  // ============================================
  MonthlyClosing.hasMany(Commande, {
    foreignKey: { name: 'cloture_id', allowNull: true },
    as: 'commandes'
  });
  Commande.belongsTo(MonthlyClosing, {
    foreignKey: 'cloture_id',
    as: 'cloture'
  });

  // ============================================
  // USER ↔ CHARGE (échantillons)
  // ============================================
  User.hasMany(Charge, {
    foreignKey: { name: 'commercial_id', allowNull: true },
    as: 'echantillons'
  });
  Charge.belongsTo(User, {
    foreignKey: 'commercial_id',
    as: 'commercial'
  });

  // ============================================
  // MONTHLYCLOSING ↔ USER (qui a clôturé)
  // ============================================
  MonthlyClosing.belongsTo(User, {
    foreignKey: { name: 'cloture_par', allowNull: false },
    as: 'cloturePar'
  });

  // ============================================
  // USER ↔ PRODUCT_COMMISSION (commissions par produit d'un commercial)
  // ============================================
  User.hasMany(ProductCommission, {
    foreignKey: 'user_id',
    as: 'commissions_produits'
  });

  ProductCommission.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'commercial'
  });
  ProductCommission.belongsTo(Product, {
    foreignKey: 'product_id',
    as: 'produit'
  });

  ServiceLivraison.hasMany(StockLivraison, { foreignKey: 'service_id', as: 'stocks' });
  StockLivraison.belongsTo(ServiceLivraison, { foreignKey: 'service_id', as: 'service' });
  StockLivraison.belongsTo(Product, { foreignKey: 'product_id', as: 'produit' });

  ServiceLivraison.hasMany(Commande, { foreignKey: 'service_livraison_id', as: 'commandes' });
  Commande.belongsTo(ServiceLivraison, { foreignKey: 'service_livraison_id', as: 'service_livraison' });

  // ============================================
  // ORDERCOMMENT ↔ USER
  // ============================================
  OrderComment.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'User'
  });

  // ============================================
  // ORDERCOMMENT ↔ COMMANDE
  // ============================================
  Commande.hasMany(OrderComment, {
    foreignKey: 'commande_id',
    as: 'commentaires'
  });
  OrderComment.belongsTo(Commande, {
    foreignKey: 'commande_id',
    as: 'commande'
  });

  console.log('✅ Associations configurées');

  Product.hasOne(Stock, { foreignKey: 'product_id', as: 'stock' });
  Stock.belongsTo(Product, { foreignKey: 'product_id', as: 'produit' });
};
