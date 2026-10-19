import { Injectable } from '@nestjs/common';
import * as client from 'openid-client';
import { OidcClaims, toClaims } from './sso.util';

export { OidcClaims } from './sso.util';

type OidcProvider = {
  id: string;
  oidcIssuer: string | null;
  oidcClientId: string | null;
  oidcClientSecret: string | null;
};

const CACHE_TTL_MS = 10 * 60 * 1000;

/** Thin wrapper over openid-client: discovery (cached), PKCE, code exchange. */
@Injectable()
export class OidcService {
  private readonly configs = new Map<
    string,
    { config: client.Configuration; at: number }
  >();

  forget(providerId: string) {
    for (const key of this.configs.keys()) {
      if (key.startsWith(`${providerId}:`)) this.configs.delete(key);
    }
  }

  /** Discovery for an issuer, used to validate settings. */
  async describe(issuer: string) {
    const config = await this.discover(issuer, 'docmost-check', undefined);
    const meta = config.serverMetadata();
    return {
      issuer: meta.issuer,
      authorizationEndpoint: meta.authorization_endpoint,
      tokenEndpoint: meta.token_endpoint,
      userinfoEndpoint: meta.userinfo_endpoint,
    };
  }

  private async discover(
    issuer: string,
    clientId: string,
    clientSecret?: string,
  ) {
    const url = new URL(issuer);
    // plain http is allowed for IdPs on a private network (e.g. Keycloak on a LAN)
    const options =
      url.protocol === 'http:'
        ? { execute: [client.allowInsecureRequests] }
        : undefined;
    return client.discovery(url, clientId, clientSecret, undefined, options);
  }

  private async configFor(p: OidcProvider) {
    const key = `${p.id}:${p.oidcIssuer}:${p.oidcClientId}`;
    const hit = this.configs.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.config;
    const config = await this.discover(
      p.oidcIssuer,
      p.oidcClientId,
      p.oidcClientSecret ?? undefined,
    );
    this.configs.set(key, { config, at: Date.now() });
    return config;
  }

  async buildLoginUrl(
    p: OidcProvider,
    redirectUri: string,
    withGroups: boolean,
  ) {
    const config = await this.configFor(p);
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: withGroups
        ? 'openid email profile groups'
        : 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { url: url.href, codeVerifier, state, nonce };
  }

  async exchange(
    p: OidcProvider,
    currentUrl: URL,
    checks: { codeVerifier: string; state: string; nonce: string },
  ): Promise<OidcClaims> {
    const config = await this.configFor(p);
    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: checks.codeVerifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
    });
    const idClaims = (tokens.claims() ?? {}) as Record<string, any>;
    let info: Record<string, any> = {};
    if (tokens.access_token && config.serverMetadata().userinfo_endpoint) {
      try {
        info = (await client.fetchUserInfo(
          config,
          tokens.access_token,
          idClaims.sub,
        )) as any;
      } catch {
        // the id token is enough when userinfo is unavailable
      }
    }
    const merged = { ...idClaims, ...info };
    return toClaims(merged);
  }
}
