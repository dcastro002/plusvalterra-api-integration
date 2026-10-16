# Prueba HubSpot → AddControl (asesores)

Cuando en HubSpot se crea un contacto o cambia su **Cargo**, HubSpot manda un webhook a este servicio.
Si el Cargo contiene "Asesor", el servicio crea el asesor en AddControl con `POST /Asesores`.
"Asesor externo" va al grupo de externos; cualquier otro "Asesor ..." al de internos.

- Prueba manual: cambiar el Cargo de un contacto existente a `Asesor interno`.
- Prueba automática: crear un contacto nuevo que ya traiga Cargo `Asesor externo`.


## Logs

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
