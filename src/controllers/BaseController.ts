import { Request, Response } from 'express';
import { ApiResponse } from '../types';

export abstract class BaseController {
  
  protected success<T>(res: Response, data: T, message?: string, status = 200): void {
    const response: ApiResponse<T> = { success: true, data };
    if (message) response.message = message;
    res.status(status).json(response);
  }

  protected created<T>(res: Response, data: T, message = 'Créé avec succès'): void {
    this.success(res, data, message, 201);
  }

  protected error(res: Response, message: string, status = 500): void {
    res.status(status).json({ success: false, message });
  }

  protected notFound(res: Response, message = 'Ressource non trouvée'): void {
    this.error(res, message, 404);
  }

  protected forbidden(res: Response, message = 'Accès refusé'): void {
    this.error(res, message, 403);
  }

  protected unauthorized(res: Response, message = 'Non authentifié'): void {
    this.error(res, message, 401);
  }

  protected badRequest(res: Response, message = 'Requête invalide'): void {
    this.error(res, message, 400);
  }
}