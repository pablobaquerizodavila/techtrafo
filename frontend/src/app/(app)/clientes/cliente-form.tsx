"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cliente, ClienteInput, TipoPersona, Segmento, Sector, crearAcceso } from "@/lib/clientes";
import { ClienteAccesos } from "./cliente-accesos";
import { ApiError } from "@/lib/api";

const PROVINCIAS_EC = [
  "Azuay", "Bolívar", "Cañar", "Carchi", "Chimborazo", "Cotopaxi",
  "El Oro", "Esmeraldas", "Galápagos", "Guayas", "Imbabura", "Loja",
  "Los Ríos", "Manabí", "Morona Santiago", "Napo", "Orellana", "Pastaza",
  "Pichincha", "Santa Elena", "Santo Domingo de los Tsáchilas",
  "Sucumbíos", "Tungurahua", "Zamora Chinchipe",
];

interface Props {
  initial?: Cliente | null;
  // Devuelve el cliente creado/actualizado (con id) para poder crear su acceso.
  onSubmit: (data: ClienteInput) => Promise<Cliente | void>;
  onCancel: () => void;
}

export function ClienteForm({ initial, onSubmit, onCancel }: Props) {
  const [tipoPersona, setTipoPersona] = useState<TipoPersona>(initial?.tipo_persona ?? "juridica");
  const [razonSocial, setRazonSocial] = useState(initial?.razon_social ?? "");
  const [nombreComercial, setNombreComercial] = useState(initial?.nombre_comercial ?? "");
  const [rucCedula, setRucCedula] = useState(initial?.ruc_cedula ?? "");
  const [direccionFiscal, setDireccionFiscal] = useState(initial?.direccion_fiscal ?? "");
  const [ciudad, setCiudad] = useState(initial?.ciudad ?? "");
  const [provincia, setProvincia] = useState(initial?.provincia ?? "");
  const [pais, setPais] = useState(initial?.pais ?? "Ecuador");
  const [telefono, setTelefono] = useState(initial?.telefono ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [sitioWeb, setSitioWeb] = useState(initial?.sitio_web ?? "");
  const [segmento, setSegmento] = useState<Segmento | "">(initial?.segmento ?? "");
  const [sector, setSector] = useState<Sector | "">(initial?.sector ?? "");
  const [creditoHabilitado, setCreditoHabilitado] = useState(initial?.credito_habilitado ?? false);
  const [limiteCredito, setLimiteCredito] = useState(
    initial?.limite_credito ? Number(initial.limite_credito) : 0,
  );
  const [plazoCreditoDias, setPlazoCreditoDias] = useState(initial?.plazo_credito_dias ?? 0);
  const [notas, setNotas] = useState(initial?.notas ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Acceso inicial al portal (solo en alta). En edición se gestiona con <ClienteAccesos>.
  const [crearAccesoInicial, setCrearAccesoInicial] = useState(false);
  const [accEmail, setAccEmail] = useState("");
  const [accNombres, setAccNombres] = useState("");
  const [accApellidos, setAccApellidos] = useState("");
  const [accPassword, setAccPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!provincia) { setError("Seleccioná una provincia"); return; }
    // Validar acceso inicial si está activado (solo alta)
    if (!initial && crearAccesoInicial) {
      if (!accEmail.trim() || !accNombres.trim() || !accApellidos.trim() || accPassword.length < 8) {
        setError("Para crear el acceso: completá email, nombre, apellido y una contraseña de 8+ caracteres");
        return;
      }
    }
    setSubmitting(true);

    const payload: ClienteInput = {
      tipo_persona: tipoPersona,
      razon_social: razonSocial.trim(),
      nombre_comercial: nombreComercial.trim() || null,
      ruc_cedula: rucCedula.trim(),
      direccion_fiscal: direccionFiscal.trim(),
      ciudad: ciudad.trim(),
      provincia: provincia,
      pais: pais.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      sitio_web: sitioWeb.trim() || null,
      segmento: segmento || null,
      sector: sector || null,
      credito_habilitado: creditoHabilitado,
      limite_credito: Number(limiteCredito) || 0,
      plazo_credito_dias: Number(plazoCreditoDias) || 0,
      notas: notas.trim() || null,
    };

    try {
      const cliente = await onSubmit(payload);
      // En alta, si se pidió acceso inicial, crearlo contra el cliente recién creado.
      if (!initial && crearAccesoInicial && cliente && "id" in cliente) {
        try {
          await crearAcceso(cliente.id, {
            email: accEmail.trim(),
            nombres: accNombres.trim(),
            apellidos: accApellidos.trim(),
            password: accPassword,
          });
        } catch (accErr) {
          const code = accErr instanceof ApiError ? (accErr.body as { error?: string })?.error : null;
          setError(
            code === "email_duplicado" || code === "email_o_usuario_duplicado"
              ? "Cliente creado, pero el email del acceso ya está en uso. Agregá el acceso desde Editar."
              : "Cliente creado, pero falló crear el acceso. Agregalo desde Editar.",
          );
          setSubmitting(false);
          return; // no relanzar ni cerrar: el cliente sí se creó, mostramos el aviso
        }
      }
      onCancel(); // éxito total → cerrar el dialog
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error guardando";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tipo_persona">Tipo de persona *</Label>
          <Select value={tipoPersona} onValueChange={(v) => setTipoPersona(v as TipoPersona)}>
            <SelectTrigger id="tipo_persona">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="juridica">Juridica</SelectItem>
              <SelectItem value="natural">Natural</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ruc_cedula">RUC / Cedula *</Label>
          <Input
            id="ruc_cedula"
            value={rucCedula}
            onChange={(e) => setRucCedula(e.target.value)}
            required
            minLength={10}
            maxLength={13}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="razon_social">Razon social *</Label>
        <Input
          id="razon_social"
          value={razonSocial}
          onChange={(e) => setRazonSocial(e.target.value)}
          required
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombre_comercial">Nombre comercial</Label>
        <Input
          id="nombre_comercial"
          value={nombreComercial}
          onChange={(e) => setNombreComercial(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="segmento">Segmento</Label>
          <Select value={segmento || "_"} onValueChange={(v) => setSegmento(v === "_" ? "" : (v as Segmento))}>
            <SelectTrigger id="segmento">
              <SelectValue placeholder="Sin definir" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">Sin definir</SelectItem>
              <SelectItem value="industrial">Industrial</SelectItem>
              <SelectItem value="distribuidora">Distribuidora</SelectItem>
              <SelectItem value="constructora">Constructora</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sector">Sector</Label>
          <Select value={sector || "_"} onValueChange={(v) => setSector(v === "_" ? "" : (v as Sector))}>
            <SelectTrigger id="sector">
              <SelectValue placeholder="Sin definir" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">Sin definir</SelectItem>
              <SelectItem value="privado">Privado</SelectItem>
              <SelectItem value="publico">Publico</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="direccion_fiscal">Direccion fiscal *</Label>
        <Textarea
          id="direccion_fiscal"
          value={direccionFiscal}
          onChange={(e) => setDireccionFiscal(e.target.value)}
          rows={2}
          required
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="ciudad">Ciudad *</Label>
          <Input id="ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="provincia">Provincia *</Label>
          <Select value={provincia || ""} onValueChange={(v) => setProvincia(v)}>
            <SelectTrigger id="provincia">
              <SelectValue placeholder="Seleccionar..." />
            </SelectTrigger>
            <SelectContent>
              {PROVINCIAS_EC.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pais">Pais *</Label>
          <Input id="pais" value={pais} onChange={(e) => setPais(e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="telefono">Telefono *</Label>
          <Input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={20} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sitio_web">Sitio web</Label>
          <Input id="sitio_web" value={sitioWeb} onChange={(e) => setSitioWeb(e.target.value)} />
        </div>
      </div>


      <div className="space-y-2">
        <Label htmlFor="notas">Notas internas</Label>
        <Textarea id="notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} />
      </div>

      {/* ─── Acceso al portal ─── */}
      {initial ? (
        // Edición: gestión completa de accesos (varios)
        <ClienteAccesos clienteId={initial.id} />
      ) : (
        // Alta: opción de crear un acceso inicial
        <div className="space-y-2 rounded-lg border border-glass bg-glass/40 p-3">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={crearAccesoInicial}
              onChange={(e) => setCrearAccesoInicial(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium">Crear acceso al portal</span>
              <span className="block text-[11px] text-muted-foreground">
                El cliente podrá entrar a ver sus expedientes. Podés agregar más accesos después desde Editar.
              </span>
            </span>
          </label>

          {crearAccesoInicial && (
            <div className="space-y-2 rounded-md border border-copper/30 bg-copper/[0.04] p-2.5">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Nombres</Label>
                  <Input className="h-8 text-sm" value={accNombres} onChange={(e) => setAccNombres(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Apellidos</Label>
                  <Input className="h-8 text-sm" value={accApellidos} onChange={(e) => setAccApellidos(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Email de login</Label>
                  <Input className="h-8 text-sm" type="email" value={accEmail} onChange={(e) => setAccEmail(e.target.value)} placeholder="persona@empresa.com" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Contraseña (8+ caracteres)</Label>
                  <Input className="h-8 text-sm" type="text" value={accPassword} onChange={(e) => setAccPassword(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Guardando..." : initial ? "Actualizar" : "Crear cliente"}
        </Button>
      </div>
    </form>
  );
}
