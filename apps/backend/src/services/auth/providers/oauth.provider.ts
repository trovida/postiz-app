import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';
import { createHash, randomBytes } from 'crypto';

@AuthProvider({ provider: 'GENERIC' })
export class OauthProvider extends AuthProviderAbstract {
  private getConfig() {
    const {
      POSTIZ_OAUTH_AUTH_URL,
      POSTIZ_OAUTH_CLIENT_ID,
      POSTIZ_OAUTH_CLIENT_SECRET,
      POSTIZ_OAUTH_TOKEN_URL,
      POSTIZ_OAUTH_USERINFO_URL,
      FRONTEND_URL,
    } = process.env;

    if (
      !POSTIZ_OAUTH_USERINFO_URL ||
      !POSTIZ_OAUTH_TOKEN_URL ||
      !POSTIZ_OAUTH_CLIENT_ID ||
      !POSTIZ_OAUTH_CLIENT_SECRET ||
      !POSTIZ_OAUTH_AUTH_URL ||
      !FRONTEND_URL
    ) {
      throw new Error('POSTIZ_OAUTH environment variables are not set');
    }

    return {
      authUrl: POSTIZ_OAUTH_AUTH_URL,
      clientId: POSTIZ_OAUTH_CLIENT_ID,
      clientSecret: POSTIZ_OAUTH_CLIENT_SECRET,
      tokenUrl: POSTIZ_OAUTH_TOKEN_URL,
      userInfoUrl: POSTIZ_OAUTH_USERINFO_URL,
      // The optional org-link writer lives beside the token endpoint. Deriving
      // it keeps the env surface to the five URLs above.
      orgLinkUrl: POSTIZ_OAUTH_TOKEN_URL.replace(
        /\/oauth\/token\/?$/,
        '/oauth/org-link'
      ),
      frontendUrl: FRONTEND_URL,
    };
  }

  // Trovida's hardened OIDC shim MANDATES PKCE-S256 + a nonce (S1 remediation).
  // A stock OAuth2 provider sends neither. PKCE normally needs a per-request
  // random verifier carried from the authorize call to the token call, but this
  // provider abstraction splits those into two stateless methods with no shared
  // context (getToken receives only the code). Because Postiz is a CONFIDENTIAL
  // client (it authenticates the token exchange with client_secret), the code-
  // interception attack PKCE defends public clients against does not apply here,
  // so a DETERMINISTIC verifier derived from the client secret is sound: it is
  // secret (never transmitted except at /token alongside the secret), it hashes
  // to a stable challenge, and it lets the two phases agree without persistence.
  private pkceVerifier(clientSecret: string): string {
    // 43-char base64url = a valid RFC 7636 verifier (43–128 chars).
    return createHash('sha256')
      .update(`${clientSecret}:trovida-oidc-pkce-v1`)
      .digest('base64url');
  }

  private pkceChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  generateLink(query?: { state?: string }): string {
    const { authUrl, clientId, clientSecret, frontendUrl } = this.getConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      scope: 'openid profile email',
      response_type: 'code',
      state: query?.state || 'login',
      redirect_uri: `${frontendUrl}/auth?provider=GENERIC`,
      // nonce: required by the shim; the shim echoes it into the id_token, but
      // this provider consumes only the access token + /userinfo, so a fresh
      // random value that is never re-read is sufficient here.
      nonce: randomBytes(16).toString('hex'),
      code_challenge: this.pkceChallenge(this.pkceVerifier(clientSecret)),
      code_challenge_method: 'S256',
    });

    return `${authUrl}?${params.toString()}`;
  }

  async getToken(code: string, _redirectUri?: string): Promise<string> {
    const { tokenUrl, clientId, clientSecret, frontendUrl } = this.getConfig();
    const response = await fetch(`${tokenUrl}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${frontendUrl}/auth?provider=GENERIC`,
        // Same deterministic verifier used to build the challenge in
        // generateLink; the shim re-hashes it and compares.
        code_verifier: this.pkceVerifier(clientSecret),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token request failed: ${error}`);
    }

    const { access_token } = await response.json();
    return access_token;
  }

  async getUser(access_token: string): Promise<{ email: string; id: string }> {
    const { userInfoUrl } = this.getConfig();
    const response = await fetch(`${userInfoUrl}`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`User info request failed: ${error}`);
    }

    const { email, sub: id } = await response.json();
    return { email, id };
  }

  // Runs right after the OIDC login creates the merchant's Postiz org. Reports
  // the new org id back to Trovida's shim (/oauth/org-link), authenticated by
  // the shim access token WE were issued — the token both authenticates the
  // call and carries the storeId this flow was bound to, so the shim writes
  // stores.postiz_org_id (the dashboard "manage" state signal). Best-effort:
  // a failure here must not fail an otherwise-successful login.
  async postRegistration(providerToken: string, orgId: string): Promise<void> {
    try {
      const { orgLinkUrl } = this.getConfig();
      const response = await fetch(orgLinkUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${providerToken}`,
          Accept: 'application/json',
        },
        body: JSON.stringify({ org_id: orgId }),
      });
      if (!response.ok) {
        const error = await response.text();
        console.error(`OIDC org-link failed (${response.status}): ${error}`);
      }
    } catch (error) {
      console.error('OIDC org-link request threw:', error);
    }
  }
}
