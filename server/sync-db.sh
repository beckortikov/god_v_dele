#!/bin/sh
# Copies every row of the public schema from Supabase to the VPS (replacing what is there) and checks
# each table by row count and a content checksum. Run from god_v_dele_finance/ on the Mac:
#   sh server/sync-db.sh
# Needs SUPABASE_DB_URL in .env.local and `ssh godvdele`. The structure must already be on the VPS.
set -eu
PSQL=${PSQL:-/Library/PostgreSQL/18/bin/psql}
PG_DUMP=${PG_DUMP:-/Library/PostgreSQL/18/bin/pg_dump}
SRC=$(grep '^SUPABASE_DB_URL=' .env.local | tail -1 | cut -d= -f2- | tr -d "\"'")
export PGGSSENCMODE=disable
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "1/3 emptying the tables on the VPS"
ssh godvdele "sudo -u postgres psql -d godvdele -v ON_ERROR_STOP=1 -qAt -c \"select 'truncate ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' cascade' from pg_tables where schemaname = 'public'\" | sudo -u postgres psql -d godvdele -v ON_ERROR_STOP=1 -q"

echo "2/3 copying rows (triggers off, so payments are not recomputed)"
"$PG_DUMP" "$SRC" --data-only --schema=public --no-owner --no-privileges 2>/dev/null \
  | ssh godvdele 'PGOPTIONS="-c session_replication_role=replica" sudo -E -u postgres psql -d godvdele -v ON_ERROR_STOP=1 --single-transaction -q >/dev/null'

echo "3/3 comparing every table"
q="select string_agg(format('select %L as t, count(*) as n, md5(coalesce(string_agg(x::text, %L order by x::text), %L)) as h from public.%I x', tablename, chr(10), '', tablename), ' union all ') || ' order by 1' from pg_tables where schemaname = 'public'"
sql=$("$PSQL" "$SRC" -Atc "$q" </dev/null)
"$PSQL" "$SRC" -Atc "$sql" </dev/null >"$tmp/src"
echo "$sql" | ssh godvdele 'sudo -u postgres psql -d godvdele -At' >"$tmp/dst"
if diff -q "$tmp/src" "$tmp/dst" >/dev/null; then
  echo "OK: $(wc -l <"$tmp/src" | tr -d ' ') tables identical, $(awk -F'|' '{s+=$2} END {print s}' "$tmp/src") rows"
else
  echo "DIFFERENT:"; diff "$tmp/src" "$tmp/dst"; exit 1
fi
