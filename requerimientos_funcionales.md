Union de los dos sheets → envío único  (SOLO ENVIO SMS + 1 CORREO ) (TEMPLATE NUEVO)

La idea es enviar a un sheet unificado que tome de dos fuentes (sheets adjuntos), luego limpie los duplicados y ejecuta la campaña.

1  - https://docs.google.com/spreadsheets/d/1FXRthiLA2ut1SUkZZBECc7SZK6LCkB6mFct_98F4vnY/edit?gid=0#gid=0  - Leads institucional

2 - https://docs.google.com/spreadsheets/d/1runPllSwWDbTcBncap9GVbZcIEaOYZhdzeS8Z-vLQa8/edit?gid=0#gid=0 - Leads meta


# Regla de envío
tiene que respetar la siguiente secuencia luego  envío de SMS a la media hora se envía el correo

# Proveedor de email
doctored.dyndns.org
ventasdoctored@doctored.com.ar
Ven416ro*

- Tomar como referencia el flujo realizado para quickcampaign_sms
  - Se encuentra en la carpeta : E:\Documentos\Proyectos_Roisa\quickcampaign_sms
- Necesito que crees un sheet  simil ENVIO_SMS_V2.xlsx
  - donde agregues las columnas de envío de email por tanda, al igual que el sheet de ENVIO_SMS_V2.xlsx, solo que en vez de decir si o no
  - tiene que guardar el time stamp.

- Como los envíos van a ser a masivos , considerá las reglas que conozcoas en cuanto a envío de emails para no caer en spam.
- El sender de sms usá el mismo qu usamos ahora.

# Versatilidad de tandas
- El diseño tiene que ser abierto: tiene que permitir seguir agregando tandas de envío (SMS + mail) sin límite fijo, no una cantidad cerrada de columnas/tandas predefinida.
- Cada tanda nueva que se agregue debe seguir el mismo esquema: columna de SMS (sí/no) + columna de mail (timestamp), respetando la secuencia SMS → 30 min → mail.

# Regla de corte de envíos
- SMS: se mantiene la regla de corte ya utilizada en quickcampaign_sms (si el lead responde/convierte, se deja de enviar SMS salientes).
- Mail: el corte de envíos (dejar de enviar tandas siguientes) se dispara por cualquiera de estos dos eventos:
  - El lead hace click en el botón/enlace de "desuscribirse" del template.
  - El lead hace click en el enlace principal (CTA) del mail.

# Templates de email
Los templates a utilizar están bajo la siguiente denominación:
- plantilla_alta.html
- plantilla_baja.html
- plantilla_media.html
