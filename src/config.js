// -----------------------------------------------------------------------------
// Configuration of the BMW CarData integration.
//
// Fields of the config_schema:
//   - `client_id`         the CarData client ID the user generated in the
//                         CarData section of the MyBMW / MINI portal;
//   - `bmw_account`       the Connect button (account_link field: the BMW
//                         device code flow never redirects back to Gladys);
//   - `stream_host` /     the MQTT broker of the stream, shown by the portal
//     `stream_port`       next to the stream credentials;
//   - `api_refresh_hours` how often the REST API is read (0 = only on demand):
//                         BMW allows 50 calls a day for the whole account;
//   - `home_radius`       the distance from home (m) under which a car is home;
//   - `language`          language of the texts written outside a widget
//                         request (`auto` = the language of the last widget).
//
// Internal keys, outside the config_schema (never shown in the UI): the
// tokens of the device code flow, the GCID of the account (the MQTT user name)
// and the language of the last widget request.
// -----------------------------------------------------------------------------

const DEFAULT_STREAM_HOST = 'customer.streaming-cardata.bmwgroup.com';
const STREAM_PORT = { min: 1, max: 65535, default: 9000 };
// Hours. 0 = never on a timer (start, scan and manual refresh only).
const API_REFRESH_HOURS = { min: 0, max: 24, default: 4 };
// Meters.
const HOME_RADIUS = { min: 50, max: 5000, default: 200 };
const ACCOUNT_FIELD = 'bmw_account';
const LANGUAGES = ['en', 'fr', 'de', 'es'];
const AUTO_LANGUAGE = 'auto';

const INTERNAL_KEYS = {
  accessToken: 'access_token',
  idToken: 'id_token',
  refreshToken: 'refresh_token',
  expiresAt: 'token_expires_at',
  refreshExpiresAt: 'refresh_expires_at',
  gcid: 'gcid',
  language: 'last_language',
};

/**
 * @description Read a bounded integer field, falling back to its default.
 * @param {unknown} raw - The raw value (the form can send numbers as strings).
 * @param {{ min: number, max: number, default: number }} bounds - The bounds.
 * @returns {number} The value.
 * @example
 * readNumber('6', API_REFRESH_HOURS); // -> 6
 */
function readNumber(raw, bounds) {
  const value = Number(raw ?? bounds.default);
  if (raw === '' || raw === null || !Number.isFinite(value)) {
    return bounds.default;
  }
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * @description Read a trimmed string.
 * @param {unknown} raw - The raw value.
 * @returns {string} The string, '' when absent.
 * @example
 * readString(' abc '); // -> 'abc'
 */
function readString(raw) {
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * @description Read a stored instant (ms).
 * @param {unknown} raw - The raw value.
 * @returns {number} The instant, 0 when absent.
 */
function readInstant(raw) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} The config.
 * @example
 * normalizeConfig({ client_id: 'abc' }).clientId; // -> 'abc'
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const host = readString(config.stream_host).replace(/^mqtts?:\/\//, '');
  return {
    clientId: readString(config.client_id),
    streamHost: host || DEFAULT_STREAM_HOST,
    streamPort: readNumber(config.stream_port, STREAM_PORT),
    apiRefreshHours: readNumber(config.api_refresh_hours, API_REFRESH_HOURS),
    homeRadius: readNumber(config.home_radius, HOME_RADIUS),
    language: LANGUAGES.includes(config.language) ? config.language : AUTO_LANGUAGE,
    tokens: {
      accessToken: readString(config[INTERNAL_KEYS.accessToken]),
      idToken: readString(config[INTERNAL_KEYS.idToken]),
      refreshToken: readString(config[INTERNAL_KEYS.refreshToken]),
      expiresAt: readInstant(config[INTERNAL_KEYS.expiresAt]),
      refreshExpiresAt: readInstant(config[INTERNAL_KEYS.refreshExpiresAt]),
      gcid: readString(config[INTERNAL_KEYS.gcid]),
    },
  };
}

/**
 * @description Read the stored language of the last widget request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  DEFAULT_STREAM_HOST,
  STREAM_PORT,
  API_REFRESH_HOURS,
  HOME_RADIUS,
  ACCOUNT_FIELD,
  LANGUAGES,
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  readNumber,
  normalizeConfig,
  readLanguage,
};
