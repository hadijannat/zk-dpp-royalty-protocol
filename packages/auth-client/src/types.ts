/**
 * Keycloak client configuration
 */
export interface KeycloakConfig {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret?: string;
}

/**
 * Token response from Keycloak
 */
export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token?: string;
  token_type: string;
  scope: string;
}

/**
 * Token introspection response
 */
export interface IntrospectionResponse {
  active: boolean;
  sub?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  aud?: string | string[];
  iss?: string;
  scope?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [clientId: string]: {
      roles: string[];
    };
  };
}

/**
 * User info response from Keycloak
 */
export interface UserInfoResponse {
  sub: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  groups?: string[];
}

/**
 * Service account credentials
 */
export interface ServiceAccountCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Well-known OpenID configuration endpoints
 */
export interface OpenIdConfiguration {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  introspection_endpoint: string;
  end_session_endpoint: string;
}
