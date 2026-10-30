import type { User } from '../domain/user.js';

export const toUserResponse = (user: User) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  createdAt: user.createdAt,
});
