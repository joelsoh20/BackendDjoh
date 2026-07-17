import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { JwtPayload, ApiResponse } from '../types';
import { Op } from 'sequelize';

export class AuthService {
  
  async login(identifiant: string, motDePasse: string): Promise<ApiResponse<{ token: string; utilisateur: Partial<User> }>> {
    // Recherche par email OU par nom
    const user = await User.findOne({
    where: { nom: identifiant, actif: true }
  });
    
    if (!user) {
      return { success: false, message: 'Identifiant ou mot de passe incorrect' };
    }

    const valid = await user.verifierMotDePasse(motDePasse);
    if (!valid) {
      return { success: false, message: 'Identifiant ou mot de passe incorrect' };
    }

    const payload: JwtPayload = { userId: user.id, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET!, { 
  expiresIn: '7d'
});
    return {
      success: true,
      data: { token, utilisateur: user.toJSON() }
    };
  }

  async getProfile(userId: string): Promise<ApiResponse<Partial<User>>> {
    const user = await User.findByPk(userId);
    if (!user) {
      return { success: false, message: 'Utilisateur non trouvé' };
    }
    return { success: true, data: user.toJSON() };
  }

  async changerMotDePasse(userId: string, ancien: string, nouveau: string): Promise<ApiResponse> {
    const user = await User.findByPk(userId);
    if (!user) {
      return { success: false, message: 'Utilisateur non trouvé' };
    }

    const valid = await user.verifierMotDePasse(ancien);
    if (!valid) {
      return { success: false, message: 'Mot de passe actuel incorrect' };
    }

    user.mot_de_passe = nouveau;
    await user.save();

    return { success: true, message: 'Mot de passe modifié avec succès' };
  }
}