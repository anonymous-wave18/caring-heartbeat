# Contrato da API do bot (Discloud)

O SaaS chama **apenas** `POST {DISCORD_BOT_API_URL}/commands`.

## Headers
- `authorization: Bearer <DISCORD_BOT_SHARED_SECRET>`
- `x-timestamp: <epoch ms>` — rejeite se a diferença for maior que 5 minutos
- `x-signature: <HMAC-SHA256 hex do corpo cru, chave = shared secret>`

## Corpo
```json
{ "command": "assign_role", "payload": { }, "timestamp": "1730000000000" }
```

## Comandos
| command | payload |
|---|---|
| `ping` | `{}` |
| `assign_role` | `{ guild_id, discord_id, role_id }` |
| `remove_role` | `{ guild_id, discord_id, role_id }` |
| `send_dm` | `{ discord_id, message }` |
| `sync_user` | `{ guild_id, discord_id, role_id, default_role_id, overdue_role_id, payment_status }` |

## Resposta
- `200` com JSON qualquer em caso de sucesso
- `4xx/5xx` com `{ "error": "motivo" }` — o motivo aparece no toast e no log

O token do bot fica **somente** no ambiente do Discloud; o SaaS nunca o vê.
A regra de remoção por inadimplência (`removal_after_days`) roda no bot,
lendo `discord_bot_settings` pelo Supabase.
