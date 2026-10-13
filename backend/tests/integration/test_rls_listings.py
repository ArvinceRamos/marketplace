"""RLS and rules for reference data, profiles, listings, and listing images."""

import pytest

from tests.integration.helpers import CHECK_VIOLATION, PERMISSION_DENIED, expect_error

pytestmark = [pytest.mark.integration, pytest.mark.anyio]


async def test_api_role_without_role_switch_is_denied(db):
    await expect_error(db.raw_app("select * from app.listings"), PERMISSION_DENIED)


async def test_guest_reads_reference_data(db):
    assert await db.as_user(None, "select 1 from app.categories")
    assert await db.as_user(None, "select 1 from app.locations")


# --- profiles ---------------------------------------------------------------


async def test_profile_created_on_signup(db, users):
    alice = users.create("alice")
    rows = await db.as_user(None, "select username from app.profiles where id = $1", alice.id)
    assert rows[0]["username"].startswith("user_")


async def test_user_updates_own_profile_only(db, users):
    alice, bob = users.create("alice"), users.create("bob")
    await db.as_user(alice, "update app.profiles set bio = 'hi' where id = $1", alice.id)
    changed = await db.as_user(
        alice, "update app.profiles set bio = 'hacked' where id = $1 returning id", bob.id
    )
    assert changed == []
    rows = await db.as_user(None, "select bio from app.profiles where id = $1", bob.id)
    assert rows[0]["bio"] is None


async def test_user_cannot_change_age_confirmation(db, users):
    alice = users.create("alice")
    await expect_error(
        db.as_user(
            alice, "update app.profiles set age_confirmed_at = null where id = $1", alice.id
        ),
        PERMISSION_DENIED,
    )


# --- listings ---------------------------------------------------------------


async def test_guest_sees_published_but_not_drafts_or_deleted(db, users):
    seller = users.create("seller")
    active = await db.make_listing(seller, "active")
    draft = await db.make_listing(seller, "draft")
    deleted = await db.make_listing(seller, "deleted")
    rows = await db.as_user(
        None, "select id from app.listings where id = any($1::uuid[])", [active, draft, deleted]
    )
    assert {r["id"] for r in rows} == {active}


async def test_owner_sees_own_draft_stranger_does_not(db, users):
    seller, stranger = users.create("seller"), users.create("stranger")
    draft = await db.make_listing(seller, "draft")
    assert await db.as_user(seller, "select 1 from app.listings where id = $1", draft)
    assert await db.as_user(stranger, "select 1 from app.listings where id = $1", draft) == []


INSERT_LISTING = """
    insert into app.listings (seller_id, category_id, city_id, title, price_centavos, condition)
    values ($1, (select id from app.categories where slug = 'laptops'),
            (select id from app.locations where slug = 'manila'), 'Old laptop', 500000, 'well_used')
    returning id, status
"""


async def test_user_creates_draft_listing(db, users):
    seller = users.create("seller")
    rows = await db.as_user(seller, INSERT_LISTING, seller.id)
    assert rows[0]["status"] == "draft"


async def test_user_cannot_create_listing_for_someone_else(db, users):
    alice, bob = users.create("alice"), users.create("bob")
    await expect_error(db.as_user(alice, INSERT_LISTING, bob.id), PERMISSION_DENIED)


async def test_guest_cannot_create_listing(db, users):
    seller = users.create("seller")
    await expect_error(db.as_user(None, INSERT_LISTING, seller.id), PERMISSION_DENIED)


async def test_cannot_insert_listing_as_active(db, users):
    seller = users.create("seller")
    await expect_error(
        db.as_user(
            seller,
            """insert into app.listings (seller_id, category_id, city_id, title,
                 price_centavos, condition, status)
               values ($1, (select id from app.categories where slug = 'laptops'),
                 (select id from app.locations where slug = 'manila'), 'x laptop', 1, 'like_new',
                 'active')""",
            seller.id,
        ),
        PERMISSION_DENIED,  # no column grant on status for INSERT
    )


async def test_listing_needs_subcategory(db, users):
    seller = users.create("seller")
    await expect_error(
        db.as_user(
            seller,
            """insert into app.listings (seller_id, category_id, city_id, title,
                 price_centavos, condition)
               values ($1, (select id from app.categories where slug = 'electronics'),
                 (select id from app.locations where slug = 'manila'), 'A phone', 1, 'like_new')""",
            seller.id,
        ),
        CHECK_VIOLATION,
    )


async def test_stranger_cannot_update_listing(db, users):
    seller, stranger = users.create("seller"), users.create("stranger")
    listing = await db.make_listing(seller, "active")
    rows = await db.as_user(
        stranger, "update app.listings set price_centavos = 1 where id = $1 returning id", listing
    )
    assert rows == []


async def test_owner_cannot_transfer_listing(db, users):
    seller, other = users.create("seller"), users.create("other")
    listing = await db.make_listing(seller, "active")
    await expect_error(
        db.as_user(
            seller, "update app.listings set seller_id = $2 where id = $1", listing, other.id
        ),
        PERMISSION_DENIED,
    )


async def test_owner_cannot_change_moderation(db, users):
    seller = users.create("seller")
    listing = await db.make_listing(seller, "active")
    await expect_error(
        db.as_user(seller, "update app.listings set moderation = 'ok' where id = $1", listing),
        PERMISSION_DENIED,
    )


async def test_publish_requires_a_photo(db, users):
    seller = users.create("seller")
    listing = await db.make_listing(seller, "draft", images=0)
    await expect_error(
        db.as_user(seller, "update app.listings set status = 'active' where id = $1", listing),
        CHECK_VIOLATION,
    )


async def test_owner_status_flow(db, users):
    seller = users.create("seller")
    listing = await db.make_listing(seller, "draft")
    for status in ("active", "paused", "active", "sold", "paused", "deleted"):
        rows = await db.as_user(
            seller,
            "update app.listings set status = $2 where id = $1 returning status",
            listing,
            status,
        )
        assert rows[0]["status"] == status


@pytest.mark.parametrize(("start", "target"), [("draft", "sold"), ("deleted", "active")])
async def test_illegal_status_changes_rejected(db, users, start, target):
    seller = users.create("seller")
    listing = await db.make_listing(seller, start)
    await expect_error(
        db.as_user(seller, "update app.listings set status = $2 where id = $1", listing, target),
        CHECK_VIOLATION,
    )


# --- listing images ----------------------------------------------------------

INSERT_IMAGE = """
    insert into app.listing_images (listing_id, position, full_path, thumb_path, width, height)
    values ($1, $2, 'x/y.webp', 'x/y.webp', 10, 10)
"""


async def test_stranger_cannot_add_images(db, users):
    seller, stranger = users.create("seller"), users.create("stranger")
    listing = await db.make_listing(seller, "active")
    await expect_error(db.as_user(stranger, INSERT_IMAGE, listing, 5), PERMISSION_DENIED)


async def test_at_most_eight_images(db, users):
    seller = users.create("seller")
    listing = await db.make_listing(seller, "draft", images=8)
    await expect_error(db.as_user(seller, INSERT_IMAGE, listing, 7), CHECK_VIOLATION)


async def test_draft_images_hidden_from_others(db, users):
    seller, stranger = users.create("seller"), users.create("stranger")
    listing = await db.make_listing(seller, "draft")
    sql = "select 1 from app.listing_images where listing_id = $1"
    assert await db.as_user(stranger, sql, listing) == []
    assert await db.as_user(None, sql, listing) == []
    assert await db.as_user(seller, sql, listing)
