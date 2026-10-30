import { lastValueFrom, of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor.js';

const run = (value: unknown) =>
  lastValueFrom(
    new ResponseEnvelopeInterceptor().intercept({} as never, { handle: () => of(value) }),
  );

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps data in the success envelope', async () => {
    expect(await run({ id: 1 })).toMatchObject({ status: 'success', data: { id: 1 } });
  });

  it('leaves empty (204) responses untouched', async () => {
    expect(await run(undefined)).toBeUndefined();
  });
});
