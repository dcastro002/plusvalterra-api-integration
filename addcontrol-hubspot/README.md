# Prueba HubSpot → AddControl (asesores)

Cuando en HubSpot se crea un contacto o cambia su **Cargo**, HubSpot manda un webhook a este servicio.
Si el Cargo contiene "Asesor", el servicio crea el asesor en AddControl con `POST /Asesores`.
"Asesor externo" va al grupo de externos; cualquier otro "Asesor ..." al de internos.

- Prueba manual: cambiar el Cargo de un contacto existente a `Asesor interno`.
- Prueba automática: crear un contacto nuevo que ya traiga Cargo `Asesor externo`.

## Desplegar en Railway

1. Sube esta carpeta a un repo de GitHub.
2. Railway → New Project → Deploy from GitHub repo. Detecta Node y corre `npm start`.
3. En **Variables** carga lo de `.env.example` con los valores reales. Empieza con `DRY_RUN=true`.
4. En **Settings → Networking → Generate Domain** obtén la URL pública.
5. En la app privada de HubSpot, pestaña Webhooks, pon como URL de destino:
   `https://TU-DOMINIO.up.railway.app/webhooks/hubspot`
6. Cambia el Cargo de un contacto y revisa **Deployments → Logs** en Railway.
7. Si el cuerpo que se imprime se ve bien, cambia `DRY_RUN=false` y repite.

## Qué verás en los logs

```
Evento HubSpot: contact.propertyChange contacto 123 jobtitle Asesor interno
Contacto 123: creando asesor INTERNO {...}
AddControl: token renovado
Contacto 123: OK, respuesta AddControl {...}
```

## Limitaciones de la prueba

- El cuerpo de `POST /Asesores` se armó con la respuesta de `GET Asesores`; validar contra `/Help/Api/POST-Asesores`.
- Todos los asesores se ligan al usuario de prueba `ADDCONTROL_ID_USUARIO`.
- El control de duplicados es en memoria: si el servicio se reinicia y el Cargo vuelve a cambiar, se crearía otro asesor. En la versión real se guarda el ID de AddControl en HubSpot y en Supabase.
- `Webhook rechazado: firma inválida` → revisar `HUBSPOT_CLIENT_SECRET`.
