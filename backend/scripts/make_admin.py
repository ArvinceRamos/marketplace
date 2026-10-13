"""Make a LOCAL user a moderator (or remove the role). Local stack only.

    npm run db:admin -- someone@example.test          # grant
    npm run db:admin -- someone@example.test --remove # revoke

Sets `app_metadata.role` in auth.users. Users can't edit app_metadata themselves,
so the role can't be self-granted. The user must sign out and in again (or wait
for the token to refresh) before the role is in their token.
"""

import argparse
import asyncio
import os
import sys
from urllib.parse import urlparse

import asyncpg

ADMIN_DSN = os.environ.get(
    "DEMO_ADMIN_DSN", "postgresql://postgres:postgres@127.0.0.1:54422/postgres"
)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("email")
    parser.add_argument("--remove", action="store_true", help="take the moderator role away")
    args = parser.parse_args()

    host = urlparse(ADMIN_DSN).hostname
    if host not in {"127.0.0.1", "localhost"}:
        sys.exit(f"Refusing to change roles on non-local host {host!r}.")

    conn = await asyncpg.connect(ADMIN_DSN)
    try:
        if args.remove:
            sql = """update auth.users set raw_app_meta_data = raw_app_meta_data - 'role'
                     where email = $1 returning id"""
        else:
            sql = """update auth.users
                     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                                             || '{"role": "admin"}'::jsonb
                     where email = $1 returning id"""
        row = await conn.fetchrow(sql, args.email.lower())
    finally:
        await conn.close()
    if row is None:
        sys.exit(f"No local user with email {args.email!r}.")
    verb = "removed from" if args.remove else "granted to"
    print(f"Moderator role {verb} {args.email}. Sign out and in again to refresh the token.")


if __name__ == "__main__":
    asyncio.run(main())
