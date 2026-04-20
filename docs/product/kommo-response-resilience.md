# Kommo Response Resilience

## Historia

Como usuario que chatea con el agente en WhatsApp vía Kommo, quiero que mi mensaje SIEMPRE obtenga una respuesta, para no quedarme sin atención cuando hay fallas técnicas invisibles.

## Criterios

WHEN el usuario envía un mensaje de texto válido,
THEN el agente responde en menos de 60 segundos.

WHEN el agente genera una respuesta mayor a 256 caracteres,
THEN la respuesta se parte en fragmentos ≤256 sin cortar palabras ni oraciones cuando hay un límite natural disponible.

WHEN el usuario envía un audio corrupto junto con un texto en el mismo bloque,
THEN el texto se procesa normalmente y el audio se reemplaza por un placeholder `"[audio no transcribible]"`.

WHEN falla la descarga o transcripción del audio,
THEN el sistema continúa el flujo con `"[audio no transcribible]"` en lugar de abortar el batch.

WHEN Kommo rechaza uno de los fragmentos (por ejemplo error 400),
THEN los fragmentos anteriores y posteriores siguen enviándose.

WHEN todos los envíos a Kommo fallan,
THEN el contador de mensajes entregados retorna 0 (para disparar fallback aguas arriba).

## Lo que está fuera de alcance

- Reintentos automáticos de chunks fallidos (fail-forward, una sola pasada).
- Persistencia durable del estado del pipeline (si el proceso muere a mitad, se pierde).
- Notificación al operador humano cuando el fallback también falla (solo se loggea).
