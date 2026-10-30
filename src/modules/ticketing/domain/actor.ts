export const ActorRole = {
  CUSTOMER: 'customer',
  AGENT: 'agent',
  ADMIN: 'admin',
} as const;
export type ActorRole = (typeof ActorRole)[keyof typeof ActorRole];

/** Who is performing an action. Ticketing's own view of a user; it never imports Identity. */
export interface Actor {
  id: string;
  role: ActorRole;
}

export const isStaff = (actor: Actor): boolean => actor.role !== ActorRole.CUSTOMER;
