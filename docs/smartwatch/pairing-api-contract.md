# Contrato anterior de pairing

Este archivo se conserva como referencia historica. El contrato vigente esta
en `docs/smartwatch/pairing-contract.md`.

El flujo anterior exigia que Wear OS iniciara sesion con Supabase Auth y
asumia una tabla `public.dispositivos`. Ese diseño fue descartado: el reloj no
recibe credenciales personales y el esquema existente de `dispositivos` no se
modifica sin una auditoria remota.
