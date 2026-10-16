# BMW CarData

## Présentation

Cette intégration amène vos **voitures BMW et MINI** dans Gladys grâce à **BMW CarData**, l’accès officiel de BMW aux données de votre propre voiture (Europe) : batterie et autonomie, carburant, charge, kilométrage, verrouillage, portes, vitres, pneus, position et distance du domicile.

- **Lecture seule** : CarData envoie des données, il n’accepte **aucune commande**. Impossible de verrouiller, déverrouiller, lancer la climatisation ou une charge depuis Gladys (BMW n’ouvre aucune commande à distance aux particuliers via CarData).
- **Temps réel** : l’intégration écoute le **flux** CarData (MQTT) : un changement transmis par la voiture arrive dans Gladys en quelques secondes, sans rien coûter.
- **API REST** : elle complète ce que le flux n’envoie pas (état de verrouillage des portes, modèle de la voiture, données quand le flux est coupé). BMW autorise **50 appels par jour pour tout le compte**, remis à zéro à 00:00 UTC ; l’intégration les compte et en garde 5 pour vos demandes.
- **Cloud** : les données de la voiture viennent des serveurs de BMW vers Gladys ; elles ne partent nulle part ailleurs.

![Les deux widgets de l’intégration : la voiture et le compte CarData (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-bmw-cardata/main/docs/assets/widgets.fr.png)

## Prérequis

- Gladys **5.1.1** ou plus récent.
- Une voiture avec un contrat ConnectedDrive / MINI Connected actif, dans un marché pris en charge (Europe), ajoutée à votre compte MyBMW, dont **vous êtes l’utilisateur principal** (CarData ne sert aucune donnée à un utilisateur secondaire).
- Un **identifiant client CarData** : dans le portail web MyBMW (ou MINI), ouvrez votre voiture → **BMW CarData** → **Create CarData client**, puis cochez **les deux** abonnements, **CarData API** et **CarData Stream**. Un identifiant sans abonnement donne des jetons qui ne fonctionnent pas.
- Le **flux de données configuré** : sur la même page, **Configure data stream**, cochez les données voulues (batterie, portes, vitres, position, pneus…) et enregistrez. BMW ne diffuse que ce qui y est coché.
- Une seule **connexion au flux par compte BMW** : si un autre outil (Home Assistant, MQTT Explorer…) utilise déjà le flux CarData du compte, ils se déconnecteront l’un l’autre.

## Configuration

1. Saisissez l’**identifiant client CarData** et enregistrez.
2. Cliquez sur **Connecter** : une page BMW s’ouvre. Connectez-vous, vérifiez que le code est celui affiché dans l’état de connexion de l’intégration, et validez-le. Gladys récupère la connexion tout seul en quelques secondes.
3. Allez dans **Découverte**, ajoutez votre voiture.
4. Si vous le souhaitez, ajoutez les widgets **Voiture BMW** et **BMW CarData** à un tableau de bord.

| Champ                           | Par défaut                                         | Rôle                                                                                                             |
| ------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Identifiant client CarData      | —                                                  | L’identifiant du client CarData créé dans le portail.                                                            |
| Compte BMW                      | —                                                  | Le bouton Connecter (connexion BMW par code d’appareil).                                                         |
| Hôte / port du flux             | `customer.streaming-cardata.bmwgroup.com` / `9000` | Tels qu’affichés par le portail à côté des identifiants du flux.                                                 |
| Lecture API toutes les (heures) | 4                                                  | Lecture REST automatique de chaque voiture ; 0 = seulement à la demande. 4 h = 6 appels par jour et par voiture. |
| Rayon du domicile (m)           | 200                                                | Autour des maisons de Gladys (avec coordonnées) : la voiture est au domicile en deçà.                            |
| Langue des textes               | Automatique                                        | Noms des fonctionnalités et résumés des scènes.                                                                  |

La connexion reste valable tant que Gladys tourne : les jetons sont renouvelés toutes les heures. Si Gladys reste éteint **plus de deux semaines**, ou si vous supprimez le client dans le portail, cliquez à nouveau sur Connecter (un déclencheur de scène vous prévient).

## Utilisation

### Appareils

Un appareil par voiture, nommé d’après son modèle (par exemple « BMW iX1 xDrive30 »). Une fonctionnalité apparaît dès que la voiture a transmis sa valeur : relancez une recherche après un premier trajet ou une première charge s’il en manque une. Toutes les fonctionnalités sont en lecture seule.

Batterie, autonomie électrique, autonomie totale, niveau et quantité de carburant, câble de charge branché, en charge, état de la charge, puissance de charge, objectif de charge, temps de charge restant, kilométrage, verrouillée, portes, coffre, capot, vitres, toit ouvrant, en mouvement, préclimatisation, les quatre pressions des pneus (bar) et la distance du domicile.

### Widgets du tableau de bord

- **Voiture BMW** : la photo que BMW fournit pour la voiture (récupérée une fois, 1 appel API), batterie ou carburant, autonomie, verrouillage, ouvrants, charge, position, pneus, batterie 12 V, kilométrage, l’âge des données, un bouton **Carte** et un bouton **Lire maintenant** (1 appel API).
- **BMW CarData** : les appels API du jour sur 50, le flux, son dernier message, les voitures et la durée de validité restante de la connexion.

### Scènes

Déclencheurs (chacun peut être limité à une voiture) :

- **Verrouillée ou déverrouillée**, **verrouillée mais ouverte** (une porte, le coffre, le capot, une vitre ou le toit ouvrant) ;
- **État de charge modifié** (en charge, en pause, terminée, erreur…), **câble branché ou débranché** ;
- **Départ ou arrêt**, **arrivée ou départ du domicile** ;
- **Connexion à renouveler**.

Action : **Lire l’état** d’une voiture (batterie, autonomie, carburant, charge, verrouillage, ouvrants, domicile, kilométrage, un résumé), éventuellement après une lecture par l’API.

Exemples :

- Quand la voiture est verrouillée mais ouverte → m’envoyer un message avec `{{triggerEvent.data.openings}}`.
- Quand la charge est terminée → notifier « La voiture est chargée : `{{triggerEvent.data.battery_level}}` % ».
- Quand la voiture arrive au domicile à la nuit tombée → allumer l’éclairage de l’allée.

### Transport

Cloud : les voitures portent le badge cloud. Tant que le flux est coupé, le badge affiche un point orange (mode dégradé) : les valeurs ne viennent alors que de l’API, à plusieurs heures d’intervalle.

## Dépannage

- **« access_denied » à la validation du code** : un problème connu côté BMW. Réessayez dans une fenêtre de navigation privée, ouvrez le portail vous-même et tapez le code à la main. Si cela persiste, supprimez le client CarData dans le portail, créez-en un nouveau avec les deux abonnements, saisissez le nouvel identifiant et reconnectez-vous.
- **Connecté mais aucune valeur ne bouge** : vérifiez la sélection des données du flux dans le portail, puis verrouillez et déverrouillez la voiture pour qu’elle transmette. Une voiture endormie n’envoie rien.
- **« Une autre application prend le flux »** : arrêtez l’autre client CarData du compte (une seule connexion au flux par compte).
- **« Les 50 appels API du jour sont épuisés »** : tous les outils du compte les partagent ; le flux continue, nouveaux appels à 00:00 UTC. Réduisez la fréquence de lecture API si besoin.
- **Journaux** : cliquez sur **Diagnostic** dans la configuration de l’intégration, puis ouvrez Paramètres → Supervision : un résumé anonymisé (flux, connexion, quota, données reçues par voiture, sans jeton ni VIN complet) y est écrit. Joignez-le à un ticket sur [GitHub](https://github.com/William-De71/gladys-bmw-cardata/issues) avec vos versions de Gladys et de l’intégration.
