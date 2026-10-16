# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for BMW and MINI cars through
**BMW CarData** (Europe): a Node.js service (Node 22+, ESM, no build step) in
its own sandboxed Docker container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to BMW through the official CarData endpoints. Dependencies: the SDK and
`mqtt`. Transport: cloud only. **Read-only**: CarData accepts no command.

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); sign-in, start,
                        REST schedule, publishing, actions, widgets, diagnostic
src/auth.js             device code flow + PKCE, single-flight token refresh
src/cardata-api.js      REST client (x-version v1), quota guard, container
src/stream.js           MQTT stream (TLS 1.3, GCID, ID token, backoff, contention)
src/store.js            /data/cardata.json: cars, descriptor values, quota, container, pictures
src/vehicle.js          descriptors -> snapshot (timestamp-guarded merge, units, home)
src/device.js           one device per VIN, its features and states
src/events.js           scene triggers on transitions
src/widgets.js          `vehicle` and `account` widgets
src/config.js / i18n.js configuration, runtime texts (en / fr / de / es)
test/fixtures/catalogue-descriptors.json   BMW descriptor names (container check)
```

## BMW CarData facts (from the official guide 1.6 and real use)

- Device code flow on `customer.bmwgroup.com/gcdm/oauth/*`, scopes
  `authenticate_user openid cardata:api:read cardata:streaming:read`. Access
  and ID tokens live 1 h, the refresh token 2 weeks (renewed at each refresh).
- REST `https://api-cardata.bmwgroup.com`, header `x-version: v1`: **50 calls
  a day per account**, reset at 00:00 UTC; CU-429 when exceeded. Only for cars
  the user is PRIMARY user of. Max 10 containers per user.
- Stream: `mqtts://customer.streaming-cardata.bmwgroup.com:9000`, user and
  client id = GCID, password = ID token, topic `<gcid>/+`, **TLS 1.3**, QoS 0,
  **one connection per account**, closed when the ID token expires, rate
  limited per IP for rapid reconnects. Only the descriptors ticked in the
  portal's data selection are streamed (portal-only, no API).
- Latitude and longitude arrive in separate messages; REST values are
  strings and may be older than the stream; `vehicle.cabin.door.lock.status`
  is REST-only (`vehicle.cabin.door.status` is streamed); the catalogue's
  value range of `charging.status` is wrong (real values: NOCHARGING,
  CHARGINGACTIVE…).

## Rules

- **External ids are forever**: `gladys.externalIds('vehicle', vin)`, feature
  keys, config, action, widget, scene trigger and action keys.
  `test/structure.test.js` compares them to `test/fixtures/discovery.baseline.json`
  (0.1.0): never update the baseline without a documented migration.
- **Quota first**: never add an automatic REST call without counting it
  (`cardata-api.js` does) and without asking whether the stream gives it.
  Automatic calls keep a reserve of 5 for the user's requests.
- **One stream connection**: never open a second MQTT client; reconnect with
  backoff only.
- **States**: `publishChangedStates` with a one-hour heartbeat, only for the
  created features; everything again in `onDeviceCreated`, then a widget
  refresh. `should_poll` stays false.
- **Scene events** on transitions between known values only; the first update
  of a car after a start is a baseline.
- **Secrets**: never log a token, the client ID nor a full VIN (`redactVin`).
  Gladys passes no DEBUG variable to the container: the **Diagnostic** action
  writes the anonymized summary to the logs instead.
- **The container rootfs is read-only**: write only under `/data`
  (`CARDATA_DATA_DIR`).
- **Four languages** everywhere (manifest, `src/i18n.js`, docs, README);
  `test/i18n.test.js` checks it.
- **Widget images**: after any change to a widget content, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
- **Changelog**: Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style**: Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
