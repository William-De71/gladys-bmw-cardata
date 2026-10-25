# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.3.0] - 2026-10-25

### Added

- require Gladys 5.3 and declare catalog keywords ([807ba79](https://github.com/William-De71/gladys-bmw-cardata/commit/807ba7947d4bf894c2654572513c0c3eec5cf80b))

## [0.2.0] - 2026-10-25

### Added

- list the integration under the new Vehicles shelf of the catalog ([c754e4e](https://github.com/William-De71/gladys-bmw-cardata/commit/c754e4ed29ebc9d804fca30a1cdd54e62f71aa50))

## [0.1.1] - 2026-10-24

### Security

- **security:** build the image on Node.js 24.22.1 or later ([2953c2b](https://github.com/William-De71/gladys-bmw-cardata/commit/2953c2bee1ec978e56d155c3eacea060796d2e5b))

## [0.1.0] - 2026-10-16

### Added

- A device per BMW or MINI car of the account (BMW CarData, Europe): battery, electric and total range, fuel level and amount, charging cable, charging and charging status, charging power, charge target, charging time left, mileage, lock, doors, trunk, hood, windows, sunroof, driving, pre-conditioning, the four tyre pressures and the distance from home.
- Sign-in with the BMW device code flow: the client ID generated in the CarData portal, a Connect button, the code to approve shown in the connection status, tokens renewed before they expire.
- Real-time data from the CarData MQTT stream (TLS 1.3, one connection per account, reconnection with backoff and after each token renewal), completed by the REST API within its 50 calls a day: the integration counts its calls, keeps a reserve for manual requests and stores the cars in /data so that a restart costs nothing.
- Scene triggers: locked or unlocked, locked but left open, charging status changed, cable plugged or unplugged, started or stopped driving, arrived or left home, sign-in to renew.
- Scene action: read the status of a car (battery, range, charge, lock, openings, home, mileage), optionally after an API reading.
- Dashboard widgets: the car (picture, battery or fuel, range, lock, openings, charge, tyres, map and "Read now" buttons) and the CarData account (API calls of the day, stream, sign-in).
- Configuration actions: test the connection, read the cars now, diagnostic (an anonymized summary in the logs), disconnect.
- Cloud transport, with a degraded badge on the cars while the stream is down.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.

[0.3.0]: https://github.com/William-De71/gladys-bmw-cardata/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/William-De71/gladys-bmw-cardata/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/William-De71/gladys-bmw-cardata/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/William-De71/gladys-bmw-cardata/releases/tag/v0.1.0
