import {
  AccountLockedError,
  CannotChangeOwnRoleError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  InvalidVerificationTokenError,
  UserNotFoundError,
} from '../domain/errors.js';
import { User } from '../domain/user.js';
import { ChangeUserRoleUseCase } from './change-user-role.use-case.js';
import { GetCurrentUserUseCase } from './get-current-user.use-case.js';
import { fakeHasher, fakeTokens, InMemoryRefreshTokenStore, InMemoryUserRepository } from './identity.fakes.js';
import { LoginUserUseCase } from './login-user.use-case.js';
import { RegisterUserUseCase } from './register-user.use-case.js';
import { ResendVerificationUseCase } from './resend-verification.use-case.js';
import { SessionService } from './session.service.js';
import { VerifyEmailUseCase } from './verify-email.use-case.js';
import { EmailVerificationTokens } from '../infrastructure/email-verification-tokens.js';

const dto = { email: ' Jane@Example.com ', password: 'long-enough-password', name: ' Jane ' };

describe('identity use-cases', () => {
  let users: InMemoryUserRepository;
  let register: RegisterUserUseCase;
  let login: LoginUserUseCase;
  let sessions: SessionService;
  let store: InMemoryRefreshTokenStore;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    register = new RegisterUserUseCase(users, fakeHasher);
    store = new InMemoryRefreshTokenStore();
    sessions = new SessionService(fakeTokens, store, users);
    login = new LoginUserUseCase(users, fakeHasher, sessions);
  });

  describe('register', () => {
    it('stores a normalized customer with a hashed password and returns no secrets', async () => {
      const result = await register.execute(dto);
      expect(result).toMatchObject({ email: 'jane@example.com', name: 'Jane', role: 'customer' });
      expect(result).not.toHaveProperty('passwordHash');
      expect([...users.items.values()][0]?.passwordHash).toBe('hashed:long-enough-password');
    });

    it('rejects an email that is already registered, ignoring case and spaces', async () => {
      await register.execute(dto);
      await expect(register.execute({ ...dto, email: 'JANE@example.com' })).rejects.toThrow(EmailAlreadyRegisteredError);
      expect(users.items.size).toBe(1);
    });
  });

  describe('login', () => {
    beforeEach(() => register.execute(dto));

    it('issues a token for valid credentials, ignoring email case', async () => {
      const result = await login.execute({ email: 'JANE@example.com', password: dto.password });
      expect(result).toEqual({
        accessToken: expect.stringContaining('token-for-'),
        expiresIn: 900,
        refreshToken: expect.any(String),
      });
    });

    it('throws the same error for a wrong password and an unknown email', async () => {
      const wrong = await login.execute({ email: 'jane@example.com', password: 'nope' }).catch((e) => e);
      const unknown = await login.execute({ email: 'who@example.com', password: dto.password }).catch((e) => e);
      expect(wrong).toBeInstanceOf(InvalidCredentialsError);
      expect(unknown).toBeInstanceOf(InvalidCredentialsError);
      expect(unknown.message).toBe(wrong.message);
    });

    it('still verifies a hash when the email is unknown (no timing shortcut)', async () => {
      const verify = vi.spyOn(fakeHasher, 'verify');
      await login.execute({ email: 'who@example.com', password: 'x' }).catch(() => undefined);
      expect(verify).toHaveBeenCalledOnce();
      verify.mockRestore();
    });

    describe('account lockout', () => {
      it('locks out user after 5 failed login attempts for 30 minutes', async () => {
        const email = 'jane@example.com';
        const wrongPassword = 'wrong-password';

        // Attempts 1 to 4 throw InvalidCredentialsError
        for (let i = 1; i <= 4; i++) {
          await expect(login.execute({ email, password: wrongPassword })).rejects.toThrow(InvalidCredentialsError);
          const user = await users.findByEmail(email);
          expect(user?.failedLoginAttempts).toBe(i);
          expect(user?.isLocked()).toBe(false);
        }

        // 5th attempt locks out the account and throws AccountLockedError
        await expect(login.execute({ email, password: wrongPassword })).rejects.toThrow(AccountLockedError);
        const lockedUser = await users.findByEmail(email);
        expect(lockedUser?.failedLoginAttempts).toBe(5);
        expect(lockedUser?.isLocked()).toBe(true);
        expect(lockedUser?.lockedUntil).not.toBeNull();
        // Lockout is for 30 minutes
        const diffMs = lockedUser!.lockedUntil!.getTime() - Date.now();
        expect(diffMs).toBeGreaterThan(29 * 60 * 1000);
        expect(diffMs).toBeLessThanOrEqual(30 * 60 * 1000);
      });

      it('rejects subsequent login attempts with AccountLockedError during lockout even with correct password', async () => {
        const email = 'jane@example.com';
        // Fail 5 times to lock out
        for (let i = 0; i < 5; i++) {
          await login.execute({ email, password: 'wrong' }).catch(() => undefined);
        }

        // Now attempt with the correct password while locked
        await expect(login.execute({ email, password: dto.password })).rejects.toThrow(AccountLockedError);
      });

      it('resets failed attempt counter upon successful login before reaching 5 attempts', async () => {
        const email = 'jane@example.com';
        // 2 failures
        await expect(login.execute({ email, password: 'wrong' })).rejects.toThrow(InvalidCredentialsError);
        await expect(login.execute({ email, password: 'wrong' })).rejects.toThrow(InvalidCredentialsError);
        expect((await users.findByEmail(email))?.failedLoginAttempts).toBe(2);

        // Successful login
        const res = await login.execute({ email, password: dto.password });
        expect(res.accessToken).toBeDefined();

        const user = await users.findByEmail(email);
        expect(user?.failedLoginAttempts).toBe(0);
        expect(user?.lockedUntil).toBeNull();
      });

      it('allows login after 30-minute lockout expires and resets lockout state', async () => {
        const email = 'jane@example.com';
        for (let i = 0; i < 5; i++) {
          await login.execute({ email, password: 'wrong' }).catch(() => undefined);
        }

        const lockedUser = await users.findByEmail(email);
        expect(lockedUser?.isLocked()).toBe(true);

        // Fast-forward past 30 minutes
        const now = new Date(Date.now() + 31 * 60 * 1000);
        expect(lockedUser?.isLocked(now)).toBe(false);

        // Manually adjust the lockedUntil to be in the past to simulate time passing
        const expiredUser = User.rehydrate({
          id: lockedUser!.id,
          email: lockedUser!.email,
          name: lockedUser!.name,
          passwordHash: lockedUser!.passwordHash,
          role: lockedUser!.role,
          emailVerifiedAt: lockedUser!.emailVerifiedAt,
          createdAt: lockedUser!.createdAt,
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() - 1000), // expired 1 sec ago
        });
        await users.save(expiredUser);

        // Login with correct password now succeeds
        const res = await login.execute({ email, password: dto.password });
        expect(res.accessToken).toBeDefined();

        const recoveredUser = await users.findByEmail(email);
        expect(recoveredUser?.failedLoginAttempts).toBe(0);
        expect(recoveredUser?.lockedUntil).toBeNull();
        expect(recoveredUser?.isLocked()).toBe(false);
      });

      it('starts a new attempt cycle if user fails password again after previous lockout expired', async () => {
        const email = 'jane@example.com';
        const user = await users.findByEmail(email);
        const expiredUser = User.rehydrate({
          id: user!.id,
          email: user!.email,
          name: user!.name,
          passwordHash: user!.passwordHash,
          role: user!.role,
          emailVerifiedAt: user!.emailVerifiedAt,
          createdAt: user!.createdAt,
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() - 1000), // expired
        });
        await users.save(expiredUser);

        // Next wrong password should reset counter to 1 and throw InvalidCredentialsError (not AccountLockedError)
        await expect(login.execute({ email, password: 'wrong-again' })).rejects.toThrow(InvalidCredentialsError);

        const updatedUser = await users.findByEmail(email);
        expect(updatedUser?.failedLoginAttempts).toBe(1);
        expect(updatedUser?.isLocked()).toBe(false);
      });
    });
  });

  describe('refresh tokens', () => {
    const credentials = { email: dto.email, password: dto.password };
    beforeEach(() => register.execute(dto));

    it('rotates: the old token stops working and a new pair is issued', async () => {
      const first = await login.execute(credentials);
      const second = await sessions.rotate(first.refreshToken);
      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.accessToken).toContain('token-for-');
      await expect(sessions.rotate(second.refreshToken)).resolves.toBeDefined();
    });

    it('treats reuse of a rotated token as theft and revokes the whole family', async () => {
      const first = await login.execute(credentials);
      const second = await sessions.rotate(first.refreshToken);
      await expect(sessions.rotate(first.refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
      await expect(sessions.rotate(second.refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
    });

    it('does not revoke other logins (families)', async () => {
      const a = await login.execute(credentials);
      const b = await login.execute(credentials);
      await sessions.logout(a.refreshToken);
      await expect(sessions.rotate(a.refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
      await expect(sessions.rotate(b.refreshToken)).resolves.toBeDefined();
    });

    it('rejects unknown and expired tokens, and tokens of deleted accounts', async () => {
      await expect(sessions.rotate('nope')).rejects.toThrow(InvalidRefreshTokenError);

      const expired = await login.execute(credentials);
      for (const t of store.tokens.values()) t.expiresAt = new Date(Date.now() - 1000);
      await expect(sessions.rotate(expired.refreshToken)).rejects.toThrow(InvalidRefreshTokenError);

      const orphan = await login.execute(credentials);
      users.items.clear();
      await expect(sessions.rotate(orphan.refreshToken)).rejects.toThrow(InvalidRefreshTokenError);
    });
  });

  describe('email verification', () => {
    const tokens = new EmailVerificationTokens('unit-test-secret');

    it('registers unverified with a pending verification request, and verifies via a signed token', async () => {
      const { id, emailVerified } = await register.execute(dto);
      expect(emailVerified).toBe(false);
      expect(users.items.get(id)?.pendingEvents).toHaveLength(1);

      await new VerifyEmailUseCase(users, tokens).execute(tokens.issue(id));
      expect(users.items.get(id)?.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('rejects forged, tampered, expired and unknown-user tokens', async () => {
      const { id } = await register.execute(dto);
      const verify = new VerifyEmailUseCase(users, tokens);
      const good = tokens.issue(id);
      const forged = new EmailVerificationTokens('other-secret').issue(id);
      const tampered = good.replace(id, '00000000-0000-0000-0000-000000000000');
      const expired = tokens.issue(id, Date.now() - 25 * 60 * 60 * 1000);
      for (const bad of [forged, tampered, expired, 'garbage', '', `${good}.extra`, tokens.issue('ghost')]) {
        await expect(verify.execute(bad)).rejects.toThrow(InvalidVerificationTokenError);
      }
      expect(users.items.get(id)?.emailVerifiedAt).toBeNull();
    });

    it('resend raises a new request only while unverified', async () => {
      const { id } = await register.execute(dto);
      const resend = new ResendVerificationUseCase(users);
      const user = users.items.get(id)!;
      user.pullEvents();
      await resend.execute(id);
      expect(user.pendingEvents).toHaveLength(1);

      user.verifyEmail();
      user.pullEvents();
      await resend.execute(id);
      expect(user.pendingEvents).toHaveLength(0);
      await expect(resend.execute('missing')).rejects.toThrow(UserNotFoundError);
    });
  });

  describe('get current user', () => {
    it('returns the user, or UserNotFound when the account is gone', async () => {
      const { id } = await register.execute(dto);
      const get = new GetCurrentUserUseCase(users);
      expect(await get.execute(id)).toMatchObject({ id, email: 'jane@example.com' });
      users.items.clear();
      await expect(get.execute(id)).rejects.toThrow(UserNotFoundError);
    });
  });

  describe('change role', () => {
    it('changes another user’s role', async () => {
      const { id } = await register.execute(dto);
      const result = await new ChangeUserRoleUseCase(users).execute('admin-id', id, 'agent');
      expect(result.role).toBe('agent');
      expect(users.items.get(id)?.role).toBe('agent');
    });

    it('refuses to change your own role and unknown users', async () => {
      const change = new ChangeUserRoleUseCase(users);
      await expect(change.execute('same', 'same', 'customer')).rejects.toThrow(CannotChangeOwnRoleError);
      await expect(change.execute('admin-id', 'missing', 'agent')).rejects.toThrow(UserNotFoundError);
    });
  });
});

describe('User', () => {
  it('registers as a customer regardless of anything else', () => {
    const user = User.register({ id: 'u1', email: ' A@B.com', name: ' N ', passwordHash: 'h' });
    expect(user).toMatchObject({ email: 'a@b.com', name: 'N', role: 'customer' });
  });
});
