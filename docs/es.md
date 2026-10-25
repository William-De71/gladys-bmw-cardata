# BMW CarData

## Presentación

Esta integración trae tus **coches BMW y MINI** a Gladys mediante **BMW CarData**, el acceso oficial de BMW a los datos de tu propio coche (Europa): batería y autonomía, combustible, carga, kilometraje, cierre, puertas, ventanillas, neumáticos, posición y distancia de casa.

- **Solo lectura**: CarData envía datos, no acepta **ningún comando**. No se puede bloquear, desbloquear, iniciar la climatización ni una carga desde Gladys (BMW no ofrece comandos remotos a particulares a través de CarData).
- **Tiempo real**: la integración escucha el **flujo** de CarData (MQTT): un cambio transmitido por el coche llega a Gladys en segundos, sin coste.
- **API REST**: completa lo que el flujo no envía (estado de cierre de las puertas, modelo del coche, datos con el flujo caído). BMW permite **50 llamadas al día para toda la cuenta**, reiniciadas a las 00:00 UTC; la integración las cuenta y reserva 5 para tus peticiones.
- **Nube**: los datos del coche vienen de los servidores de BMW a Gladys; no van a ningún otro sitio.

![Los dos widgets de la integración: el coche y la cuenta CarData (ilustración generada, no es una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-bmw-cardata/main/docs/assets/widgets.es.png)

## Requisitos previos

- Gladys **5.3.0** o posterior.
- Un coche con un contrato ConnectedDrive / MINI Connected activo, en un mercado compatible (Europa), añadido a tu cuenta MyBMW, del que **eres el usuario principal** (CarData no sirve datos a un usuario secundario).
- Un **ID de cliente de CarData**: en el portal web de MyBMW (o MINI), abre tu coche → **BMW CarData** → **Create CarData client**, y marca **ambas** suscripciones, **CarData API** y **CarData Stream**. Un ID de cliente sin suscripciones da tokens que no funcionan.
- El **flujo de datos configurado**: en la misma página, **Configure data stream**, marca los datos que quieras (batería, puertas, ventanillas, posición, neumáticos…) y guarda. BMW solo transmite lo marcado allí.
- Solo **una conexión al flujo por cuenta BMW**: si otra herramienta (Home Assistant, MQTT Explorer…) ya usa el flujo CarData de la cuenta, se desconectarán mutuamente.

## Configuración

1. Introduce el **ID de cliente de CarData** y guarda.
2. Pulsa **Conectar**: se abre una página de BMW. Inicia sesión, comprueba que el código es el mostrado en el estado de conexión de la integración y apruébalo. Gladys recoge la sesión por sí solo en unos segundos.
3. Ve a **Descubrir** y añade tu coche.
4. Si quieres, añade los widgets **Coche BMW** y **BMW CarData** a un panel.

| Campo                    | Por defecto                                        | Uso                                                                                                 |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| ID de cliente de CarData | —                                                  | El ID del cliente CarData creado en el portal.                                                      |
| Cuenta BMW               | —                                                  | El botón Conectar (inicio de sesión BMW por código de dispositivo).                                 |
| Host / puerto del flujo  | `customer.streaming-cardata.bmwgroup.com` / `9000` | Tal como los muestra el portal junto a las credenciales del flujo.                                  |
| Lectura API cada (horas) | 4                                                  | Lectura REST automática de cada coche; 0 = solo a petición. 4 h = 6 llamadas al día por coche.      |
| Radio de casa (m)        | 200                                                | Alrededor de las casas de Gladys (con coordenadas): el coche está en casa dentro de esta distancia. |
| Idioma de los textos     | Automático                                         | Nombres de las funciones y resúmenes de escenas.                                                    |

La sesión sigue siendo válida mientras Gladys funcione: los tokens se renuevan cada hora. Si Gladys está apagado **más de dos semanas**, o si eliminas el cliente en el portal, vuelve a pulsar Conectar (un disparador de escena te avisa).

## Uso

### Dispositivos

Un dispositivo por coche, con el nombre de su modelo (por ejemplo «BMW iX1 xDrive30»). Una función aparece en cuanto el coche ha transmitido su valor: vuelve a buscar tras un primer trayecto o una primera carga si falta alguna. Todas las funciones son de solo lectura.

Batería, autonomía eléctrica, autonomía total, nivel y cantidad de combustible, cable de carga enchufado, cargando, estado de la carga, potencia de carga, objetivo de carga, tiempo de carga restante, kilometraje, bloqueado, puertas, maletero, capó, ventanillas, techo solar, en marcha, preclimatización, las cuatro presiones de los neumáticos (bar) y la distancia de casa.

### Widgets del panel

- **Coche BMW**: la foto que BMW ofrece del coche (obtenida una vez, 1 llamada API), batería o combustible, autonomía, cierre, aperturas, carga, posición, neumáticos, batería de 12 V, kilometraje, la antigüedad de los datos, un botón **Mapa** y un botón **Leer ahora** (1 llamada API).
- **BMW CarData**: las llamadas API del día de 50, el flujo, su último mensaje, los coches y cuánto tiempo sigue siendo válida la sesión.

### Escenas

Disparadores (cada uno puede limitarse a un coche):

- **Bloqueado o desbloqueado**, **bloqueado pero abierto** (una puerta, el maletero, el capó, una ventanilla o el techo solar);
- **Estado de carga cambiado** (cargando, en pausa, terminada, error…), **cable enchufado o desenchufado**;
- **Arranca o se detiene**, **llega o sale de casa**;
- **Sesión por renovar**.

Acción: **Leer el estado** de un coche (batería, autonomía, combustible, carga, cierre, aperturas, casa, kilometraje, un resumen), opcionalmente tras una lectura por la API.

Ejemplos:

- Cuando el coche está bloqueado pero abierto → enviarme un mensaje con `{{triggerEvent.data.openings}}`.
- Cuando la carga ha terminado → notificar «El coche está cargado: `{{triggerEvent.data.battery_level}}` %».
- Cuando el coche llega a casa de noche → encender las luces de la entrada.

### Transporte

Nube: los coches llevan la insignia de nube. Mientras el flujo está caído, la insignia muestra un punto naranja (modo degradado): los valores solo llegan entonces de la API, con varias horas de intervalo.

## Solución de problemas

- **«access_denied» al aprobar el código**: un problema conocido de BMW. Reinténtalo en una ventana privada, abre tú mismo el portal y escribe el código a mano. Si persiste, elimina el cliente CarData en el portal, crea uno nuevo con ambas suscripciones, introduce el nuevo ID de cliente y vuelve a conectar.
- **Conectado pero ningún valor cambia**: revisa la selección de datos del flujo en el portal y luego bloquea y desbloquea el coche para que transmita. Un coche dormido no envía nada.
- **«Otra app ocupa el flujo»**: detén el otro cliente CarData de la cuenta (una conexión al flujo por cuenta).
- **«Las 50 llamadas API diarias se han agotado»**: todas las herramientas de la cuenta las comparten; el flujo sigue, nuevas llamadas a las 00:00 UTC. Reduce la frecuencia de lectura API si hace falta.
- **Registros**: pulsa **Diagnóstico** en la configuración de la integración y abre Ajustes → Supervisión: allí se escribe un resumen anonimizado (flujo, sesión, cuota, datos recibidos por coche, sin token ni VIN completo). Adjúntalo a una incidencia en [GitHub](https://github.com/William-De71/gladys-bmw-cardata/issues) con tus versiones de Gladys y de la integración.
