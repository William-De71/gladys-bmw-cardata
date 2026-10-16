// -----------------------------------------------------------------------------
// Entry point of the BMW CarData external integration.
//
// Brings the BMW and MINI cars of a BMW account into Gladys through BMW
// CarData, BMW's official read-only access to the data of the car (Europe):
//   - devices: one per car (battery, ranges, fuel, charge, mileage, lock,
//     doors, windows, tyres, driving, distance from home), see src/device.js;
//   - scene triggers: locked/unlocked, left open, charge, cable, driving,
//     arrived/left home, sign-in to renew (src/events.js);
//   - scene action: read the status of a car;
//   - dashboard widgets: the car, the CarData account (src/widgets.js).
//
// Sign-in: the BMW device code flow (src/auth.js). Data: the MQTT stream
// (src/stream.js) and the REST API, 50 calls a day (src/cardata-api.js).
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the BMW CarData integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
