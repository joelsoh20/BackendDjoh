import { User } from '../models/User';
import { Product } from '../models/Product';
import { ProductCommission } from '../models/ProductCommission';
import { Order } from '../models/Order';
import { Charge } from '../models/Charge';
import { MonthlyClosing } from '../models/MonthlyClosing';
 import { Stock } from '../models/Stock';
import { StockLivraison } from '../models/StockLivraison';
import { ServiceLivraison } from '../models/ServiceLivraison';


export const setupAssociations = (): void => {
  
  // ============================================
  // USER ↔ ORDER
  // ============================================
  User.hasMany(Order, {
    foreignKey: { name: 'commercial_id', allowNull: false },
    as: 'commandes'
  });
  Order.belongsTo(User, {
    foreignKey: 'commercial_id',
    as: 'commercial'
  });

  // ============================================
  // PRODUCT ↔ ORDER
  // ============================================
  Product.hasMany(Order, {
    foreignKey: { name: 'product_id', allowNull: false },
    as: 'commandes'
  });
  Order.belongsTo(Product, {
    foreignKey: 'product_id',
    as: 'produit'
  });


  // ============================================
  // MONTHLYCLOSING ↔ ORDER
  // ============================================
  MonthlyClosing.hasMany(Order, {
    foreignKey: { name: 'cloture_id', allowNull: true },
    as: 'commandes'
  });
  Order.belongsTo(MonthlyClosing, {
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
  // USER ↔ PRODUCT (via ProductCommission) N:N
  // ============================================
  User.belongsToMany(Product, {
    through: ProductCommission,
    foreignKey: 'user_id',
    otherKey: 'product_id',
    as: 'commissions_produits'
  });
  Product.belongsToMany(User, {
    through: ProductCommission,
    foreignKey: 'product_id',
    otherKey: 'user_id',
    as: 'commerciaux_commission'
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

ServiceLivraison.hasMany(Order, { foreignKey: 'service_livraison_id', as: 'commandes' });
Order.belongsTo(ServiceLivraison, { foreignKey: 'service_livraison_id', as: 'service_livraison' });



  console.log('✅ Associations configurées');

Product.hasOne(Stock, { foreignKey: 'product_id', as: 'stock' });
Stock.belongsTo(Product, { foreignKey: 'product_id', as: 'produit' });
};