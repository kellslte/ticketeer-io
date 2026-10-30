export const TicketStatus = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const;
export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ['in_progress', 'closed'],
  in_progress: ['resolved', 'closed'],
  resolved: ['in_progress', 'closed'], // in_progress = reopen
  closed: [],
};

/** Pure lifecycle rule. Who may perform a transition is decided by the Ticket aggregate. */
export const canTransition = (from: TicketStatus, to: TicketStatus): boolean =>
  TRANSITIONS[from].includes(to);
