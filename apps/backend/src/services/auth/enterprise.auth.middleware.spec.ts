import { EnterpriseAuthMiddleware } from './enterprise.auth.middleware';
import { HttpForbiddenException } from '@gitroom/nestjs-libraries/services/exception.filter';

const run = async (headers: Record<string, unknown>) => {
  const mw = new EnterpriseAuthMiddleware();
  const next = jest.fn();
  await mw.use({ headers } as any, {} as any, next as any);
  return next;
};

const expectForbidden = async (headers: Record<string, unknown>) => {
  const mw = new EnterpriseAuthMiddleware();
  const next = jest.fn();
  await expect(
    mw.use({ headers } as any, {} as any, next as any)
  ).rejects.toBeInstanceOf(HttpForbiddenException);
  expect(next).not.toHaveBeenCalled();
};

describe('EnterpriseAuthMiddleware (S13 — T1-3)', () => {
  const OLD = process.env.ENTERPRISE_API_KEY;
  afterEach(() => {
    if (OLD === undefined) {
      delete process.env.ENTERPRISE_API_KEY;
    } else {
      process.env.ENTERPRISE_API_KEY = OLD;
    }
  });

  it('FAILS CLOSED when ENTERPRISE_API_KEY is unset', async () => {
    delete process.env.ENTERPRISE_API_KEY;
    await expectForbidden({ 'x-enterprise-key': 'anything' });
  });

  it('FAILS CLOSED when ENTERPRISE_API_KEY is empty', async () => {
    process.env.ENTERPRISE_API_KEY = '';
    await expectForbidden({ 'x-enterprise-key': 'anything' });
  });

  it('rejects a request with no x-enterprise-key header', async () => {
    process.env.ENTERPRISE_API_KEY = 'the-real-secret';
    await expectForbidden({});
  });

  it('rejects a wrong key', async () => {
    process.env.ENTERPRISE_API_KEY = 'the-real-secret';
    await expectForbidden({ 'x-enterprise-key': 'the-wrong-secret' });
  });

  it('rejects a non-string (array) header value', async () => {
    process.env.ENTERPRISE_API_KEY = 'the-real-secret';
    await expectForbidden({ 'x-enterprise-key': ['a', 'b'] });
  });

  it('rejects an empty-string header even when the secret is set', async () => {
    process.env.ENTERPRISE_API_KEY = 'the-real-secret';
    await expectForbidden({ 'x-enterprise-key': '' });
  });

  it('accepts the correct key and calls next()', async () => {
    process.env.ENTERPRISE_API_KEY = 'the-real-secret';
    const next = await run({ 'x-enterprise-key': 'the-real-secret' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not accept a key that only shares a prefix', async () => {
    process.env.ENTERPRISE_API_KEY = 'the-real-secret';
    await expectForbidden({ 'x-enterprise-key': 'the-real-secre' });
  });
});
