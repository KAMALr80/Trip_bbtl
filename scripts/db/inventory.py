#!/usr/bin/env python3
"""Database inventory for M0-06: every table and function, its grants, RLS state,
the migration that last defined it, and which source files reference it.

Run against the replayed migration DB:
    REPLAY_HOOK='python3 scripts/db/inventory.py' scripts/db/replay-migrations.sh

Writes docs/inventory/db-inventory.md (overview) and docs/inventory/db-inventory.tsv
(one row per object, for filtering in a spreadsheet).
"""

from __future__ import annotations

import collections
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = Path(os.environ.get("INVENTORY_OUT", ROOT / "docs" / "inventory"))
SCHEMAS = ("public", "trip_private")


def query(sql: str) -> list[list[str]]:
    out = subprocess.run(
        ["psql", "-X", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-c", sql],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return [line.split("\t") for line in out.splitlines() if line]


TABLES_SQL = """
SELECT n.nspname, c.relname, c.relrowsecurity,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid),
       coalesce((SELECT string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type)
                 FROM information_schema.role_table_grants g
                 WHERE g.table_schema = n.nspname AND g.table_name = c.relname
                   AND g.grantee = 'anon'), ''),
       coalesce((SELECT string_agg(DISTINCT g.privilege_type, ',' ORDER BY g.privilege_type)
                 FROM information_schema.role_table_grants g
                 WHERE g.table_schema = n.nspname AND g.table_name = c.relname
                   AND g.grantee = 'authenticated'), ''),
       c.relkind,
       coalesce((SELECT string_agg(DISTINCT CASE p.polcmd WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
                                              WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' END, ',')
                 FROM pg_policy p
                 WHERE p.polrelid = c.oid AND p.polcmd IN ('a', 'w', 'd', '*') AND p.polpermissive
                   AND (p.polroles = '{0}' OR p.polroles && ARRAY(SELECT oid FROM pg_roles
                                                 WHERE rolname IN ('authenticated', 'anon')))), '')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'trip_private') AND c.relkind IN ('r', 'v', 'm', 'p')
ORDER BY 1, 2
"""

FUNCTIONS_SQL = """
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
       p.prosecdef,
       coalesce(array_to_string(p.proconfig, ' '), ''),
       has_function_privilege('anon', p.oid, 'EXECUTE'),
       has_function_privilege('authenticated', p.oid, 'EXECUTE'),
       CASE p.prokind WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate' ELSE
         CASE WHEN p.prorettype = 'trigger'::regtype THEN 'trigger' ELSE 'function' END END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'trip_private')
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
ORDER BY 1, 2, 3
"""


def last_migration_index() -> tuple[dict[str, str], dict[str, int]]:
    """Map 'schema.name' -> last migration file that creates/replaces it, and
    'schema.name' -> how many migrations (re)define it."""
    last: dict[str, str] = {}
    count: collections.Counter[str] = collections.Counter()
    pat = re.compile(
        r"CREATE\s+(?:OR\s+REPLACE\s+)?(FUNCTION|PROCEDURE|TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?"
        r"(?:\"?(public|trip_private)\"?\.)?\"?([a-z_0-9]+)\"?",
        re.IGNORECASE,
    )
    for f in sorted((ROOT / "supabase" / "migrations").glob("*.sql")):
        seen: set[str] = set()
        for m in pat.finditer(f.read_text(encoding="utf-8", errors="replace")):
            key = f"{(m.group(2) or 'public').lower()}.{m.group(3).lower()}"
            last[key] = f.name
            seen.add(key)
        for key in seen:
            count[key] += 1
    return last, count


def source_files() -> list[tuple[str, str]]:
    files = []
    for p in (ROOT / "src").rglob("*"):
        if p.suffix in {".ts", ".tsx"} and p.name != "types.ts" and "routeTree.gen" not in p.name:
            files.append((str(p.relative_to(ROOT)), p.read_text(encoding="utf-8", errors="replace")))
    return files


def references(name: str, files: list[tuple[str, str]]) -> list[str]:
    pat = re.compile(r"[\"'`]" + re.escape(name) + r"[\"'`]")
    return sorted(path for path, text in files if pat.search(text))


def main() -> int:
    last, redefs = last_migration_index()
    files = source_files()
    tables = query(TABLES_SQL)
    functions = query(FUNCTIONS_SQL)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tsv = [
        "kind\tschema\tname\targs\tsecurity_definer\tsearch_path_set\trls\tpolicies\t"
        "anon\tauthenticated\twrite_policies\tlast_migration\tdefinitions\tsrc_refs\tsrc_files"
    ]

    table_rows = []
    for schema, name, rls, policies, anon, auth, relkind, write_pols in tables:
        kind = {"r": "table", "p": "table", "v": "view", "m": "matview"}[relkind]
        refs = references(name, files) if schema == "public" else []
        key = f"{schema}.{name}"
        table_rows.append((schema, name, kind, rls == "t", int(policies), anon, auth, refs, write_pols))
        tsv.append(
            "\t".join([kind, schema, name, "", "", "", rls, policies, anon, auth, write_pols,
                       last.get(key, ""), str(redefs.get(key, 0)), str(len(refs)), " ".join(refs)])
        )

    fn_rows = []
    for schema, name, args, secdef, config, anon_x, auth_x, kind in functions:
        refs = references(name, files) if schema == "public" else []
        key = f"{schema}.{name}"
        sp = "search_path=" in config
        fn_rows.append((schema, name, args, secdef == "t", sp, anon_x == "t", auth_x == "t", kind, refs,
                        redefs.get(key, 0)))
        tsv.append(
            "\t".join([kind, schema, name, args, secdef, str(sp).lower(), "", "",
                       "EXECUTE" if anon_x == "t" else "", "EXECUTE" if auth_x == "t" else "", "",
                       last.get(key, ""), str(redefs.get(key, 0)), str(len(refs)), " ".join(refs)])
        )

    (OUT_DIR / "db-inventory.tsv").write_text("\n".join(tsv) + "\n", encoding="utf-8")

    # ---- Markdown overview -------------------------------------------------------------------
    md: list[str] = []
    w = md.append
    w("# Database inventory (generated)")
    w("")
    w("> Generated by `scripts/db/inventory.py` from a replay of `supabase/migrations/` onto a local")
    w("> Postgres (`scripts/db/replay-migrations.sh`). It shows what the migration files define. It may")
    w("> differ from the live Lovable Cloud database if anything was changed by hand there. Re-run")
    w("> against a real `supabase db dump` once we have DB access (M0-02).")
    w(">")
    w("> Full per-object data, including the source files that reference each object, is in")
    w("> [`db-inventory.tsv`](db-inventory.tsv).")
    w("")

    n_tab = sum(1 for r in table_rows if r[2] == "table")
    n_view = len(table_rows) - n_tab
    by_schema = collections.Counter((r[0], r[7]) for r in fn_rows)
    w("## Totals")
    w("")
    w("| | public | trip_private |")
    w("|---|---|---|")
    w(f"| Tables | {sum(1 for r in table_rows if r[0]=='public' and r[2]=='table')} | "
      f"{sum(1 for r in table_rows if r[0]=='trip_private' and r[2]=='table')} |")
    w(f"| Views | {sum(1 for r in table_rows if r[0]=='public' and r[2]!='table')} | "
      f"{sum(1 for r in table_rows if r[0]=='trip_private' and r[2]!='table')} |")
    for k in ("function", "trigger", "procedure", "aggregate"):
        if by_schema[("public", k)] or by_schema[("trip_private", k)]:
            w(f"| {k.capitalize()}s | {by_schema[('public', k)]} | {by_schema[('trip_private', k)]} |")
    w("")
    multi = sorted(((c, k) for k, c in redefs.items() if c >= 5), reverse=True)
    w(f"Objects (re)defined in 5 or more migrations: **{len(multi)}**. "
      "This is why the snapshot, not the migration history, is the reference (gotcha G5).")
    w("")

    # ---- Security checks ---------------------------------------------------------------------
    w("## Security checks")
    w("")
    no_rls = [r for r in table_rows if r[2] == "table" and r[0] == "public" and not r[3]]
    w(f"### Public tables without RLS: {len(no_rls)}")
    w("")
    for r in no_rls:
        w(f"- `{r[0]}.{r[1]}` (anon: {r[5] or '—'}; authenticated: {r[6] or '—'})")
    if not no_rls:
        w("None.")
    w("")

    writable = [r for r in table_rows if r[0] == "public" and r[2] == "table" and r[8]]
    w(f"### Public tables with a client write policy: {len(writable)}")
    w("")
    w("Supabase grants `ALL` on public tables by default, so RLS policies are what block forged")
    w("writes. The tables below have at least one policy that allows a client write; review each in")
    w("M6-07 against the rule that game tables take no direct client writes (09 §2).")
    w("")
    for r in writable:
        w(f"- `{r[1]}`: {r[8]}")
    if not writable:
        w("None.")
    w("")

    definer_no_path = [r for r in fn_rows if r[3] and not r[4]]
    w(f"### `SECURITY DEFINER` functions without a fixed `search_path`: {len(definer_no_path)}")
    w("")
    for r in definer_no_path:
        w(f"- `{r[0]}.{r[1]}({r[2]})`")
    if not definer_no_path:
        w("None.")
    w("")

    anon_exec = [r for r in fn_rows if r[0] == "public" and r[5] and r[7] == "function"]
    w(f"### Public functions executable by `anon` (signed-out): {len(anon_exec)}")
    w("")
    w("Each should be deliberately public (legal pages, invite preview, version). Anything else should")
    w("revoke `anon` (09 §2).")
    w("")
    for r in anon_exec:
        w(f"- `{r[1]}({r[2]})`{' — SECURITY DEFINER' if r[3] else ''}")
    w("")

    # ---- Usage -------------------------------------------------------------------------------
    w("## Client usage")
    w("")
    unused_fn = [r for r in fn_rows if r[0] == "public" and r[7] == "function" and not r[8]
                 and (r[5] or r[6])]
    w(f"### Public functions callable by clients but not referenced in `src/`: {len(unused_fn)}")
    w("")
    w("Candidates to revoke (M1-08). Some may be called from SQL, cron or the Test Lab only: check")
    w("before removing. Reference matching is by quoted name, so dynamic names built from strings")
    w("are still found.")
    w("")
    for r in unused_fn:
        w(f"- `{r[1]}({r[2]})`")
    w("")
    unused_tab = [r for r in table_rows if r[0] == "public" and not r[7]]
    w(f"### Public tables/views not referenced by name in `src/`: {len(unused_tab)}")
    w("")
    w("Usually fine: most are read and written only through `trip_private` functions.")
    w("")
    w(", ".join(f"`{r[1]}`" for r in unused_tab))
    w("")

    table_rows_write = {r[1]: r[8] for r in table_rows}
    w("## Tables")
    w("")
    w("| Schema | Table | Kind | RLS | Policies | Client write policies | src files |")
    w("|---|---|---|---|---|---|---|")
    for schema, name, kind, rls, pol, anon, auth, refs, _ in table_rows:
        w(f"| {schema} | `{name}` | {kind} | {'✅' if rls else '❌'} | {pol} | "
          f"{table_rows_write.get(name, '') or '—'} | {len(refs) if schema == 'public' else '—'} |")
    w("")

    w("## Most-redefined objects")
    w("")
    w("| Object | Migrations defining it | Last one |")
    w("|---|---|---|")
    for c, k in multi[:40]:
        w(f"| `{k}` | {c} | `{last.get(k, '')}` |")
    w("")

    (OUT_DIR / "db-inventory.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_DIR / 'db-inventory.md'} and {OUT_DIR / 'db-inventory.tsv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
