import { CannotChangeOwnRoleError, EmailAlreadyRegisteredError, InvalidCredentialsError, UserNotFoundError } from '../domain/errors.js';
import { User } from '../domain/user.js';
import { ChangeUserRoleUseCase } from './change-user-role.use-case.js';
import { GetCurrentUserUseCase } from './get-current-user.use-case.js';
import { fakeHasher, fakeTokens, InMemoryUserRepository } from './identity.fakes.js';
import { LoginUserUseCase } from './login-user.use-case.js';
import { RegisterUserUseCase } from './register-user.use-case.js';

const dto = { email: ' Jane@Example.com ', password: 'long-enough-password', name: ' Jane ' };

describe('identity use-cases', () => {
  let users: InMemoryUserRepository;
  let register: RegisterUserUseCase;
  let login: LoginUserUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    register = new RegisterUserUseCase(users, fakeHasher);
    login = new LoginUserUseCase(users, fakeHasher, fakeTokens);
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
      expect(result).toEqual({ accessToken: expect.stringContaining('token-for-'), expiresIn: 900 });
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
