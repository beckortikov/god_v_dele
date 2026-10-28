# Свой сервер для базы и файлов

Сайт остаётся на Vercel, а данные переезжают с Supabase на VPS в Hetzner:
`77.42.8.140`, Хельсинки, Ubuntu 24.04, вход `ssh godvdele` по ключу.

Код уже умеет работать в обоих режимах, режим выбирают переменные окружения в Vercel:

| Переменная | Что включает |
|---|---|
| `DATABASE_URL` | таблицы идут в Postgres на сервере (`lib/db-postgres.ts`); без неё — в Supabase |
| `FILES_URL`, `FILES_SECRET` | файлы идут в файловую службу на сервере (`lib/file-storage.ts`); без них — в Supabase Storage |

## Что стоит на сервере

| Что | Где | Наружу |
|---|---|---|
| PostgreSQL 17, база `godvdele`, роль `gvd_app` | `127.0.0.1:5432`, настройки в `/etc/postgresql/17/main/conf.d/gvd.conf` | нет |
| pgbouncer (transaction pooling) | `db.godvdele.com:6432`, `/etc/pgbouncer/pgbouncer.ini` | да, только TLS; сертификат от Caddy копирует `gvd-pgbouncer-cert.timer` |
| Файловая служба (`server/files/server.mjs`) | `127.0.0.1:8790`, сервис `gvd-files`, данные `/var/lib/gvd-files` | через Caddy на `files.godvdele.com` |
| Caddy (HTTPS, сертификаты Let's Encrypt) | `:80`, `:443` | да |
| Резервные копии | `gvd-backup.timer`, 02:30 UTC, `/var/backups/gvd`, 14 дней | — |

Пароли (`DB_APP_PASSWORD`, `FILES_SECRET`) лежат только в `/root/gvd-secrets.env` (доступ root).
Защита: вход по SSH только по ключу, ufw (22/80/443/6432), fail2ban, автообновления безопасности.

Строка подключения для Vercel (пароль из `/root/gvd-secrets.env`):
`postgres://gvd_app:<DB_APP_PASSWORD>@db.godvdele.com:6432/godvdele?sslmode=verify-full`

Обновить файловую службу после изменений в `server/files/server.mjs`:

```
scp server/files/server.mjs godvdele:/opt/gvd-files/server.mjs && ssh godvdele systemctl restart gvd-files
```

## Переезд: порядок

1. ✅ DNS в Vercel: `files.godvdele.com` и `db.godvdele.com` → A `77.42.8.140` (28.10.2026).
2. ✅ HTTPS для файлов и TLS для pgbouncer, порт 6432 открыт (28.10.2026).
3. ✅ Структура (`pg_dump --schema-only --schema=public`, владелец — `gvd_app`) и первая копия данных
   (28.10.2026). Повторить копию: `sh server/sync-db.sh` — очищает таблицы на VPS, переносит строки
   с выключенными триггерами (платежи не пересчитываются) и сверяет каждую таблицу по числу строк
   и контрольной сумме. Нужен `SUPABASE_DB_URL` в `.env.local`.
4. ✅ Файлы (28.10.2026). Повторить: `server/sync-files.mts` (команда в начале файла) — докачивает
   новое и удаляет то, чего в Supabase уже нет.
5. ✅ Переключение 28.10.2026 в 10:51 UTC: переменные `DATABASE_URL`, `FILES_URL`, `FILES_SECRET` в Production,
   функции в `arn1`; деплой собран без домена, финальная копия данных сверена, затем `vercel promote`.
   В Supabase после начала финальной копии не было ни одной записи — ничего не потерялось.

## Откат (если понадобится)

1. Скопировать данные обратно в Supabase: всё, что записано на VPS после 28.10.2026 10:51 UTC
   (тот же приём, что в `sync-db.sh`, в обратную сторону).
2. Удалить `DATABASE_URL`, `FILES_URL`, `FILES_SECRET` из Production, вернуть `vercel.json` → `syd1`, задеплоить.

## Когда отключать Supabase

Проект Supabase держим до ~11.11.2026. Перед удалением переменных Supabase из Vercel задайте
`SESSION_SECRET`: сейчас cookie входа подписываются ключом, выведенным из `SUPABASE_SERVICE_ROLE_KEY`
(`lib/session.ts`), и без этого всех выкинет из аккаунтов. Чтобы входы сохранились, `SESSION_SECRET`
должен давать тот же ключ — проще всего дописать в `lib/session.ts` поддержку готового ключа или
смириться с одним повторным входом.
