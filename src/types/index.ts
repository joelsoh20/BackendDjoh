export type Role = 'admin' | 'manager' | 'commercial';
export type StatutCommande = 'recue' | 'validee' | 'livree_payee' | 'annulee';
export type TypeCharge = 'publicite' | 'echantillon';
export type CommissionMode = 'forfaitaire' | 'par_produit';
export type ActionCommandesEnAttente = 'annulees' | 'reportees';

export interface JwtPayload {
  userId: string;
  role: Role;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: {
    items: T[];
    total: number;
    page: number;
    limit: number;
  };
}