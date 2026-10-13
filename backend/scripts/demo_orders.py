"""Demo orders in every state, reviews, disputes, reports, and a demo moderator.

LOCAL ONLY, TEST MODE: called by seed_demo.py after the demo listings exist. Every
step goes through the same database functions the API uses (as the right user, by
setting the JWT claims), so the ledger, timers, and listing states stay consistent.
"""

import json
import secrets
import uuid

import asyncpg
import httpx2

MODERATOR = ("demo_moderator", "Demo Moderator")
TRACK = ("picked_up", "in_transit", "out_for_delivery", "delivered")


class Demo:
    def __init__(self, db: asyncpg.Connection, sellers: list[uuid.UUID]) -> None:
        self.db = db
        self.sellers = sellers
        self.used: list[uuid.UUID] = []

    async def as_user(self, uid: uuid.UUID, sql: str, *args, admin: bool = False):
        claims: dict = {"sub": str(uid), "role": "authenticated"}
        if admin:
            claims["app_metadata"] = {"role": "admin"}
        async with self.db.transaction():
            await self.db.execute(
                "select set_config('request.jwt.claims', $1, true)", json.dumps(claims)
            )
            return await self.db.fetchval(sql, *args)

    async def listing(self, seller: int) -> uuid.UUID:
        """A fresh active listing of this seller, open to every way of buying."""
        listing_id = await self.db.fetchval(
            """select id from app.listings
               where seller_id = $1 and status = 'active' and id <> all($2::uuid[])
               order by published_at desc limit 1""",
            self.sellers[seller],
            self.used,
        )
        self.used.append(listing_id)
        await self.db.execute(
            """update app.listings set meetup = true, delivery = true,
                 payment_methods = '{gcash,cash,cod}', couriers = '{}' where id = $1""",
            listing_id,
        )
        return listing_id

    async def order(
        self, buyer: int, seller: int, fulfilment: str, payment: str = "online", courier=None
    ) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
        listing = await self.listing(seller)
        oid = await self.as_user(
            self.sellers[buyer],
            """select app.order_create($1, null, $2::app.order_fulfilment,
                                       $3::app.order_payment, $4)""",
            listing,
            fulfilment,
            payment,
            courier,
        )
        return oid, self.sellers[buyer], self.sellers[seller]

    async def pay(self, oid: uuid.UUID, buyer: uuid.UUID) -> None:
        ref = f"mock_sess_demo_{secrets.token_hex(8)}"
        amount = await self.as_user(buyer, "select app.payment_start($1, 'mock', $2)", oid, ref)
        await self.db.fetchval(
            "select app.payment_succeeded('mock', $1, $2, $3)",
            f"evt_demo_{secrets.token_hex(8)}",
            ref,
            amount,
        )

    async def ship(self, oid: uuid.UUID, seller: uuid.UUID, steps: int = 0) -> None:
        await self.as_user(seller, "select app.order_ship($1)", oid)
        tracking = await self.db.fetchval(
            "select tracking_number from app.shipments where order_id = $1", oid
        )
        for status in TRACK[:steps]:
            await self.db.fetchval(
                "select app.shipment_event('mockcourier', $1, $2, $3::app.shipment_status)",
                f"trk_demo_{secrets.token_hex(8)}",
                tracking,
                status,
            )

    async def review(self, oid: uuid.UUID, uid: uuid.UUID, rating: int, comment: str) -> None:
        await self.as_user(
            uid, "select app.review_create($1, $2::smallint, $3)", oid, rating, comment
        )


async def seed_orders(
    db: asyncpg.Connection, http: httpx2.Client, sellers: list[uuid.UUID], password: str
) -> None:
    d = Demo(db, sellers)

    # 1. Waiting for payment (expires 30 minutes after seeding).
    await d.order(0, 1, "meetup")
    # 2. Paid, seller must ship.
    oid, b, _ = await d.order(1, 2, "delivery", courier="jnt")
    await d.pay(oid, b)
    # 3. Paid meetup, waiting for the handover code.
    oid, b, _ = await d.order(2, 3, "meetup")
    await d.pay(oid, b)
    # 4. In transit.
    oid, b, s = await d.order(3, 4, "delivery", courier="lbc")
    await d.pay(oid, b)
    await d.ship(oid, s, steps=2)
    # 5. Delivered, buyer has 2 days to confirm.
    oid, b, s = await d.order(4, 5, "delivery", courier="flash")
    await d.pay(oid, b)
    await d.ship(oid, s, steps=4)
    # 6. Completed online delivery, both reviewed (public).
    oid, b, s = await d.order(5, 6, "delivery", courier="jnt")
    await d.pay(oid, b)
    await d.ship(oid, s, steps=4)
    await d.as_user(b, "select app.order_confirm_received($1)", oid)
    await d.review(oid, b, 5, "Exactly as described and well packed. Salamat!")
    await d.review(oid, s, 5, "Paid fast, smooth transaction.")
    # 7. Completed cash meetup with the handover code, both reviewed.
    oid, b, s = await d.order(6, 7, "meetup", payment="cash")
    code = await db.fetchval("select handover_code from app.order_secrets where order_id = $1", oid)
    if await d.as_user(s, "select app.order_handover($1, $2)", oid, code) != "ok":
        raise RuntimeError("demo handover failed")
    await d.review(oid, b, 4, "Nice item. Came a bit late to the meetup but all good.")
    await d.review(oid, s, 5, "On time and friendly.")
    # 8. Paid, then cancelled by the buyer: refunded in full.
    oid, b, _ = await d.order(7, 0, "meetup")
    await d.pay(oid, b)
    await d.as_user(b, "select app.order_cancel($1)", oid)
    # 9. Disputed and contested: waiting for a moderator.
    oid, b, s = await d.order(0, 2, "delivery", courier="jnt")
    await d.pay(oid, b)
    await d.ship(oid, s, steps=4)
    await d.as_user(
        b,
        "select app.dispute_open($1, 'not_as_described', $2)",
        oid,
        "There is damage that wasn't in the photos.",
    )
    await d.as_user(
        s,
        "select app.dispute_seller_respond($1, 'contest', $2)",
        oid,
        "The last photo shows it, and the description mentions it too.",
    )
    # 10. Disputed and refunded by the seller.
    oid, b, s = await d.order(1, 3, "delivery", courier="lbc")
    await d.pay(oid, b)
    await d.ship(oid, s, steps=4)
    await d.as_user(
        b, "select app.dispute_open($1, 'incomplete', $2)", oid, "Parts are missing from the box."
    )
    await d.as_user(s, "select app.dispute_seller_respond($1, 'refund', $2)", oid, "Sorry!")
    # 11. Cash on delivery, delivered: the courier remitted to the seller.
    oid, b, s = await d.order(2, 4, "delivery", payment="cod", courier="jnt")
    await d.ship(oid, s, steps=4)
    # 12. Disputed, waiting for the seller (48 hours).
    oid, b, s = await d.order(3, 5, "delivery", courier="flash")
    await d.pay(oid, b)
    await d.ship(oid, s, steps=4)
    await d.as_user(b, "select app.dispute_open($1, 'incomplete', null)", oid)

    # Two open reports for the moderation queue.
    spam = await d.listing(6)
    await d.as_user(
        sellers[0],
        """insert into app.reports (reporter_id, target_type, listing_id, reason, details)
           values ($1, 'listing', $2, 'spam', 'Same item posted many times.')""",
        sellers[0],
        spam,
    )
    await d.as_user(
        sellers[1],
        """insert into app.reports (reporter_id, target_type, reported_user_id, reason, details)
           values ($1, 'user', $2, 'scam', 'Asked me to pay outside the app first.')""",
        sellers[1],
        sellers[7],
    )

    # A demo moderator (role in app_metadata, which users can't edit).
    res = http.post(
        "/auth/v1/admin/users",
        json={
            "email": f"{MODERATOR[0]}@demo.test",
            "password": password,
            "email_confirm": True,
            "user_metadata": {"age_confirmed": True},
            "app_metadata": {"role": "admin"},
        },
    )
    res.raise_for_status()
    await db.execute(
        "update app.profiles set username = $2, display_name = $3 where id = $1",
        uuid.UUID(res.json()["id"]),
        *MODERATOR,
    )
    print("Created 12 demo orders (every state), 2 reports, and demo_moderator@demo.test.")


async def settle_demo_money(db: asyncpg.Connection, ids: list[uuid.UUID]) -> None:
    """Account deletion refuses open orders and wallet balances (SECURITY_PLAN T32).
    Before re-seeding, close the demo users' open orders and zero their balances
    with a balanced ledger transaction (superuser, local only)."""
    async with db.transaction():
        await db.execute(
            """update app.orders set status = 'cancelled', cancelled_at = now()
               where app.order_is_open(status)
                 and (buyer_id = any($1::uuid[]) or seller_id = any($1::uuid[]))""",
            ids,
        )
        await db.execute(
            """with b as (
                 select user_id, sum(amount_centavos) as bal, gen_random_uuid() as txn
                 from app.ledger_entries
                 where account = 'seller' and user_id = any($1::uuid[])
                 group by user_id having sum(amount_centavos) <> 0)
               insert into app.ledger_entries (txn_id, account, user_id, amount_centavos, memo)
               select txn, 'seller'::app.ledger_account, user_id, -bal, 'Demo reset' from b
               union all
               select txn, 'external', user_id, bal, 'Demo reset' from b""",
            ids,
        )
