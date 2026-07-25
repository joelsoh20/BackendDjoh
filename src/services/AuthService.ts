import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { JwtPayload, ApiResponse } from '../types';
import { Op } from 'sequelize';

export class AuthService {
  
  // Change "identifiant" en "nom"
  async login(nom: string, motDePasse: string) {
  // Vérifier si l'utilisateur existe
  const user = await User.findOne({ 
    where: { nom: nom, actif: true }
  });
  
  if (!user) {
    return { 
      success: false, 
      message: 'Identifiant incorrect'  // ← Message spécifique
    };
  }

  console.log('✅ Utilisateur trouvé:', user.nom);
  console.log('🔑 Hash stocké:', user.mot_de_passe);
  console.log('🔑 Hash attendu:', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyFkR0NtVnUu');
  console.log('Mot de passe reçu :', motDePasse);
console.log('Hash en base :', user.mot_de_passe);


  const valid = await user.verifierMotDePasse(motDePasse);
  console.log('Résultat bcrypt.compare :', valid);
  if (!valid) {
    return { 
      success: false, 
      message: 'Mot de passe incorrect'  // ← Message spécifique
    };
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