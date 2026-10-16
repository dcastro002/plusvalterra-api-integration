# Prueba HubSpot → AddControl (asesores)

Cuando en HubSpot se crea un contacto, HubSpot manda un webhook (`contact.creation`) a este servicio,
que lee el contacto y lo crea como asesor en AddControl con `POST /Asesores`.
El grupo (interno o externo) se toma de `ADDCONTROL_GRUPO_DEFAULT`.

Solo se necesita la suscripción "Contactos → Creado"; la de "Propiedad cambiada → Cargo" se puede borrar.

## Desplegar en Railway

1. Sube esta carpeta a un repo de GitHub.
2. Railway → New Project → Deploy from GitHub repo. Detecta Node y corre `npm start`.
3. En **Variables** carga lo de `.env.example` con los valores reales. Empieza con `DRY_RUN=true`.
4. En **Settings → Networking → Generate Domain** obtén la URL pública.
5. En la app privada de HubSpot, pestaña Webhooks, pon como URL de destino:
   `https://TU-DOMINIO.up.railway.app/webhooks/hubspot`
6. Crea un contacto en HubSpot y revisa **Deployments → Logs** en Railway.
7. Si el cuerpo que se imprime se ve bien, cambia `DRY_RUN=false` y repite.

## Qué verás en los logs

```
Evento HubSpot: contact.creation contacto 123
Contacto 123: creando asesor INTERNO {...}
AddControl: token renovado
Contacto 123: OK, respuesta AddControl {...}
```

## Limitaciones de la prueba

- El cuerpo de `POST /Asesores` se armó con la respuesta de `GET Asesores`; validar contra `/Help/Api/POST-Asesores`.
- Todos los asesores se ligan al usuario de prueba `ADDCONTROL_ID_USUARIO`.
- El control de duplicados es en memoria; HubSpot puede reintentar un aviso y, si el servicio se reinició, se crearía otro asesor. En la versión real se guarda el ID de AddControl en HubSpot y en Supabase.
- `Webhook rechazado: firma inválida` → revisar `HUBSPOT_CLIENT_SECRET`.
