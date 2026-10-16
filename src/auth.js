// -----------------------------------------------------------------------------
// BMW sign-in: OAuth 2.0 Device Authorization Grant ("device code flow") with
// PKCE, as BMW CarData documents it (customer.bmwgroup.com/gcdm/oauth/*).
//
//   1. "Connect" (account_link field): POST /device/code with the client ID
//      the user generated in the CarData portal, the scopes and a PKCE
//      challenge -> a user code and the BMW page where to approve it.
//   2. The user signs in on that page and approves the code. Nothing comes
//      back to Gladys: the integration asks POST /token every `interval`
//      seconds (authorization_pending, slow_down) until the approval.
//   3. The answer holds three tokens and the GCID of the account:
//        - access_token (1 h): the REST API;
//        - id_token (1 h): the password of the MQTT stream;
//        - refresh_token (2 weeks): a new set of the three, refresh included.
//      Once the refresh token is dead (Gladys off for two weeks, client
//      deleted or unsubscribed in the portal), only a new Connect helps.
//
// One refresh at a time (single-flight), and the new tokens are stored before
// they are used: the previous refresh token may be dead already.
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';

const DEVICE_CODE_URL = 'https://customer.bmwgroup.com/gcdm/oauth/device/code';
const TOKEN_URL = 'https://customer.bmwgroup.com/gcdm/oauth/token';
// BMW recommends asking authenticate_user and openid explicitly, plus the
// scopes of the services the client ID is subscribed to.
const SCOPES = 'authenticate_user openid cardata:api:read cardata:streaming:read';
const REQUEST_TIMEOUT_MS = 30000;
// Refresh this long before the expiry: the stream closes when its ID token dies.
const EXPIRY_MARGIN_MS = 10 * 60 * 1000;
const REFRESH_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_WAIT_MS = 15 * 60 * 1000;

/** An error of the BMW sign-in; `reauth` when only a new Connect can fix it. */
class AuthError extends Error {
  /**
   * @param {string} message - The message.
   * @param {object} [details] - `{ status, code, reauth }`.
   */
  constructor(message, { status = 0, code = '', reauth = false } = {}) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
    this.reauth = reauth;
  }
}

/**
 * @description A base64url string without padding.
 * @param {Buffer} buffer - The bytes.
 * @returns {string} The string.
 */
function base64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @description A fresh PKCE verifier (RFC 7636: 43 to 128 characters).
 * @returns {string} The verifier.
 */
function createVerifier() {
  return base64Url(randomBytes(64));
}

/**
 * @description The S256 challenge of a verifier.
 * @param {string} verifier - The verifier.
 * @returns {string} The challenge.
 * @example
 * challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
 * // -> 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
 */
function challengeOf(verifier) {
  return base64Url(createHash('sha256').update(verifier, 'ascii').digest());
}

/**
 * @description The claims of a JWT, without checking it (the GCID fallback).
 * @param {string} token - The JWT.
 * @returns {object} The claims, {} when unreadable.
 */
function jwtClaims(token) {
  try {
    const part = String(token).split('.')[1];
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) ?? {};
  } catch {
    return {};
  }
}

/**
 * @description Read a token answer into the stored shape.
 * @param {object} body - The JSON body.
 * @param {number} now - Now, in ms.
 * @param {object} [previous] - The tokens to keep what the answer lacks.
 * @returns {object} `{ accessToken, idToken, refreshToken, expiresAt, refreshExpiresAt, gcid }`.
 * @throws {AuthError} Without access token.
 */
function readTokens(body, now, previous = {}) {
  const text = (value) => (typeof value === 'string' && value ? value : '');
  const accessToken = text(body?.access_token);
  if (!accessToken) {
    throw new AuthError('BMW sent no access token');
  }
  const idToken = text(body.id_token) || previous.idToken || '';
  const refreshToken = text(body.refresh_token) || previous.refreshToken || '';
  const expiresIn = Number(body.expires_in);
  const gcid = text(body.gcid) || text(jwtClaims(idToken).gcid) || previous.gcid || '';
  return {
    accessToken,
    idToken,
    refreshToken,
    expiresAt: now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
    refreshExpiresAt: text(body.refresh_token)
      ? now + REFRESH_LIFETIME_MS
      : (previous.refreshExpiresAt ?? 0),
    gcid,
  };
}

/**
 * @description POST a form to BMW and read the JSON answer.
 * @param {Function} fetchImpl - fetch.
 * @param {string} url - The URL.
 * @param {object} form - The form fields.
 * @returns {Promise<{ status: number, body: object }>} The answer.
 * @throws {AuthError} When BMW cannot be reached.
 */
async function postForm(fetchImpl, url, form) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new AuthError(`BMW sign-in unreachable: ${err.message}`);
  }
  let body;
  try {
    body = (await response.json()) ?? {};
  } catch {
    body = {};
  }
  return { status: response.status, body };
}

/**
 * @description The error of a refused answer (never the tokens).
 * @param {number} status - The HTTP status.
 * @param {object} body - The body.
 * @returns {string} The description.
 */
function describe(status, body) {
  const code = typeof body?.error === 'string' ? body.error : '';
  const text = typeof body?.error_description === 'string' ? body.error_description : '';
  return `HTTP ${status}${code ? `, ${code}` : ''}${text ? `: ${text.slice(0, 200)}` : ''}`;
}

/**
 * @description Ask BMW for a device code.
 * @param {object} options - Options.
 * @param {string} options.clientId - The CarData client ID.
 * @param {Function} [options.fetchImpl] - fetch.
 * @returns {Promise<object>} `{ deviceCode, userCode, verificationUrl, interval, expiresIn, verifier }`.
 * @throws {AuthError} When BMW refuses (unknown client ID…).
 */
async function requestDeviceCode({ clientId, fetchImpl = fetch }) {
  const verifier = createVerifier();
  const { status, body } = await postForm(fetchImpl, DEVICE_CODE_URL, {
    client_id: clientId,
    response_type: 'device_code',
    scope: SCOPES,
    code_challenge: challengeOf(verifier),
    code_challenge_method: 'S256',
  });
  if (
    status !== 200 ||
    typeof body.device_code !== 'string' ||
    typeof body.user_code !== 'string'
  ) {
    throw new AuthError(`BMW refused the device code request (${describe(status, body)})`, {
      status,
      code: body?.error ?? '',
    });
  }
  const base = typeof body.verification_uri === 'string' ? body.verification_uri : '';
  const complete =
    typeof body.verification_uri_complete === 'string' ? body.verification_uri_complete : '';
  let verificationUrl = complete;
  if (!verificationUrl && base) {
    const url = new URL(base);
    url.searchParams.set('user_code', body.user_code);
    verificationUrl = url.toString();
  }
  if (!/^https:\/\//.test(verificationUrl)) {
    throw new AuthError('BMW sent no verification page');
  }
  const interval = Number(body.interval);
  const expiresIn = Number(body.expires_in);
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUrl,
    interval: Number.isFinite(interval) && interval > 0 ? Math.min(interval, 60) : 5,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 300,
    verifier,
  };
}

/**
 * @description Wait for the approval of a device code.
 * @param {object} options - Options.
 * @param {string} options.clientId - The CarData client ID.
 * @param {object} options.code - The answer of requestDeviceCode.
 * @param {Function} [options.fetchImpl] - fetch.
 * @param {Function} [options.sleep] - `(ms) => Promise`.
 * @param {Function} [options.now] - Clock.
 * @param {Function} [options.cancelled] - `() => boolean`: stop waiting.
 * @returns {Promise<object|null>} The tokens, null when cancelled.
 * @throws {AuthError} When refused, expired or abandoned.
 */
async function waitForApproval({
  clientId,
  code,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  cancelled = () => false,
}) {
  const deadline = now() + Math.min(code.expiresIn * 1000, MAX_WAIT_MS);
  let interval = code.interval * 1000;
  let serverErrors = 0;
  while (now() < deadline) {
    await sleep(interval);
    if (cancelled()) {
      return null;
    }
    let answer;
    try {
      answer = await postForm(fetchImpl, TOKEN_URL, {
        client_id: clientId,
        device_code: code.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        code_verifier: code.verifier,
      });
    } catch {
      continue; // network hiccup: keep waiting
    }
    if (cancelled()) {
      return null;
    }
    const { status, body } = answer;
    if (status === 200) {
      return readTokens(body, now());
    }
    if (body.error === 'authorization_pending') {
      serverErrors = 0;
      continue;
    }
    if (body.error === 'slow_down') {
      interval += 5000;
      continue;
    }
    // BMW's sign-in backend answers 5xx now and then: a few retries.
    if (status >= 500 && serverErrors < 3) {
      serverErrors += 1;
      continue;
    }
    throw new AuthError(`BMW refused the sign-in (${describe(status, body)})`, {
      status,
      code: body.error ?? '',
    });
  }
  throw new AuthError('The code was not approved in time', { code: 'expired_token' });
}

/**
 * @description Create the token manager.
 * @param {object} options - Options.
 * @param {Function} options.getClientId - `() => string`.
 * @param {Function} options.saveTokens - `async (tokens) => void`, stores them.
 * @param {Function} [options.fetchImpl] - fetch.
 * @param {Function} [options.now] - Clock.
 * @returns {object} The manager.
 */
function createTokenManager({ getClientId, saveTokens, fetchImpl = fetch, now = Date.now }) {
  const empty = () => ({
    accessToken: '',
    idToken: '',
    refreshToken: '',
    expiresAt: 0,
    refreshExpiresAt: 0,
    gcid: '',
  });
  let current = empty();
  let refreshing = null;

  /**
   * @description Store and adopt new tokens (stored first).
   * @param {object} tokens - The tokens.
   * @returns {Promise<object>} The tokens.
   */
  async function adopt(tokens) {
    current = tokens;
    await saveTokens(tokens);
    return tokens;
  }

  /**
   * @description Run one refresh, shared by every caller.
   * @returns {Promise<object>} The new tokens.
   */
  function refresh() {
    if (!refreshing) {
      const previous = current;
      refreshing = (async () => {
        const clientId = getClientId();
        if (!clientId || !previous.refreshToken) {
          throw new AuthError('Not signed in to BMW', { reauth: true });
        }
        const { status, body } = await postForm(fetchImpl, TOKEN_URL, {
          grant_type: 'refresh_token',
          refresh_token: previous.refreshToken,
          client_id: clientId,
        });
        if (status !== 200) {
          // A dead or revoked refresh token is a 400/401 invalid_grant; only a
          // 5xx is worth trying again later.
          throw new AuthError(`BMW refused the token refresh (${describe(status, body)})`, {
            status,
            code: body?.error ?? '',
            reauth: status >= 400 && status < 500,
          });
        }
        return adopt(readTokens(body, now(), previous));
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  return {
    /**
     * @description Load the stored tokens (startup, config reload).
     * @param {object} tokens - The stored tokens.
     */
    setTokens(tokens) {
      if (!refreshing) {
        current = { ...current, ...tokens };
      }
    },

    /** @returns {object} The current tokens (read-only use). */
    get tokens() {
      return { ...current };
    },

    /** @returns {boolean} True when signed in (a refresh token is known). */
    hasGrant() {
      return Boolean(current.refreshToken);
    },

    /**
     * @description Adopt the tokens of a finished sign-in.
     * @param {object} tokens - The tokens.
     * @returns {Promise<object>} The tokens.
     */
    adopt,

    /**
     * @description Forget the tokens (disconnect, dead refresh token).
     * @returns {Promise<void>}
     */
    async clear() {
      current = empty();
      await saveTokens(current);
    },

    /**
     * @description Whether the tokens should be refreshed now.
     * @returns {boolean} True near the expiry.
     */
    dueForRefresh() {
      return current.expiresAt - EXPIRY_MARGIN_MS <= now();
    },

    /**
     * @description When the next proactive refresh is due, in ms from now.
     * @returns {number} The delay (at least a minute).
     */
    refreshDelay() {
      return Math.max(60000, current.expiresAt - EXPIRY_MARGIN_MS - now());
    },

    /**
     * @description Refresh the tokens (the stream needs a fresh ID token).
     * @returns {Promise<object>} The tokens.
     * @throws {AuthError} With `reauth` when a new sign-in is needed.
     */
    refresh,

    /**
     * @description A valid access token, refreshed when needed.
     * @param {object} [options] - `{ rejected }`: a token an API call refused.
     * @returns {Promise<string>} The access token.
     */
    async getAccessToken({ rejected = null } = {}) {
      const stale = rejected !== null && rejected === current.accessToken;
      if (!stale && current.accessToken && current.expiresAt - 60000 > now()) {
        return current.accessToken;
      }
      const tokens = await refresh();
      return tokens.accessToken;
    },
  };
}

export {
  DEVICE_CODE_URL,
  TOKEN_URL,
  SCOPES,
  AuthError,
  createVerifier,
  challengeOf,
  jwtClaims,
  readTokens,
  requestDeviceCode,
  waitForApproval,
  createTokenManager,
};
