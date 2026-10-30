import { Inject, Injectable } from '@nestjs/common';
import { USER_REPOSITORY, type UserRepository } from '../../identity/domain/user.repository.js';
import type { AgentDirectory } from '../domain/agent-directory.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adapter: answers Ticketing's question using Identity's user store. */
@Injectable()
export class IdentityAgentDirectory implements AgentDirectory {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async isAgent(userId: string): Promise<boolean> {
    if (!UUID.test(userId)) return false; // a malformed id can't be an agent, and Postgres would throw on it
    const user = await this.users.findById(userId);
    return user?.role === 'agent' || user?.role === 'admin';
  }
}
