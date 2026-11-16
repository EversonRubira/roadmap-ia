#!/usr/bin/env bash
# Corre a migration e os testes de RLS num Postgres temporário. Uso: tests/sql/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
PGBIN=/usr/lib/postgresql/16/bin
DIR="$(mktemp -d)"; PORT=54329
id -u pgtest >/dev/null 2>&1 || useradd -m pgtest
chown pgtest "$DIR"; chmod 755 "$HERE" "$ROOT" || true
run() { su pgtest -s /bin/bash -c "$*"; }
run "$PGBIN/initdb -D $DIR/data -A trust >/dev/null"
run "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log -w start >/dev/null"
trap 'run "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null" || true; rm -rf "$DIR"' EXIT
P="$PGBIN/psql -o /dev/null -h $DIR -p $PORT -U pgtest -v ON_ERROR_STOP=1 -q"
run "$PGBIN/createdb -h $DIR -p $PORT t"
run "$P -d t -f $HERE/00_mock_supabase.sql"
run "$P -d t -f $ROOT/supabase/migrations/20261116000000_learning_journey.sql"
run "$P -d t -f $HERE/10_rls_tests.sql"
echo "SQL OK"
