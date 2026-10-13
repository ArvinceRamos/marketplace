"""Favorites, chats, and offers. Everything here needs a signed-in user."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.core.db import UserDb
from app.core.ratelimit import per_user
from app.core.security import Claims, require_claims, user_id
from app.schemas.catalog import ListingPage
from app.schemas.social import (
    ConversationDetail,
    ConversationSummary,
    Message,
    MessageCreate,
    MessagePage,
    Offer,
    OfferCreate,
    Role,
    StartConversation,
    UnreadCount,
)
from app.services import social
from app.services.catalog import Urls

router = APIRouter(tags=["favorites, chat, offers"])

UserClaims = Annotated[Claims, Depends(require_claims)]
Page = Annotated[int, Query(ge=1, le=50)]
PageSize = Annotated[int, Query(ge=1, le=48)]


def _urls(request: Request) -> Urls:
    return Urls(request.app.state.settings.public_storage_url)


# --- favorites ---------------------------------------------------------------------


@router.put("/listings/{listing_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
async def add_favorite(listing_id: uuid.UUID, db: UserDb, claims: UserClaims) -> Response:
    """Idempotent: saving twice is fine."""
    await social.add_favorite(db, user_id(claims), listing_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/listings/{listing_id}/favorite", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(listing_id: uuid.UUID, db: UserDb, claims: UserClaims) -> Response:
    await social.remove_favorite(db, user_id(claims), listing_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/favorites", response_model=ListingPage)
async def my_favorites(
    request: Request, db: UserDb, claims: UserClaims, page: Page = 1, page_size: PageSize = 24
) -> ListingPage:
    return await social.my_favorites(db, user_id(claims), page, page_size, _urls(request))


@router.get("/me/favorite-ids", response_model=list[uuid.UUID])
async def my_favorite_ids(db: UserDb, claims: UserClaims) -> list[uuid.UUID]:
    """Saved listing IDs, so listing cards can show a filled heart."""
    return await social.favorite_ids(db, user_id(claims))


# --- conversations -----------------------------------------------------------------


@router.post(
    "/listings/{listing_id}/conversations",
    response_model=StartConversation,
    dependencies=[per_user("start_conversation")],
)
async def start_conversation(
    listing_id: uuid.UUID, db: UserDb, claims: UserClaims
) -> StartConversation:
    """Get or create your chat with the seller about this listing."""
    return StartConversation(id=await social.start_conversation(db, user_id(claims), listing_id))


@router.get("/conversations", response_model=list[ConversationSummary])
async def inbox(
    request: Request,
    db: UserDb,
    claims: UserClaims,
    role: Role | None = None,
    page: Page = 1,
    page_size: PageSize = 30,
) -> list[ConversationSummary]:
    return await social.inbox(db, user_id(claims), role, page, page_size, _urls(request))


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: uuid.UUID, request: Request, db: UserDb, claims: UserClaims
) -> ConversationDetail:
    return await social.conversation(db, user_id(claims), conversation_id, _urls(request))


@router.get("/conversations/{conversation_id}/messages", response_model=MessagePage)
async def get_messages(
    conversation_id: uuid.UUID,
    db: UserDb,
    claims: UserClaims,
    before: Annotated[int | None, Query(ge=1)] = None,
    after: Annotated[int | None, Query(ge=0)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 30,
) -> MessagePage:
    """Oldest first. `before`: older page. `after`: only new messages (for polling)."""
    return await social.messages(
        db, user_id(claims), conversation_id, before=before, after=after, limit=limit
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=Message,
    status_code=status.HTTP_201_CREATED,
    dependencies=[per_user("send_message")],
)
async def send_message(
    conversation_id: uuid.UUID, body: MessageCreate, db: UserDb, claims: UserClaims
) -> Message:
    return await social.send_message(db, user_id(claims), conversation_id, body.body)


@router.post("/conversations/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(conversation_id: uuid.UUID, db: UserDb, claims: UserClaims) -> Response:
    await social.mark_read(db, user_id(claims), conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/unread-count", response_model=UnreadCount)
async def unread_count(db: UserDb, claims: UserClaims) -> UnreadCount:
    return UnreadCount(unread=await social.unread_total(db, user_id(claims)))


# --- offers ------------------------------------------------------------------------


@router.get("/conversations/{conversation_id}/offers", response_model=list[Offer])
async def list_offers(conversation_id: uuid.UUID, db: UserDb, claims: UserClaims) -> list[Offer]:
    """Offer history, newest first."""
    return await social.offers(db, user_id(claims), conversation_id)


@router.post(
    "/conversations/{conversation_id}/offers",
    response_model=Offer,
    status_code=status.HTTP_201_CREATED,
    dependencies=[per_user("make_offer")],
)
async def make_offer(
    conversation_id: uuid.UUID, body: OfferCreate, db: UserDb, claims: UserClaims
) -> Offer:
    return await social.make_offer(db, user_id(claims), conversation_id, body.amount_centavos)


@router.post("/offers/{offer_id}/accept", response_model=Offer)
async def accept_offer(offer_id: uuid.UUID, db: UserDb, claims: UserClaims) -> Offer:
    return await social.respond_to_offer(db, user_id(claims), offer_id, "accepted")


@router.post("/offers/{offer_id}/reject", response_model=Offer)
async def reject_offer(offer_id: uuid.UUID, db: UserDb, claims: UserClaims) -> Offer:
    return await social.respond_to_offer(db, user_id(claims), offer_id, "rejected")


@router.post("/offers/{offer_id}/withdraw", response_model=Offer)
async def withdraw_offer(offer_id: uuid.UUID, db: UserDb, claims: UserClaims) -> Offer:
    return await social.respond_to_offer(db, user_id(claims), offer_id, "withdrawn")
