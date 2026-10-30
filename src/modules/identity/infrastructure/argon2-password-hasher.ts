import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { PasswordHasher } from '../domain/password-hasher.js';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain); // argon2id with the library's recommended parameters
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false; // malformed hash must not surface as a 500
    }
  }
}
