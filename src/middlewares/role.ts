import { Request, Response, NextFunction } from 'express';
import { Role } from '../types';

export const role = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).utilisateur;
    
    if (!user) {
      res.status(401).json({ success: false, message: 'Non authentifié' });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({ success: false, message: 'Accès refusé' });
      return;
    }

    next();
  };
};

export const adminOnly = role('admin');
export const adminOrManager = role('admin', 'manager');