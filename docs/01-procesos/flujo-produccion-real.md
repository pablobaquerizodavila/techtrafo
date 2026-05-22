# Flujo de produccion real - TECHTRAFO

> Estado: Validado (consolidado con procesos reales de planta)
> Version: 4.0
> Base: flujos reales de TECHTRAFO + capas digitales agregadas

---

## Resumen ejecutivo

- 28 pasos tecnicos principales
- 5 gates de prueba obligatorios con loops de retrabajo
- 3 hitos de caja integrados (anticipo, avance, final)
- 8 fases secuenciales

---

## Fase 1 - Pedido, contrato y caja

1. Pedido del cliente confirmado
2. Firma de contrato (alcance, plazos, garantia, plan de pagos)
3. **CAJA ANTICIPO** - % libre segun contrato (0-100%)
4. Apertura de OT en sistema
5. Ficha tecnica + registro fotografico inicial

## Fase 2 - Revision preliminar y bifurcacion

**Revision preliminar de materia prima** (nucleo, conductores, tanque)

Decision: hay materia prima propia?
- SI -> Ruta A: Reparacion
- NO -> Ruta B: Fabricacion nueva

## Fase 3 - Ejecucion tecnica paralela

### Ruta A - Reparacion

- Confirmacion materia prima
- Desencube y desarmado parte activa
- Calculos preliminares
- Desarmado total parte activa
- Armado nucleo + prueba perdidas

**GATE A: Pasa prueba de perdidas?**
- NO -> Vuelve a revision preliminar
- SI -> Continua

- Rediseno / bobinado
- Recuperacion conductores
- Bobinado baja y alta tension
- Compra/fabricacion prensas + pintado
- Limpieza laminas + armado nucleo

### Ruta B - Fabricacion nueva

- Importacion nucleos, radiadores, accesorios
- Diseno nuevo + bobinado
- Encintado/bobinado baja y alta
- Compra materiales metalmecanica
- Fabricacion tanque + pintado prensas

**GATE B: Prueba de hermeticidad**
- NO -> Correccion de fuga -> reintenta
- SI -> Continua

- Pintado tanque + readecuacion
- Limpieza laminas + armado nucleo
- Fabricacion prensas + pintado
- Preparacion ensamble

## Fase 4 - Convergencia: montaje y pruebas preliminares

11. Montaje bobinas y cierre del nucleo

**GATE 1: Prueba TTR preliminar**
- NO -> Desarmado parte activa + recuperacion conductores
- SI -> Continua

12. Montaje tapa + preencube parte activa
13. Conexiones internas bushings y conmutador
14. Prueba TTR/MTO nucleada a tierra + verificacion distancias

## Fase 5 - Hito caja avance + tratamiento termico

15. **CAJA AVANCE** - % libre segun contrato
16. Secado en horno y vacio
17. Encube (paralelo) + Filtrado aceite (paralelo)

## Fase 6 - Pruebas finales con gates

18. Pruebas TTR/MTO aislamiento (captura Grafana)

**GATE 2: Pasa aislamiento?**
- NO -> Loop: retiro aceite -> desencube -> inspeccion -> correccion
- SI -> Continua

19. Prueba vacio y cortocircuito (perdidas e impedancia)

**GATE 3: Pasa vacio y CC?**
- NO -> Rediseno completo
- SI -> Continua

## Fase 7 - Acabados y documentacion

20. Retoque pintura epoxica
21. Etiquetado + accesorios medicion y proteccion
22. Informe protocolo de pruebas + aceite
23. Prueba con cliente en planta (aceptacion formal)

## Fase 8 - Liquidacion, entrega y posventa

24. **CAJA FINAL** - saldo cobrado antes de liberar equipo
25. Acta de entrega + certificado garantia (3 anos)
26. Logistica de despacho
27. Encuesta NPS (7 dias post-entrega)
28. Programa posventa + cliente recurrente

---

## Resumen de gates

| Gate | Ubicacion | Si falla |
|---|---|---|
| GATE A | Post armado nucleo Ruta A | Revision preliminar |
| GATE B | Post fabricacion tanque Ruta B | Correccion de fuga |
| GATE 1 | Post montaje bobinas | Desarmado parte activa |
| GATE 2 | Pruebas aislamiento | Loop completo: retiro -> desencube -> inspeccion |
| GATE 3 | Prueba vacio y CC | Rediseno desde fase 3 |

---

## Areas de planta involucradas

Cada area tiene checklist digital obligatorio antes de pasar a la siguiente:

1. Recepcion (potencia y distribucion)
2. Diagnostico (pruebas electricas iniciales)
3. Reparacion (bobinado / potencia)
4. Ensamblaje (aceite dielectrico)
5. Tratamiento de aceite (9600 / 4800 / 2400 L/h + Fuller)
6. Pintura epoxica (anticorrosiva)
7. Pruebas finales (control de calidad)
