import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCOPES,
  challengeOf,
  readTokens,
  requestDeviceCode,
  waitForApproval,
  createTokenManager,
} from '../src/auth.js';
import { fakeBmw, CLIENT_ID, GCID, NOW } from './helpers/fixtures.js';

const clock = () => {
  const c = { now: NOW };
  c.sleep = async (ms) => {
    c.now += ms;
  };
  return c;
};

test('PKCE S256 challenge (RFC 7636 example)', () => {
  assert.equal(
    challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});

test('device code: client ID, scopes and PKCE as BMW documents them', async () => {
  const fetchImpl = fakeBmw();
  const code = await requestDeviceCode({ clientId: CLIENT_ID, fetchImpl });
  const [call] = fetchImpl.calls;
  assert.equal(call.pathname, '/gcdm/oauth/device/code');
  assert.equal(call.form.client_id, CLIENT_ID);
  assert.equal(call.form.response_type, 'device_code');
  assert.equal(call.form.scope, SCOPES);
  assert.equal(call.form.code_challenge_method, 'S256');
  assert.equal(call.form.code_challenge, challengeOf(code.verifier));
  assert.equal(code.userCode, 'ABCD-EFGH');
  assert.match(code.verificationUrl, /^https:\/\/customer\.bmwgroup\.com\/.*user_code=ABCD-EFGH/);
  await assert.rejects(requestDeviceCode({ clientId: 'wrong', fetchImpl }), /invalid_client/);
});

test('approval: waits while pending, then reads the three tokens and the GCID', async () => {
  const fetchImpl = fakeBmw({ pending: 2 });
  const c = clock();
  const code = await requestDeviceCode({ clientId: CLIENT_ID, fetchImpl });
  const tokens = await waitForApproval({
    clientId: CLIENT_ID,
    code,
    fetchImpl,
    sleep: c.sleep,
    now: () => c.now,
  });
  assert.equal(tokens.accessToken, 'access-0');
  assert.equal(tokens.idToken, 'id-0');
  assert.equal(tokens.refreshToken, 'refresh-0');
  assert.equal(tokens.gcid, GCID);
  assert.equal(tokens.expiresAt, c.now + 3600000);
  assert.equal(tokens.refreshExpiresAt, c.now + 14 * 86400000);
  const polls = fetchImpl.calls.filter((call) => call.pathname === '/gcdm/oauth/token');
  assert.equal(polls.length, 3);
  assert.equal(polls[0].form.code_verifier, code.verifier);
  assert.equal(polls[0].form.device_code, 'device-xyz');
});

test('approval: a refusal, an expiry and a cancellation end the wait', async () => {
  const c = clock();
  let fetchImpl = fakeBmw({ deny: true });
  let code = await requestDeviceCode({ clientId: CLIENT_ID, fetchImpl });
  await assert.rejects(
    waitForApproval({ clientId: CLIENT_ID, code, fetchImpl, sleep: c.sleep, now: () => c.now }),
    (err) => err.code === 'access_denied',
  );
  fetchImpl = fakeBmw({ pending: 1000 });
  code = await requestDeviceCode({ clientId: CLIENT_ID, fetchImpl });
  await assert.rejects(
    waitForApproval({ clientId: CLIENT_ID, code, fetchImpl, sleep: c.sleep, now: () => c.now }),
    (err) => err.code === 'expired_token',
  );
  assert.equal(
    await waitForApproval({
      clientId: CLIENT_ID,
      code,
      fetchImpl,
      sleep: c.sleep,
      now: () => c.now,
      cancelled: () => true,
    }),
    null,
  );
});

test('refresh: one at a time, new tokens stored before use, a dead grant asks a new sign-in', async () => {
  const fetchImpl = fakeBmw();
  const saved = [];
  const manager = createTokenManager({
    getClientId: () => CLIENT_ID,
    saveTokens: async (tokens) => saved.push(tokens),
    fetchImpl,
    now: () => NOW,
  });
  manager.setTokens(
    readTokens(
      {
        access_token: 'old',
        refresh_token: 'refresh-0',
        id_token: 'id-0',
        gcid: GCID,
        expires_in: 1,
      },
      NOW - 10000,
    ),
  );
  assert.ok(manager.dueForRefresh());
  const [a, b] = await Promise.all([manager.getAccessToken(), manager.getAccessToken()]);
  assert.equal(a, 'access-1');
  assert.equal(b, 'access-1');
  assert.equal(fetchImpl.state.refreshCount, 1);
  assert.equal(saved.at(-1).refreshToken, 'refresh-1');
  assert.equal(saved.at(-1).idToken, 'id-1');
  const refresh = fetchImpl.calls.find((call) => call.form.grant_type === 'refresh_token');
  assert.deepEqual(refresh.form, {
    grant_type: 'refresh_token',
    refresh_token: 'refresh-0',
    client_id: CLIENT_ID,
  });
  // A token an API call refused is renewed even before its expiry.
  assert.equal(await manager.getAccessToken({ rejected: 'access-1' }), 'access-2');
  fetchImpl.state.refreshStatus = 400;
  await assert.rejects(manager.refresh(), (err) => err.reauth === true);
});
