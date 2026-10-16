// Prueba HubSpot -> AddControl
// HubSpot manda un webhook cuando se crea un contacto.
// Cada contacto nuevo en HubSpot se crea como asesor en AddControl (POST /Asesores).

const crypto = require('crypto');
const express = require('express');

const {
  PORT = 3000,
  HUBSPOT_TOKEN,            // token de la app privada
  HUBSPOT_CLIENT_SECRET,    // secreto de cliente de la app privada (valida la firma)
  ADDCONTROL_BASE_URL,      // https://DOMINIO (sin / al final)
  ADDCONTROL_PROPIETARIO,
  ADDCONTROL_PASSWORD,
  ADDCONTROL_ID_EMPRESA = '221',
  ADDCONTROL_GRUPO_INTERNO = '63',
  ADDCONTROL_GRUPO_EXTERNO = '64',
  ADDCONTROL_ID_USUARIO = '292', // usuario de prueba al que se ligan los asesores
  ADDCONTROL_GRUPO_DEFAULT = 'interno', // 'interno' o 'externo'
  DRY_RUN = 'false'              // 'true' = no llama a POST /Asesores, solo muestra el cuerpo
} = process.env;

for (const [k, v] of Object.entries({ HUBSPOT_TOKEN, HUBSPOT_CLIENT_SECRET, ADDCONTROL_BASE_URL, ADDCONTROL_PROPIETARIO, ADDCONTROL_PASSWORD })) {
  if (!v) { console.error(`Falta la variable de entorno ${k}`); process.exit(1); }
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- AddControl ----------

let tokenCache = { value: null, at: 0 };
const TOKEN_TTL_MS = 20 * 60 * 1000; // se renueva cada 20 min o al recibir 401

async function addcontrolToken(force = false) {
  if (!force && tokenCache.value && Date.now() - tokenCache.at < TOKEN_TTL_MS) return tokenCache.value;
  const res = await fetch(`${ADDCONTROL_BASE_URL}/Auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propietario: Number(ADDCONTROL_PROPIETARIO), password: ADDCONTROL_PASSWORD })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Auth ${res.status}: ${text}`);
  let token = null;
  try {
    const b = JSON.parse(text);
    token = typeof b === 'string' ? b : (b.token || b.Token || b.access_token || b.accessToken || (b.data && b.data.token));
  } catch { token = text.trim(); }
  if (!token) throw new Error(`Auth sin token reconocible: ${text.slice(0, 200)}`);
  tokenCache = { value: token, at: Date.now() };
  log('AddControl: token renovado');
  return token;
}

async function addcontrol(method, path, body, retry = true) {
  const token = await addcontrolToken();
  const res = await fetch(`${ADDCONTROL_BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 && retry) { await addcontrolToken(true); return addcontrol(method, path, body, false); }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${text.slice(0, 500)}`);
  return data;
}

// ---------- HubSpot ----------

async function getContact(id) {
  const props = 'firstname,lastname,email';
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${id}?properties=${props}`, {
    headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` }
  });
  if (!res.ok) throw new Error(`HubSpot contacto ${id} ${res.status}: ${await res.text()}`);
  return (await res.json()).properties;
}

// Firma v3: base64(HMAC-SHA256(secret, method + uri + body + timestamp))
function firmaValida(req) {
  const firma = req.get('X-HubSpot-Signature-v3');
  const ts = req.get('X-HubSpot-Request-Timestamp');
  if (!firma || !ts) return false;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) return false;
  const uri = `https://${req.get('host')}${req.originalUrl}`;
  const base = `${req.method}${uri}${req.rawBody}${ts}`;
  const esperada = crypto.createHmac('sha256', HUBSPOT_CLIENT_SECRET).update(base).digest('base64');
  const a = Buffer.from(firma), b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- Flujo: contacto -> asesor ----------

const enProceso = new Set();   // evita doble alta cuando llegan "creado" y "cargo cambiado" juntos
const procesados = new Map();  // contactoId -> idAsesor (solo en memoria para la prueba)

async function procesarContacto(contactId) {
  if (enProceso.has(contactId) || procesados.has(contactId)) {
    log(`Contacto ${contactId}: ya procesado o en proceso, se omite`);
    return;
  }
  enProceso.add(contactId);
  try {
    const c = await getContact(contactId);
    const externo = ADDCONTROL_GRUPO_DEFAULT === 'externo';
    const nombre = [c.firstname, c.lastname].filter(Boolean).join(' ') || c.email;
    const body = {
      idEmpresa: Number(ADDCONTROL_ID_EMPRESA),
      idGrupoAsesoresVenta: Number(externo ? ADDCONTROL_GRUPO_EXTERNO : ADDCONTROL_GRUPO_INTERNO),
      idUsuario: Number(ADDCONTROL_ID_USUARIO),
      asesoresVentas: 'Asesor de venta',
      nombreCompleto: nombre,
      nombreExterno: nombre,
      rol: 'ASESOR DE VENTAS',
      closer: false,
      orden: 0,
      activo: true
    };
    log(`Contacto ${contactId}: creando asesor ${externo ? 'EXTERNO' : 'INTERNO'}`, JSON.stringify(body));

    if (DRY_RUN === 'true') { log('DRY_RUN activo: no se envió a AddControl'); return; }

    const r = await addcontrol('POST', '/Asesores', body);
    const idAsesor = typeof r === 'number' ? r : (r && (r.id || r.Id));
    procesados.set(contactId, idAsesor || 'sin-id');
    log(`Contacto ${contactId}: OK, respuesta AddControl`, JSON.stringify(r));
  } catch (e) {
    log(`Contacto ${contactId}: ERROR`, e.message);
  } finally {
    enProceso.delete(contactId);
  }
}

// ---------- Servidor ----------

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));

app.get('/', (_req, res) => res.send('ok'));

app.post('/webhooks/hubspot', (req, res) => {
  if (!firmaValida(req)) { log('Webhook rechazado: firma inválida'); return res.sendStatus(401); }
  res.sendStatus(200); // responder rápido; HubSpot reintenta si tardamos

  const eventos = Array.isArray(req.body) ? req.body : [req.body];
  const ids = new Set();
  for (const ev of eventos) {
    log('Evento HubSpot:', ev.subscriptionType, 'contacto', ev.objectId, ev.propertyName || '', ev.propertyValue || '');
    if (ev.subscriptionType === 'contact.creation') ids.add(String(ev.objectId));
  }
  // pequeña espera para que el contacto recién creado ya tenga sus propiedades
  setTimeout(() => ids.forEach(id => procesarContacto(id)), 3000);
});

app.listen(PORT, () => log(`Escuchando en puerto ${PORT}`));
