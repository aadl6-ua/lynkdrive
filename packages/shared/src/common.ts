/**
 * Fecha/hora en formato ISO 8601 (UTC) tal y como viaja en el JSON de la API.
 *
 * Los contratos de respuesta son genéricos en el tipo de fecha: la API los
 * implementa con `Date` (antes de serializar) y los clientes los consumen con
 * el valor por defecto `IsoDateString`.
 */
export type IsoDateString = string;
