#!/usr/bin/env python3
"""
Envía un email de alerta usando la config SMTP de /opt/techtrafo/.env.

Variables de entorno:
  ALERT_SUBJECT  — asunto del correo (requerido)
  ALERT_BODY     — cuerpo del correo (requerido)
  ALERT_TO       — destinatario (default: pablobaquerizodavila@gmail.com)
  ALERT_ENV_FILE — ruta al .env (default: /opt/techtrafo/.env)

Uso desde shell:
  ALERT_SUBJECT="Asunto" ALERT_BODY="Cuerpo" python3 tt-alert.py
"""
import smtplib
import ssl
import sys
import os
from email.mime.text import MIMEText

ENV_FILE = os.environ.get("ALERT_ENV_FILE", "/opt/techtrafo/.env")
subject  = os.environ.get("ALERT_SUBJECT", "[TECHTRAFO] Alerta")
body     = os.environ.get("ALERT_BODY",    "Sin detalles.")
to_addr  = os.environ.get("ALERT_TO",      "pablobaquerizodavila@gmail.com")

# ─── Leer SMTP config del .env ────────────────────────────────────
env = {}
try:
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
except FileNotFoundError:
    print(f"ERROR: no se encontro {ENV_FILE}", file=sys.stderr)
    sys.exit(1)

host      = env.get("SMTP_HOST", "192.168.0.3")
port      = int(env.get("SMTP_PORT", "465"))
user      = env.get("SMTP_USER", "")
pw        = env.get("SMTP_PASS", "")
from_addr = env.get("SMTP_FROM", "TECHTRAFO <noreply@techtrafo.com>")

# ─── Construir email ──────────────────────────────────────────────
msg = MIMEText(body)
msg["Subject"] = subject
msg["From"]    = from_addr
msg["To"]      = to_addr

# TLS sin verificacion de hostname: conectamos por IP LAN .3,
# CN del cert es mail.eneural.org (mismatch de hostname esperado).
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
ctx.check_hostname = False
ctx.verify_mode    = ssl.CERT_NONE

try:
    with smtplib.SMTP_SSL(host, port, context=ctx) as s:
        s.login(user, pw)
        s.send_message(msg)
    print(f"Alerta enviada a {to_addr}: {subject}")
except Exception as e:
    print(f"ERROR enviando alerta: {e}", file=sys.stderr)
    sys.exit(1)
