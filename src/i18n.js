// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback), the four languages of the Gladys interface.
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: feature names, text states, widget contents, scene summaries,
// messages of the Configuration screen.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // features
  featureBatteryLevel: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  featureElectricRange: {
    en: 'Electric range',
    fr: 'Autonomie électrique',
    de: 'Elektrische Reichweite',
    es: 'Autonomía eléctrica',
  },
  featureTotalRange: {
    en: 'Total range',
    fr: 'Autonomie totale',
    de: 'Gesamtreichweite',
    es: 'Autonomía total',
  },
  featureFuelLevel: {
    en: 'Fuel level',
    fr: 'Niveau de carburant',
    de: 'Tankfüllstand',
    es: 'Nivel de combustible',
  },
  featureFuelAmount: {
    en: 'Fuel in the tank',
    fr: 'Carburant dans le réservoir',
    de: 'Kraftstoff im Tank',
    es: 'Combustible en el depósito',
  },
  featurePlugged: {
    en: 'Charging cable plugged in',
    fr: 'Câble de charge branché',
    de: 'Ladekabel angeschlossen',
    es: 'Cable de carga enchufado',
  },
  featureCharging: { en: 'Charging', fr: 'En charge', de: 'Lädt', es: 'Cargando' },
  featureChargingStatus: {
    en: 'Charging status',
    fr: 'État de la charge',
    de: 'Ladestatus',
    es: 'Estado de la carga',
  },
  featureChargePower: {
    en: 'Charging power',
    fr: 'Puissance de charge',
    de: 'Ladeleistung',
    es: 'Potencia de carga',
  },
  featureChargeTarget: {
    en: 'Charge target',
    fr: 'Objectif de charge',
    de: 'Ladeziel',
    es: 'Objetivo de carga',
  },
  featureChargeTime: {
    en: 'Charging time left',
    fr: 'Temps de charge restant',
    de: 'Verbleibende Ladezeit',
    es: 'Tiempo de carga restante',
  },
  featureOdometer: { en: 'Mileage', fr: 'Kilométrage', de: 'Kilometerstand', es: 'Kilometraje' },
  featureLock: { en: 'Locked', fr: 'Verrouillée', de: 'Verriegelt', es: 'Bloqueado' },
  featureDoors: { en: 'Doors', fr: 'Portes', de: 'Türen', es: 'Puertas' },
  featureTrunk: { en: 'Trunk', fr: 'Coffre', de: 'Kofferraum', es: 'Maletero' },
  featureHood: { en: 'Hood', fr: 'Capot', de: 'Motorhaube', es: 'Capó' },
  featureWindows: { en: 'Windows', fr: 'Vitres', de: 'Fenster', es: 'Ventanillas' },
  featureSunroof: { en: 'Sunroof', fr: 'Toit ouvrant', de: 'Schiebedach', es: 'Techo solar' },
  featureMoving: { en: 'Driving', fr: 'En mouvement', de: 'In Fahrt', es: 'En marcha' },
  featureClimate: {
    en: 'Pre-conditioning',
    fr: 'Préclimatisation',
    de: 'Vorklimatisierung',
    es: 'Preclimatización',
  },
  featureTireFrontLeft: {
    en: 'Tyre front left',
    fr: 'Pneu avant gauche',
    de: 'Reifen vorne links',
    es: 'Neumático delantero izquierdo',
  },
  featureTireFrontRight: {
    en: 'Tyre front right',
    fr: 'Pneu avant droit',
    de: 'Reifen vorne rechts',
    es: 'Neumático delantero derecho',
  },
  featureTireRearLeft: {
    en: 'Tyre rear left',
    fr: 'Pneu arrière gauche',
    de: 'Reifen hinten links',
    es: 'Neumático trasero izquierdo',
  },
  featureTireRearRight: {
    en: 'Tyre rear right',
    fr: 'Pneu arrière droit',
    de: 'Reifen hinten rechts',
    es: 'Neumático trasero derecho',
  },
  featureDistanceHome: {
    en: 'Distance from home',
    fr: 'Distance du domicile',
    de: 'Entfernung von zu Hause',
    es: 'Distancia de casa',
  },

  // charging statuses
  charge_charging: { en: 'Charging', fr: 'En charge', de: 'Lädt', es: 'Cargando' },
  charge_starting: {
    en: 'Starting',
    fr: 'Démarrage',
    de: 'Wird gestartet',
    es: 'Iniciando',
  },
  charge_waiting: {
    en: 'Waiting to charge',
    fr: 'En attente de charge',
    de: 'Wartet auf Laden',
    es: 'Esperando la carga',
  },
  charge_paused: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  charge_finished: { en: 'Finished', fr: 'Terminée', de: 'Beendet', es: 'Terminada' },
  charge_interrupted: {
    en: 'Interrupted',
    fr: 'Interrompue',
    de: 'Unterbrochen',
    es: 'Interrumpida',
  },
  charge_error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  charge_not_charging: {
    en: 'Not charging',
    fr: 'Pas en charge',
    de: 'Lädt nicht',
    es: 'Sin cargar',
  },

  // openings
  opening_doors: { en: 'doors', fr: 'portes', de: 'Türen', es: 'puertas' },
  opening_trunk: { en: 'trunk', fr: 'coffre', de: 'Kofferraum', es: 'maletero' },
  opening_hood: { en: 'hood', fr: 'capot', de: 'Motorhaube', es: 'capó' },
  opening_windows: { en: 'windows', fr: 'vitres', de: 'Fenster', es: 'ventanillas' },
  opening_sunroof: { en: 'sunroof', fr: 'toit ouvrant', de: 'Schiebedach', es: 'techo solar' },

  // lock
  locked: { en: 'Locked', fr: 'Verrouillée', de: 'Verriegelt', es: 'Bloqueado' },
  partly_locked: {
    en: 'Partly locked',
    fr: 'Partiellement verrouillée',
    de: 'Teilweise verriegelt',
    es: 'Bloqueo parcial',
  },
  unlocked: { en: 'Unlocked', fr: 'Déverrouillée', de: 'Entriegelt', es: 'Desbloqueado' },

  // scene summaries
  summaryLocked: {
    en: '{car} locked',
    fr: '{car} verrouillée',
    de: '{car} verriegelt',
    es: '{car} bloqueado',
  },
  summaryUnlocked: {
    en: '{car} unlocked',
    fr: '{car} déverrouillée',
    de: '{car} entriegelt',
    es: '{car} desbloqueado',
  },
  summaryLeftOpen: {
    en: '{car} locked but open: {list}',
    fr: '{car} verrouillée mais ouverte : {list}',
    de: '{car} verriegelt, aber offen: {list}',
    es: '{car} bloqueado pero abierto: {list}',
  },
  summaryCharging: {
    en: '{car}: {status} ({level} %)',
    fr: '{car} : {status} ({level} %)',
    de: '{car}: {status} ({level} %)',
    es: '{car}: {status} ({level} %)',
  },
  summaryPlugged: {
    en: '{car}: charging cable plugged in',
    fr: '{car} : câble de charge branché',
    de: '{car}: Ladekabel angeschlossen',
    es: '{car}: cable de carga enchufado',
  },
  summaryUnplugged: {
    en: '{car}: charging cable unplugged',
    fr: '{car} : câble de charge débranché',
    de: '{car}: Ladekabel abgezogen',
    es: '{car}: cable de carga desenchufado',
  },
  summaryStarted: {
    en: '{car} is driving',
    fr: '{car} roule',
    de: '{car} fährt',
    es: '{car} está en marcha',
  },
  summaryStopped: {
    en: '{car} has stopped',
    fr: '{car} s’est arrêtée',
    de: '{car} hat angehalten',
    es: '{car} se ha detenido',
  },
  summaryArrived: {
    en: '{car} arrived home',
    fr: '{car} est arrivée au domicile',
    de: '{car} ist zu Hause angekommen',
    es: '{car} ha llegado a casa',
  },
  summaryLeft: {
    en: '{car} left home',
    fr: '{car} a quitté le domicile',
    de: '{car} hat das Zuhause verlassen',
    es: '{car} ha salido de casa',
  },
  summaryReauth: {
    en: 'BMW CarData: the sign-in expired, click Connect again in the integration',
    fr: 'BMW CarData : la connexion a expiré, cliquez à nouveau sur Connecter dans l’intégration',
    de: 'BMW CarData: Die Anmeldung ist abgelaufen, klicke in der Integration erneut auf Verbinden',
    es: 'BMW CarData: la sesión ha caducado, vuelve a pulsar Conectar en la integración',
  },

  // widgets
  battery: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  fuel: { en: 'Fuel', fr: 'Carburant', de: 'Kraftstoff', es: 'Combustible' },
  range: { en: 'Range', fr: 'Autonomie', de: 'Reichweite', es: 'Autonomía' },
  lockState: { en: 'Lock', fr: 'Verrouillage', de: 'Verriegelung', es: 'Cierre' },
  openings: { en: 'Openings', fr: 'Ouvrants', de: 'Öffnungen', es: 'Aperturas' },
  allClosed: { en: 'All closed', fr: 'Tout est fermé', de: 'Alles zu', es: 'Todo cerrado' },
  open: { en: 'Open: {list}', fr: 'Ouvert : {list}', de: 'Offen: {list}', es: 'Abierto: {list}' },
  charging: { en: 'Charge', fr: 'Charge', de: 'Laden', es: 'Carga' },
  plugged: { en: 'Plugged in', fr: 'Branchée', de: 'Angeschlossen', es: 'Enchufado' },
  unplugged: { en: 'Unplugged', fr: 'Débranchée', de: 'Nicht angeschlossen', es: 'Desenchufado' },
  position: { en: 'Position', fr: 'Position', de: 'Position', es: 'Posición' },
  atHome: { en: 'At home', fr: 'Au domicile', de: 'Zu Hause', es: 'En casa' },
  awayFrom: {
    en: '{km} km from home',
    fr: 'À {km} km du domicile',
    de: '{km} km von zu Hause',
    es: 'A {km} km de casa',
  },
  driving: { en: 'Driving', fr: 'En route', de: 'Unterwegs', es: 'En marcha' },
  parked: { en: 'Parked', fr: 'Stationnée', de: 'Geparkt', es: 'Aparcado' },
  tires: { en: 'Tyres', fr: 'Pneus', de: 'Reifen', es: 'Neumáticos' },
  battery12v: { en: '12 V battery', fr: 'Batterie 12 V', de: '12-V-Batterie', es: 'Batería 12 V' },
  odometer: { en: 'Mileage', fr: 'Kilométrage', de: 'Kilometerstand', es: 'Kilometraje' },
  updated: { en: 'Updated', fr: 'Mise à jour', de: 'Aktualisiert', es: 'Actualizado' },
  stream: { en: 'Stream', fr: 'Flux', de: 'Stream', es: 'Flujo' },
  streamUp: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  streamDown: { en: 'Disconnected', fr: 'Déconnecté', de: 'Getrennt', es: 'Desconectado' },
  streamContended: {
    en: 'Used by another app',
    fr: 'Pris par une autre appli',
    de: 'Von anderer App belegt',
    es: 'Usado por otra app',
  },
  noDataYet: {
    en: 'No data from {car} yet: wait for the car to report (lock or unlock it), or click "Read now" in the integration.',
    fr: 'Pas encore de données de {car} : attendez que la voiture transmette (verrouillez-la ou déverrouillez-la), ou cliquez sur « Lire maintenant » dans l’intégration.',
    de: 'Noch keine Daten von {car}: Warte, bis das Auto sendet (ver- oder entriegeln), oder klicke in der Integration auf „Jetzt abrufen“.',
    es: 'Aún no hay datos de {car}: espera a que el coche transmita (bloquéalo o desbloquéalo) o pulsa «Leer ahora» en la integración.',
  },
  buttonMap: { en: 'Map', fr: 'Carte', de: 'Karte', es: 'Mapa' },
  buttonRefresh: { en: 'Read now', fr: 'Lire maintenant', de: 'Jetzt abrufen', es: 'Leer ahora' },
  notSignedIn: {
    en: 'Not signed in to BMW CarData: open the integration configuration.',
    fr: 'Non connecté à BMW CarData : ouvrez la configuration de l’intégration.',
    de: 'Nicht bei BMW CarData angemeldet: Öffne die Konfiguration der Integration.',
    es: 'Sin sesión en BMW CarData: abre la configuración de la integración.',
  },
  noVehicle: {
    en: 'No car on this BMW account (only cars you are the primary user of).',
    fr: 'Aucune voiture sur ce compte BMW (seules celles dont vous êtes l’utilisateur principal).',
    de: 'Kein Auto in diesem BMW-Konto (nur Autos, deren Hauptnutzer du bist).',
    es: 'Ningún coche en esta cuenta BMW (solo aquellos de los que eres usuario principal).',
  },
  lastMessage: {
    en: 'Last message',
    fr: 'Dernier message',
    de: 'Letzte Nachricht',
    es: 'Último mensaje',
  },
  never: { en: 'Never', fr: 'Jamais', de: 'Nie', es: 'Nunca' },
  apiLeft: {
    en: 'API calls left today',
    fr: 'Appels API restants',
    de: 'API-Aufrufe übrig',
    es: 'Llamadas API restantes',
  },
  cars: { en: 'Cars', fr: 'Voitures', de: 'Autos', es: 'Coches' },
  signIn: { en: 'Sign-in', fr: 'Connexion', de: 'Anmeldung', es: 'Sesión' },
  signInValid: {
    en: 'Valid {days} more days',
    fr: 'Valide encore {days} j',
    de: 'Noch {days} Tage gültig',
    es: 'Válida {days} días más',
  },
  apiCalls: { en: 'API calls', fr: 'Appels API', de: 'API-Aufrufe', es: 'Llamadas API' },
  messages: { en: 'Messages', fr: 'Messages', de: 'Nachrichten', es: 'Mensajes' },

  // relative times
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: { en: '{n} d ago', fr: 'il y a {n} j', de: 'vor {n} T.', es: 'hace {n} d' },

  // configuration screen
  statusNoClient: {
    en: 'Enter the CarData client ID and save, then click Connect.',
    fr: 'Saisissez l’identifiant client CarData et enregistrez, puis cliquez sur Connecter.',
    de: 'Gib die CarData-Client-ID ein und speichere, dann klicke auf Verbinden.',
    es: 'Introduce el ID de cliente de CarData y guarda; después pulsa Conectar.',
  },
  statusNotSignedIn: {
    en: 'Not signed in: click Connect and approve the code on the BMW page.',
    fr: 'Non connecté : cliquez sur Connecter et validez le code sur la page BMW.',
    de: 'Nicht angemeldet: Klicke auf Verbinden und bestätige den Code auf der BMW-Seite.',
    es: 'Sin sesión: pulsa Conectar y aprueba el código en la página de BMW.',
  },
  statusEnterCode: {
    en: 'On the BMW page, sign in and approve the code {code} (valid a few minutes).',
    fr: 'Sur la page BMW, connectez-vous et validez le code {code} (valable quelques minutes).',
    de: 'Melde dich auf der BMW-Seite an und bestätige den Code {code} (wenige Minuten gültig).',
    es: 'En la página de BMW, inicia sesión y aprueba el código {code} (válido unos minutos).',
  },
  statusSignIn_denied: {
    en: 'BMW refused the sign-in (access_denied). Try again in a private window; if it persists, create a new client ID in the portal.',
    fr: 'BMW a refusé la connexion (access_denied). Réessayez dans une fenêtre privée ; si cela persiste, créez un nouvel identifiant client dans le portail.',
    de: 'BMW hat die Anmeldung abgelehnt (access_denied). Versuche es in einem privaten Fenster; sonst erstelle im Portal eine neue Client-ID.',
    es: 'BMW rechazó el inicio de sesión (access_denied). Prueba en una ventana privada; si persiste, crea un nuevo ID de cliente en el portal.',
  },
  statusSignIn_expired: {
    en: 'The code was not approved in time: click Connect again.',
    fr: 'Le code n’a pas été validé à temps : cliquez à nouveau sur Connecter.',
    de: 'Der Code wurde nicht rechtzeitig bestätigt: Klicke erneut auf Verbinden.',
    es: 'El código no se aprobó a tiempo: vuelve a pulsar Conectar.',
  },
  statusSignIn_other: {
    en: 'The BMW sign-in failed: click Connect again (details in the logs).',
    fr: 'La connexion BMW a échoué : cliquez à nouveau sur Connecter (détails dans les journaux).',
    de: 'Die BMW-Anmeldung ist fehlgeschlagen: Klicke erneut auf Verbinden (Details im Log).',
    es: 'El inicio de sesión de BMW falló: vuelve a pulsar Conectar (detalles en los registros).',
  },
  signInStartFailed: {
    en: 'BMW refused to start the sign-in: check the client ID and its two subscriptions ({reason})',
    fr: 'BMW refuse de démarrer la connexion : vérifiez l’identifiant client et ses deux abonnements ({reason})',
    de: 'BMW verweigert den Start der Anmeldung: Prüfe die Client-ID und ihre zwei Abos ({reason})',
    es: 'BMW se niega a iniciar la sesión: revisa el ID de cliente y sus dos suscripciones ({reason})',
  },
  statusConnected: {
    en: 'Connected: {count} car(s), stream connected.',
    fr: 'Connecté : {count} voiture(s), flux connecté.',
    de: 'Verbunden: {count} Auto(s), Stream verbunden.',
    es: 'Conectado: {count} coche(s), flujo conectado.',
  },
  statusStreamDown: {
    en: 'Signed in, {count} car(s), but the stream is disconnected: values come from the API only.',
    fr: 'Connecté, {count} voiture(s), mais le flux est déconnecté : les valeurs viennent de l’API seulement.',
    de: 'Angemeldet, {count} Auto(s), aber der Stream ist getrennt: Werte nur über die API.',
    es: 'Sesión iniciada, {count} coche(s), pero el flujo está desconectado: valores solo desde la API.',
  },
  statusStreamContended: {
    en: 'Signed in, {count} car(s), but another app keeps taking the stream (one connection per BMW account).',
    fr: 'Connecté, {count} voiture(s), mais une autre application prend le flux (une seule connexion par compte BMW).',
    de: 'Angemeldet, {count} Auto(s), aber eine andere App belegt den Stream (eine Verbindung pro BMW-Konto).',
    es: 'Sesión iniciada, {count} coche(s), pero otra app ocupa el flujo (una conexión por cuenta BMW).',
  },
  statusReauth: {
    en: 'The BMW sign-in expired (2 weeks without renewal, or client ID changed): click Connect again.',
    fr: 'La connexion BMW a expiré (2 semaines sans renouvellement, ou identifiant client modifié) : cliquez sur Connecter.',
    de: 'Die BMW-Anmeldung ist abgelaufen (2 Wochen ohne Erneuerung oder Client-ID geändert): Klicke auf Verbinden.',
    es: 'La sesión de BMW caducó (2 semanas sin renovar, o ID de cliente cambiado): pulsa Conectar.',
  },
  statusUnreachable: {
    en: 'BMW CarData cannot be reached, new attempt in 5 minutes.',
    fr: 'BMW CarData est injoignable, nouvel essai dans 5 minutes.',
    de: 'BMW CarData ist nicht erreichbar, neuer Versuch in 5 Minuten.',
    es: 'No se puede acceder a BMW CarData, nuevo intento en 5 minutos.',
  },
  testResult: {
    en: 'Signed in. Cars: {cars}. Stream: {stream}. API calls left today: {left}/50.',
    fr: 'Connecté. Voitures : {cars}. Flux : {stream}. Appels API restants aujourd’hui : {left}/50.',
    de: 'Angemeldet. Autos: {cars}. Stream: {stream}. API-Aufrufe heute übrig: {left}/50.',
    es: 'Sesión iniciada. Coches: {cars}. Flujo: {stream}. Llamadas API restantes hoy: {left}/50.',
  },
  refreshDone: {
    en: '{count} car(s) read. API calls left today: {left}/50.',
    fr: '{count} voiture(s) lue(s). Appels API restants aujourd’hui : {left}/50.',
    de: '{count} Auto(s) gelesen. API-Aufrufe heute übrig: {left}/50.',
    es: '{count} coche(s) leído(s). Llamadas API restantes hoy: {left}/50.',
  },
  refreshFailed: {
    en: 'The reading failed',
    fr: 'La lecture a échoué',
    de: 'Das Abrufen ist fehlgeschlagen',
    es: 'La lectura ha fallado',
  },
  quotaExhausted: {
    en: 'The 50 daily API calls are used up: new ones at 00:00 UTC. The stream keeps working.',
    fr: 'Les 50 appels API du jour sont épuisés : nouveaux appels à 00:00 UTC. Le flux continue.',
    de: 'Die 50 täglichen API-Aufrufe sind verbraucht: neue um 00:00 UTC. Der Stream läuft weiter.',
    es: 'Las 50 llamadas API diarias se han agotado: nuevas a las 00:00 UTC. El flujo sigue.',
  },
  diagnosticDone: {
    en: 'Diagnostic written in the logs (Settings → Supervision), without token nor full VIN.',
    fr: 'Diagnostic écrit dans les journaux (Paramètres → Supervision), sans jeton ni VIN complet.',
    de: 'Diagnose im Log geschrieben (Einstellungen → Überwachung), ohne Token und volle FIN.',
    es: 'Diagnóstico escrito en los registros (Ajustes → Supervisión), sin token ni VIN completo.',
  },
  disconnected: {
    en: 'Disconnected from BMW CarData.',
    fr: 'Déconnecté de BMW CarData.',
    de: 'Von BMW CarData getrennt.',
    es: 'Desconectado de BMW CarData.',
  },
  transportStreamDown: {
    en: 'Stream disconnected: values from the API only, several hours apart.',
    fr: 'Flux déconnecté : valeurs de l’API seulement, à plusieurs heures d’intervalle.',
    de: 'Stream getrennt: Werte nur über die API, im Abstand mehrerer Stunden.',
    es: 'Flujo desconectado: valores solo desde la API, con varias horas de intervalo.',
  },
};

/**
 * @description The text of a key, in a language (English fallback), with
 * `{name}` placeholders substituted.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('summaryLocked', 'fr', { car: 'BMW i4' }); // -> 'BMW i4 verrouillée'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const text = entry[language] ?? entry.en;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    values[name] === undefined || values[name] === null ? match : String(values[name]),
  );
}

/**
 * @description A text built per language.
 * @param {Function} build - `(language) => string`.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 */
function each(build) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));
}

/**
 * @description The text of a key in every language.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 */
function all(key, values = {}) {
  return each((language) => t(key, language, values));
}

/**
 * @description A list of openings: "doors, trunk".
 * @param {string[]} openings - The opening names.
 * @param {string} language - The language.
 * @returns {string} The list.
 */
function openingsLabel(openings, language) {
  return openings.map((name) => t(`opening_${name}`, language)).join(', ');
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, t, all, each, openingsLabel, ago };
