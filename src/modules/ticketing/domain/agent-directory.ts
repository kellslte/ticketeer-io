export const AGENT_DIRECTORY = Symbol('AGENT_DIRECTORY');

/** Ticketing's question to Identity: is this user an existing agent or admin? */
export interface AgentDirectory {
  isAgent(userId: string): Promise<boolean>;
}
