export const Role = {
  CUSTOMER: 'customer',
  AGENT: 'agent',
  ADMIN: 'admin',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
