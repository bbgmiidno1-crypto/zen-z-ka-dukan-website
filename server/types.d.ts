import type { AdminUser, PublicUser } from '../shared/types';

declare global {
  namespace Express {
    interface Request {
      customer?: PublicUser;
      admin?: AdminUser;
    }
  }
}

export {};
