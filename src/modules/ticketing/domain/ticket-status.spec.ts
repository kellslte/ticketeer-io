import { canTransition, TicketStatus } from './ticket-status.js';

const ALL = Object.values(TicketStatus);
const VALID = new Set([
  'open>in_progress',
  'open>closed',
  'in_progress>resolved',
  'in_progress>closed',
  'resolved>in_progress',
  'resolved>closed',
]);

describe('canTransition', () => {
  const pairs = ALL.flatMap((from) => ALL.map((to) => [from, to] as const));

  it.each(pairs)('%s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(VALID.has(`${from}>${to}`));
  });

  it('treats closed as terminal', () => {
    expect(ALL.some((to) => canTransition('closed', to))).toBe(false);
  });
});
