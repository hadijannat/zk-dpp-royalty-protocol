import { AuthenticationError, ErrorCodes } from '@zkdpp/shared';
import type {
  KeycloakConfig,
  TokenResponse,
  IntrospectionResponse,
  UserInfoResponse,
  ServiceAccountCredentials,
  OpenIdConfiguration,
} from './types.js';

export type {
  KeycloakConfig,
  TokenResponse,
  IntrospectionResponse,
  UserInfoResponse,
  ServiceAccountCredentials,
  OpenIdConfiguration,
} from './types.js';

/**
 * Keycloak client for service-to-service authentication
 */
export class KeycloakClient {
  private config: KeycloakConfig;
  private openIdConfig: OpenIdConfiguration | null = null;
  private serviceToken: TokenResponse | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: KeycloakConfig) {
    this.config = config;
  }

  /**
   * Get base URL for realm endpoints
   */
  private get realmUrl(): string {
    return `${this.config.baseUrl}/realms/${this.config.realm}`;
  }

  /**
   * Fetch OpenID configuration (cached)
   */
  async getOpenIdConfiguration(): Promise<OpenIdConfiguration> {
    if (this.openIdConfig) {
      return this.openIdConfig;
    }

    const response = await fetch(
      `${this.realmUrl}/.well-known/openid-configuration`
    );

    if (!response.ok) {
      throw new AuthenticationError(
        'Failed to fetch OpenID configuration',
        ErrorCodes.AUTHENTICATION_REQUIRED
      );
    }

    this.openIdConfig = await response.json() as OpenIdConfiguration;
    return this.openIdConfig;
  }

  /**
   * Get service account access token (client credentials flow)
   */
  async getServiceToken(
    credentials?: ServiceAccountCredentials
  ): Promise<string> {
    const clientId = credentials?.clientId || this.config.clientId;
    const clientSecret = credentials?.clientSecret || this.config.clientSecret;

    if (!clientSecret) {
      throw new AuthenticationError(
        'Client secret required for service account token',
        ErrorCodes.AUTHENTICATION_REQUIRED
      );
    }

    // Check if cached token is still valid (with 30s buffer)
    const now = Date.now();
    if (this.serviceToken && now < this.tokenExpiresAt - 30000) {
      return this.serviceToken.access_token;
    }

    const openIdConfig = await this.getOpenIdConfiguration();

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    const response = await fetch(openIdConfig.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AuthenticationError(
        `Failed to obtain service token: ${error}`,
        ErrorCodes.AUTHENTICATION_REQUIRED
      );
    }

    this.serviceToken = await response.json() as TokenResponse;
    this.tokenExpiresAt = now + this.serviceToken.expires_in * 1000;

    return this.serviceToken.access_token;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<TokenResponse> {
    const openIdConfig = await this.getOpenIdConfiguration();

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code,
      redirect_uri: redirectUri,
    });

    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }

    if (codeVerifier) {
      params.set('code_verifier', codeVerifier);
    }

    const response = await fetch(openIdConfig.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AuthenticationError(
        `Token exchange failed: ${error}`,
        ErrorCodes.INVALID_TOKEN
      );
    }

    return response.json() as Promise<TokenResponse>;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const openIdConfig = await this.getOpenIdConfiguration();

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      refresh_token: refreshToken,
    });

    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }

    const response = await fetch(openIdConfig.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      throw new AuthenticationError(
        'Token refresh failed',
        ErrorCodes.TOKEN_EXPIRED
      );
    }

    return response.json() as Promise<TokenResponse>;
  }

  /**
   * Introspect a token to check validity and get claims
   */
  async introspectToken(token: string): Promise<IntrospectionResponse> {
    const openIdConfig = await this.getOpenIdConfiguration();

    if (!this.config.clientSecret) {
      throw new AuthenticationError(
        'Client secret required for token introspection',
        ErrorCodes.AUTHENTICATION_REQUIRED
      );
    }

    const params = new URLSearchParams({
      token,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(openIdConfig.introspection_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      throw new AuthenticationError(
        'Token introspection failed',
        ErrorCodes.INVALID_TOKEN
      );
    }

    return response.json() as Promise<IntrospectionResponse>;
  }

  /**
   * Get user info from access token
   */
  async getUserInfo(accessToken: string): Promise<UserInfoResponse> {
    const openIdConfig = await this.getOpenIdConfiguration();

    const response = await fetch(openIdConfig.userinfo_endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new AuthenticationError(
        'Failed to get user info',
        ErrorCodes.INVALID_TOKEN
      );
    }

    return response.json() as Promise<UserInfoResponse>;
  }

  /**
   * Generate authorization URL for redirect
   */
  async getAuthorizationUrl(
    redirectUri: string,
    state: string,
    codeChallenge?: string,
    scope: string = 'openid email profile'
  ): Promise<string> {
    const openIdConfig = await this.getOpenIdConfiguration();

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      state,
    });

    if (codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    return `${openIdConfig.authorization_endpoint}?${params}`;
  }

  /**
   * Logout user (invalidate session)
   */
  async logout(refreshToken?: string): Promise<void> {
    const openIdConfig = await this.getOpenIdConfiguration();

    if (!refreshToken) {
      return; // Nothing to invalidate
    }

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      refresh_token: refreshToken,
    });

    if (this.config.clientSecret) {
      params.set('client_secret', this.config.clientSecret);
    }

    await fetch(openIdConfig.end_session_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });
  }

  /**
   * Get JWKS URI for token verification
   */
  async getJwksUri(): Promise<string> {
    const openIdConfig = await this.getOpenIdConfiguration();
    return openIdConfig.jwks_uri;
  }
}

/**
 * Create Keycloak client from environment variables
 */
export function createKeycloakClient(): KeycloakClient {
  return new KeycloakClient({
    baseUrl: process.env.KEYCLOAK_URL || 'http://localhost:8080',
    realm: process.env.KEYCLOAK_REALM || 'zkdpp',
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'zkdpp-services',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  });
}

/**
 * Create Keycloak client with explicit config
 */
export function createKeycloakClientWithConfig(
  config: KeycloakConfig
): KeycloakClient {
  return new KeycloakClient(config);
}
