import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { JwtPayload } from '../types';

export const auth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const header = req.headers.authorization;
    
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Token manquant' });
      return;
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

    const user = await User.findByPk(decoded.userId);
    
    if (!user || !user.actif) {
      res.status(401).json({ success: false, message: 'Utilisateur non trouvé ou désactivé' });
      return;
    }

    (req as any).utilisateur = user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token invalide' });
  }
};