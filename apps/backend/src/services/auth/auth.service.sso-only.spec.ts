// The injected services are only DI types here; mock them so the test doesn't
// load the Prisma/upload module graph.
jest.mock('@gitroom/nestjs-libraries/database/prisma/users/users.service', () => ({ UsersService: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service', () => ({ OrganizationService: class {} }));
jest.mock('@gitroom/nestjs-libraries/database/prisma/notifications/notification.service', () => ({ NotificationService: class {} }));
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({ EmailService: class {} }));
jest.mock('@gitroom/nestjs-libraries/newsletter/newsletter.service', () => ({ NewsletterService: class {} }));
jest.mock('@gitroom/backend/services/auth/providers/providers.manager', () => ({ AuthProviderManager: class {} }));

import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SSO_ONLY_ERROR } from '@gitroom/helpers/utils/sso.only';

// Trovida: POSTIZ_SSO_ONLY=true must make the Trovida OIDC provider (GENERIC)
// the only way into Postiz. The frontend hides the forms; these checks are what
// actually stop a direct API call.
describe('AuthService — POSTIZ_SSO_ONLY', () => {
  const OLD = process.env.POSTIZ_SSO_ONLY;
  const users = {
    getUserByEmail: jest.fn(),
    updatePassword: jest.fn(),
    activateUser: jest.fn(),
  };
  const orgs = { getCount: jest.fn().mockResolvedValue(0) };
  const email = { sendEmail: jest.fn() };
  const notifications = { sendEmail: jest.fn() };
  const providers = { getProvider: jest.fn() };
  const service = new AuthService(
    users as any,
    orgs as any,
    notifications as any,
    email as any,
    providers as any
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.POSTIZ_SSO_ONLY = 'true';
  });
  afterAll(() => {
    if (OLD === undefined) delete process.env.POSTIZ_SSO_ONLY;
    else process.env.POSTIZ_SSO_ONLY = OLD;
  });

  it('refuses email/password sign-in without looking the user up', async () => {
    await expect(
      service.routeAuth(
        'LOCAL' as any,
        { email: 'a@b.test', password: 'x', provider: 'LOCAL' } as any,
        '1.1.1.1',
        'ua'
      )
    ).rejects.toThrow(SSO_ONLY_ERROR);
    expect(users.getUserByEmail).not.toHaveBeenCalled();
  });

  it('refuses other social providers', async () => {
    await expect(
      service.routeAuth('GITHUB' as any, {} as any, '1.1.1.1', 'ua')
    ).rejects.toThrow(SSO_ONLY_ERROR);
    expect(() => service.oauthLink('GOOGLE')).toThrow(BadRequestException);
    await expect(
      service.checkExists('GITHUB', 'code')
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(providers.getProvider).not.toHaveBeenCalled();
  });

  it('still builds the Trovida (GENERIC) login link', () => {
    providers.getProvider.mockReturnValue({ generateLink: () => 'https://x' });
    expect(service.oauthLink('generic')).toBe('https://x');
  });

  it('only GENERIC can register', async () => {
    await expect(service.canRegister('LOCAL')).resolves.toBe(false);
    await expect(service.canRegister('GENERIC')).resolves.toBe(true);
  });

  it('disables password reset and activation', async () => {
    await expect(service.forgot('a@b.test')).resolves.toBe(false);
    expect(service.forgotReturn({ token: 't', password: 'p' } as any)).toBe(
      false
    );
    await expect(service.activate('code', '')).resolves.toBe(false);
    await expect(service.resendActivationEmail('a@b.test')).rejects.toThrow(
      SSO_ONLY_ERROR
    );
    expect(users.getUserByEmail).not.toHaveBeenCalled();
    expect(users.updatePassword).not.toHaveBeenCalled();
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });

  it('leaves email/password alone when the flag is off', async () => {
    process.env.POSTIZ_SSO_ONLY = 'false';
    users.getUserByEmail.mockResolvedValue(null);
    await expect(
      service.routeAuth(
        'LOCAL' as any,
        { email: 'a@b.test', password: 'x', provider: 'LOCAL' } as any,
        '1.1.1.1',
        'ua'
      )
    ).rejects.toThrow('Invalid user name or password');
  });
});
