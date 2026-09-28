#!/usr/bin/env bash
# Copies AlgoMemtor's data from Neon into a Supabase Postgres database: the
# `core` schema (Prisma), the `ai` schema (Alembic) and both migration
# history tables, so later `prisma migrate deploy` and `alembic upgrade head`
# runs pick up where Neon left off. Auth users already live in Supabase Auth,
# so learner IDs carry over unchanged.
#
#   NEON_DATABASE_URL=postgresql://...neon.tech/...?sslmode=require \
#   SUPABASE_DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres \
#   npm run db:copy-from-neon
#
# Use Neon's direct (non-pooled) URL and Supabase's session pooler (port
# 5432) or direct URL, never the transaction pooler (6543). Stop writes to
# Neon first (pause the old deployment) so nothing changes during the copy.
# Needs pg_dump, pg_restore and psql at least as new as both servers.
set -euo pipefail
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"

for command in psql pg_dump pg_restore python3; do
  command -v "$command" >/dev/null || { echo "$command is required." >&2; exit 1; }
done

: "${NEON_DATABASE_URL:?Set NEON_DATABASE_URL to the Neon direct connection URL}"
: "${SUPABASE_DATABASE_URL:?Set SUPABASE_DATABASE_URL to the Supabase session pooler or direct URL}"

if [[ "$SUPABASE_DATABASE_URL" == *":6543/"* ]]; then
  echo "SUPABASE_DATABASE_URL uses the transaction pooler (6543); use the session pooler (5432) or the direct URL." >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Keep database passwords out of process arguments and command listings. libpq
# reads them from a temporary, owner-only password file instead.
python3 - "$work" <<'PY'
import os
import pathlib
import sys
from urllib.parse import quote, unquote, urlsplit, urlunsplit

directory = pathlib.Path(sys.argv[1])
password_lines = []
for name, key in (("source", "NEON_DATABASE_URL"), ("target", "SUPABASE_DATABASE_URL")):
    url = urlsplit(os.environ[key])
    if not url.hostname or not url.username or not url.password or not url.path:
        raise SystemExit(f"{key} is not a complete PostgreSQL URL")
    port = url.port or 5432
    user = unquote(url.username)
    password = unquote(url.password)
    database = unquote(url.path.lstrip("/"))
    if "\n" in password or "\r" in password:
        raise SystemExit(f"{key} contains an invalid newline")
    safe_url = urlunsplit((url.scheme, f"{quote(user, safe='')}@{url.hostname}:{port}", url.path, url.query, url.fragment))
    (directory / f"{name}.url").write_text(safe_url)
    escape = lambda value: value.replace("\\", "\\\\").replace(":", "\\:")
    password_lines.append(":".join(map(escape, (url.hostname, str(port), database, user, password))))

password_file = directory / "pgpass"
password_file.write_text("\n".join(password_lines) + "\n")
password_file.chmod(0o600)
PY

source_db=$(<"$work/source.url")
target_db=$(<"$work/target.url")
export PGPASSFILE="$work/pgpass"
unset PGPASSWORD

query() { psql "$1" -X -A -t -v ON_ERROR_STOP=1 -c "$2"; }

echo "Checking the target database..."
source_pg_major=$(query "$source_db" "select current_setting('server_version_num')::int / 10000")
target_pg_major=$(query "$target_db" "select current_setting('server_version_num')::int / 10000")
if (( target_pg_major < source_pg_major )); then
  # Neon is currently on 18.6 and this Tokyo Supabase project is on 17.6.
  # The exact schema and data dump were restored into a rolled-back transaction
  # successfully, so allow this known version pair while keeping other downgrades
  # blocked until they have their own compatibility check.
  if (( source_pg_major != 18 || target_pg_major != 17 )); then
    echo "Supabase PostgreSQL $target_pg_major is older than Neon PostgreSQL $source_pg_major; this version pair has not been validated." >&2
    exit 1
  fi
  echo "Using the validated PostgreSQL 18 to 17 logical restore path."
fi
existing=$(query "$target_db" "select count(*) from information_schema.schemata where schema_name in ('core', 'ai')")
if [[ "$existing" != "0" ]]; then
  echo "Supabase already has a core or ai schema. Refusing to overwrite application data." >&2
  exit 1
fi
source_schemas=$(query "$source_db" "select count(*) from information_schema.schemata where schema_name in ('core', 'ai')")
if [[ "$source_schemas" != "2" ]]; then
  echo "Neon must contain both the core and ai schemas; found $source_schemas." >&2
  exit 1
fi
source_tables=$(query "$source_db" "select count(*) from pg_tables where schemaname in ('core', 'ai')")
if [[ "$source_tables" == "0" ]]; then
  echo "Neon has no application tables; check the source URL." >&2
  exit 1
fi

# The dump names the pgvector type by the schema it lives in on Neon, so the
# extension must live in the same schema on Supabase.
vector_schema=$(query "$source_db" "select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector'")
if [[ -n "$vector_schema" ]]; then
  target_vector_schema=$(query "$target_db" "select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector'")
  if [[ -z "$target_vector_schema" ]]; then
    echo "Enabling pgvector in schema $vector_schema..."
    query "$target_db" "create extension if not exists vector with schema \"$vector_schema\"" >/dev/null
  elif [[ "$target_vector_schema" != "$vector_schema" ]]; then
    echo "pgvector is in schema $target_vector_schema on Supabase but $vector_schema on Neon." >&2
    echo "Move it first: alter extension vector set schema $vector_schema;" >&2
    exit 1
  fi
fi

version_tables=$(query "$source_db" "select format('%I.%I', table_schema, table_name) from information_schema.tables where table_name in ('_prisma_migrations', 'ai_alembic_version') and table_schema not in ('core', 'ai')")
history_count=$(query "$source_db" "select count(*) from information_schema.tables where table_name in ('_prisma_migrations', 'ai_alembic_version')")
if [[ "$history_count" != "2" ]]; then
  echo "Neon must contain both Prisma and Alembic migration history tables; found $history_count." >&2
  exit 1
fi

echo "Dumping core and ai from Neon..."
pg_dump "$source_db" --format=custom --no-owner --no-privileges \
  --schema=core --schema=ai --file="$work/app.dump"

if [[ -n "$version_tables" ]]; then
  table_args=()
  while IFS= read -r table; do table_args+=("--table=$table"); done <<<"$version_tables"
  pg_dump "$source_db" --format=custom --no-owner --no-privileges \
    "${table_args[@]}" --file="$work/versions.dump"
fi

echo "Restoring into Supabase..."
pg_restore --no-owner --no-privileges --exit-on-error --file="$work/app.sql" \
  "$work/app.dump"
cp "$work/app.sql" "$work/restore.sql"
if [[ -f "$work/versions.dump" ]]; then
  pg_restore --no-owner --no-privileges --exit-on-error --file="$work/versions.sql" \
    "$work/versions.dump"
  cat "$work/versions.sql" >>"$work/restore.sql"
fi
# Restore both archives in one transaction so a history-table error cannot
# leave application data committed without its migration history.
psql "$target_db" -X -v ON_ERROR_STOP=1 --single-transaction --file="$work/restore.sql" >/dev/null

# Supabase grants public-schema tables to Data API roles by default. The
# migration tables may live in public, so explicitly close those grants.
histories=$(query "$source_db" "select format('%I.%I', schemaname, tablename) from pg_tables where tablename in ('_prisma_migrations', 'ai_alembic_version') order by 1")
while IFS= read -r table; do
  [[ -z "$table" ]] && continue
  query "$target_db" "revoke all on table $table from public, anon, authenticated, service_role; alter table $table enable row level security" >/dev/null
done <<<"$histories"

echo "Comparing row counts and migration history..."
tables=$(query "$source_db" "select format('%I.%I', schemaname, tablename) from pg_tables where schemaname in ('core', 'ai') or tablename in ('_prisma_migrations', 'ai_alembic_version') order by 1")
mismatches=0
while IFS= read -r table; do
  [[ -z "$table" ]] && continue
  source_count=$(query "$source_db" "select count(*) from $table")
  target_count=$(query "$target_db" "select count(*) from $table")
  if [[ "$source_count" == "$target_count" ]]; then
    printf '  ok  %-60s %s\n' "$table" "$source_count"
  else
    printf '  !!  %-60s neon=%s supabase=%s\n' "$table" "$source_count" "$target_count"
    mismatches=$((mismatches + 1))
  fi
done <<<"$tables"

# Row counts alone cannot show a missing migration or changed checksum.
while IFS= read -r table; do
  [[ -z "$table" ]] && continue
  digest_sql="select coalesce(md5(string_agg(row_to_json(t)::text, ',' order by row_to_json(t)::text)), '') from $table t"
  source_digest=$(query "$source_db" "$digest_sql")
  target_digest=$(query "$target_db" "$digest_sql")
  if [[ "$source_digest" != "$target_digest" ]]; then
    printf '  !!  migration history differs: %s\n' "$table"
    mismatches=$((mismatches + 1))
  fi
done <<<"$histories"

if [[ "$mismatches" != "0" ]]; then
  echo "$mismatches table(s) differ. Check that nothing wrote to Neon during the copy." >&2
  exit 1
fi
echo "Done. Point DATABASE_URL (web and AI service) at Supabase."
