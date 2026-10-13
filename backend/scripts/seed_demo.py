"""Load fake demo sellers, listings, and generated photos into the LOCAL Supabase stack.

Run from the repo root:  npm run db:demo
Safe to re-run: it removes the previous demo users (and their photos) first.
Refuses to run against anything except localhost.
"""

import asyncio
import hashlib
import io
import json
import os
import secrets
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import urlparse

import asyncpg
import httpx2
from PIL import Image, ImageDraw

from scripts.demo_data import LISTINGS, SELLERS

REPO_ROOT = Path(__file__).resolve().parents[2]
ADMIN_DSN = os.environ.get(
    "DEMO_ADMIN_DSN", "postgresql://postgres:postgres@127.0.0.1:54422/postgres"
)
DEMO_DOMAIN = "demo.test"
BUCKET = "listing-images"
FULL_SIZE = (1200, 1500)  # 4:5, matches the frontend media frame
THUMB_SIZE = (480, 600)

# Soft backgrounds and darker shape colors (pairs), chosen per listing.
PALETTE = [
    ("#eef0ff", "#4643d4"),
    ("#fdeef0", "#c2334a"),
    ("#e9f8ef", "#23794f"),
    ("#fff6e5", "#b7791f"),
    ("#eef1f2", "#4b5359"),
    ("#e6f4fb", "#1f6f99"),
]


def _require_local(url: str) -> None:
    host = urlparse(url).hostname
    if host not in {"127.0.0.1", "localhost"}:
        sys.exit(f"Refusing to seed non-local host {host!r}.")


def _local_status() -> dict:
    npx = shutil.which("npx")
    if not npx:
        sys.exit("npx not found. Install Node.js.")
    out = subprocess.run(  # noqa: S603 - fixed local command
        [npx, "supabase", "status", "-o", "json"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    ).stdout
    if "{" not in out:
        sys.exit("Local Supabase is not running. Start it with `npm run db:start`.")
    return json.loads(out[out.index("{") :])


# --- placeholder photos --------------------------------------------------------------


def _draw_photo(seed: str, parent_slug: str, variant: int) -> Image.Image:
    """A simple flat illustration: soft background and one shape per category family."""
    h = int(hashlib.sha256(seed.encode()).hexdigest(), 16)
    bg, fg = PALETTE[(h + variant) % len(PALETTE)]
    w, ht = FULL_SIZE
    img = Image.new("RGB", FULL_SIZE, bg)
    d = ImageDraw.Draw(img)
    cx, cy = w // 2 + (variant * 60 - 60), ht // 2
    if parent_slug == "electronics":
        d.rounded_rectangle((cx - 230, cy - 420, cx + 230, cy + 420), 60, fill=fg)
        d.rounded_rectangle((cx - 190, cy - 360, cx + 190, cy + 330), 24, fill=bg)
        d.ellipse((cx - 22, cy + 355, cx + 22, cy + 399), fill=bg)
    elif parent_slug == "fashion":
        d.polygon(
            [
                (cx - 300, cy - 330),
                (cx - 110, cy - 420),
                (cx + 110, cy - 420),
                (cx + 300, cy - 330),
                (cx + 240, cy - 170),
                (cx + 170, cy - 200),
                (cx + 170, cy + 420),
                (cx - 170, cy + 420),
                (cx - 170, cy - 200),
                (cx - 240, cy - 170),
            ],
            fill=fg,
        )
        d.ellipse((cx - 90, cy - 460, cx + 90, cy - 360), fill=bg)
    elif parent_slug == "home-living":
        d.rounded_rectangle((cx - 380, cy - 160, cx + 380, cy - 70), 20, fill=fg)
        for x in (cx - 330, cx + 290):
            d.rectangle((x, cy - 70, x + 40, cy + 330), fill=fg)
    elif parent_slug == "vehicle-parts":
        d.ellipse((cx - 360, cy - 360, cx + 360, cy + 360), fill=fg)
        d.ellipse((cx - 230, cy - 230, cx + 230, cy + 230), fill=bg)
        d.ellipse((cx - 70, cy - 70, cx + 70, cy + 70), fill=fg)
    elif parent_slug == "baby-kids":
        for dx, dy, r in ((-160, -120, 180), (170, -60, 140), (0, 220, 160)):
            d.ellipse((cx + dx - r, cy + dy - r, cx + dx + r, cy + dy + r), fill=fg)
    else:  # hobbies and anything else
        d.rounded_rectangle((cx - 280, cy - 380, cx + 280, cy + 380), 28, fill=fg)
        d.rectangle((cx - 250, cy - 350, cx - 200, cy + 350), fill=bg)
    return img


def _webp(img: Image.Image, size: tuple[int, int]) -> bytes:
    buf = io.BytesIO()
    img.resize(size, Image.Resampling.LANCZOS).save(buf, "WEBP", quality=78, method=4)
    return buf.getvalue()


# --- main ------------------------------------------------------------------------------


async def main() -> None:
    status = _local_status()
    api_url, secret = status["API_URL"], status["SECRET_KEY"]
    for url in (api_url, ADMIN_DSN):
        _require_local(url)
    admin_headers = {"apikey": secret, "Authorization": f"Bearer {secret}"}
    db = await asyncpg.connect(ADMIN_DSN)
    http = httpx2.Client(base_url=api_url, headers=admin_headers, timeout=30)
    try:
        await _remove_previous(db, http)
        seller_ids = await _create_sellers(db, http)
        parents = {
            r["slug"]: r["parent_slug"]
            for r in await db.fetch(
                "select c.slug, p.slug as parent_slug from app.categories c "
                "join app.categories p on p.id = c.parent_id"
            )
        }
        count = 0
        for n, row in enumerate(LISTINGS):
            await _create_listing(db, http, seller_ids, parents, n, row)
            count += 1
        print(f"Created {len(seller_ids)} demo sellers and {count} listings.")
        print(f"Demo sellers sign in with <username>@{DEMO_DOMAIN} and password from the console.")
    finally:
        http.close()
        await db.close()


async def _remove_previous(db: asyncpg.Connection, http: httpx2.Client) -> None:
    users = await db.fetch("select id from auth.users where email like $1", f"%@{DEMO_DOMAIN}")
    if not users:
        return
    ids = [u["id"] for u in users]
    paths = await db.fetch(
        "select i.full_path, i.thumb_path from app.listing_images i "
        "join app.listings l on l.id = i.listing_id where l.seller_id = any($1::uuid[])",
        ids,
    )
    prefixes = [p for r in paths for p in (r["full_path"], r["thumb_path"])]
    for start in range(0, len(prefixes), 100):
        http.request(
            "DELETE",
            f"/storage/v1/object/{BUCKET}",
            json={"prefixes": prefixes[start : start + 100]},
        )
    for uid in ids:
        http.delete(f"/auth/v1/admin/users/{uid}").raise_for_status()
    print(f"Removed {len(ids)} previous demo users.")


async def _create_sellers(db: asyncpg.Connection, http: httpx2.Client) -> list[uuid.UUID]:
    password = os.environ.get("DEMO_PASSWORD") or secrets.token_urlsafe(10)
    ids = []
    for username, display_name, city, bio in SELLERS:
        res = http.post(
            "/auth/v1/admin/users",
            json={
                "email": f"{username}@{DEMO_DOMAIN}",
                "password": password,
                "email_confirm": True,
                "user_metadata": {"age_confirmed": True},
            },
        )
        res.raise_for_status()
        uid = uuid.UUID(res.json()["id"])
        await db.execute(
            "update app.profiles set username = $2, display_name = $3, bio = $4, "
            "city_id = (select id from app.locations where slug = $5) where id = $1",
            uid,
            username,
            display_name,
            bio,
            city,
        )
        # Spread "joined" dates over the past year (guard triggers skipped, local only).
        async with db.transaction():
            await db.execute("set local session_replication_role = replica")
            await db.execute(
                "update app.profiles set created_at = now() - make_interval(days => $2) "
                "where id = $1",
                uid,
                30 + len(ids) * 37,
            )
        ids.append(uid)
    print(f"Demo seller password (local only): {password}")
    return ids


async def _create_listing(db, http, seller_ids, parents, n, row) -> None:
    (seller, category, title, pesos, condition, city, meetup, delivery, note, status, desc) = row
    seller_id = seller_ids[seller]
    listing_id = await db.fetchval(
        """insert into app.listings (seller_id, category_id, city_id, title, description,
             price_centavos, condition, meetup, delivery, deal_note)
           values ($1, (select id from app.categories where slug = $2),
                   (select id from app.locations where slug = $3), $4, $5, $6, $7, $8, $9, $10)
           returning id""",
        seller_id,
        category,
        city,
        title,
        desc,
        pesos * 100,
        condition,
        meetup,
        delivery,
        note,
    )
    photos = 1 + n % 3
    for pos in range(photos):
        img = _draw_photo(title, parents.get(category, ""), pos)
        base = f"{seller_id}/{listing_id}/{uuid.uuid4().hex}"
        for suffix, size in (("full", FULL_SIZE), ("thumb", THUMB_SIZE)):
            http.post(
                f"/storage/v1/object/{BUCKET}/{base}-{suffix}.webp",
                content=_webp(img, size),
                headers={"Content-Type": "image/webp", "x-upsert": "false"},
            ).raise_for_status()
        await db.execute(
            """insert into app.listing_images
                 (listing_id, position, full_path, thumb_path, width, height)
               values ($1, $2, $3, $4, $5, $6)""",
            listing_id,
            pos,
            f"{base}-full.webp",
            f"{base}-thumb.webp",
            *FULL_SIZE,
        )
    if status != "draft":
        await db.execute("update app.listings set status = 'active' where id = $1", listing_id)
    if status in ("paused", "sold"):
        await db.execute("update app.listings set status = $2 where id = $1", listing_id, status)
    # Backdate publish times so "newest" sorting looks natural. Guard triggers would
    # reset timestamps, so they are skipped for this one local-only update.
    async with db.transaction():
        await db.execute("set local session_replication_role = replica")
        await db.execute(
            "update app.listings set published_at = now() - make_interval(hours => $2), "
            "created_at = now() - make_interval(hours => $2) where id = $1",
            listing_id,
            3 + n * 11,
        )


if __name__ == "__main__":
    asyncio.run(main())
