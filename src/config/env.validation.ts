const PLACEHOLDERS = ['change-me', 'changeme', 'your-secret', 'secret'];

/**
 * Fails the app at boot on a missing or unsafe config, instead of degrading
 * silently later. Length/placeholder checks apply in production only so short
 * dev values keep working.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];
  const production = config.NODE_ENV === 'production';

  const dbUrl = typeof config.DATABASE_URL === 'string' ? config.DATABASE_URL : '';
  if (!/^postgres(ql)?:\/\/.+/.test(dbUrl)) {
    errors.push('DATABASE_URL must be a postgres:// connection string');
  }

  const secret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET : '';
  if (!secret) {
    errors.push('JWT_SECRET is required');
  } else if (
    production &&
    (secret.length < 32 || PLACEHOLDERS.some((p) => secret.toLowerCase().includes(p)))
  ) {
    errors.push('JWT_SECRET must be at least 32 characters and not a placeholder in production');
  }

  if (errors.length) throw new Error(`Invalid environment:\n - ${errors.join('\n - ')}`);
  return config;
}
