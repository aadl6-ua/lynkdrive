// Zona horaria del "dispositivo" distinta de Madrid: los helpers de fechas deben
// presentar siempre en Europe/Madrid independientemente de la máquina.
process.env.TZ = 'America/New_York';
