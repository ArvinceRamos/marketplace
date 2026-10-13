"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { UserSafetyMenu } from "@/components/safety/user-safety-menu";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  OFFER_STATUS_LABELS,
  listingNotice,
  mergeMessages,
  personName,
  replyBlockedReason,
  type ConversationDetail,
  type Message,
  type MessagePage,
  withCurrentOffer,
} from "@/lib/social";
import { usePolling } from "@/lib/use-polling";
import { OfferPanel } from "./offer-panel";

const MESSAGE_POLL_MS = 10_000;
const DETAIL_POLL_MS = 30_000;

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export function Thread({ id }: { id: string }) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [olderCursor, setOlderCursor] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lastId = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  const loadDetail = useCallback(async () => {
    try {
      setDetail(await apiFetch<ConversationDetail>(`/conversations/${id}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
    }
  }, [id]);

  const markRead = useCallback(() => {
    apiFetch(`/conversations/${id}/read`, { method: "POST" }).catch(() => {});
  }, [id]);

  const addMessages = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return;
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
    setMessages((current) => mergeMessages(current, incoming));
  }, []);

  // First load. Runs again when this page becomes visible after navigating away.
  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<ConversationDetail>(`/conversations/${id}`),
      apiFetch<MessagePage>(`/conversations/${id}/messages`),
    ])
      .then(([d, page]) => {
        if (!active) return;
        setDetail(d);
        addMessages(page.items);
        setOlderCursor(page.next_before);
        markRead();
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 404) setMissing(true);
        else setError(errorText(e, "Could not load this chat."));
      });
    return () => {
      active = false;
    };
  }, [id, addMessages, markRead, attempt]);

  // New messages every few seconds while the tab is visible.
  const pollMessages = useCallback(async () => {
    if (lastId.current === 0) return;
    try {
      const page = await apiFetch<MessagePage>(
        `/conversations/${id}/messages?after=${lastId.current}`,
      );
      if (page.items.length === 0) return;
      addMessages(page.items);
      markRead();
      // Offer events change the offer panel; refresh it.
      if (page.items.some((m) => m.kind !== "text")) await loadDetail();
    } catch {
      // Temporary network problems are fine; the next poll tries again.
    }
  }, [id, addMessages, markRead, loadDetail]);
  usePolling(pollMessages, MESSAGE_POLL_MS, detail !== null);
  usePolling(loadDetail, DETAIL_POLL_MS, detail !== null);

  // Keep the newest message in view.
  const newest = messages.at(-1)?.id;
  useEffect(() => {
    if (newest) bottom.current?.scrollIntoView({ block: "end" });
  }, [newest]);

  async function loadOlder() {
    if (!olderCursor) return;
    setError(null);
    try {
      const page = await apiFetch<MessagePage>(
        `/conversations/${id}/messages?before=${olderCursor}`,
      );
      setMessages((current) => mergeMessages(current, page.items));
      setOlderCursor(page.next_before);
    } catch (e) {
      setError(errorText(e, "Could not load earlier messages."));
    }
  }

  if (missing) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body text-fg-muted">This chat doesn&apos;t exist or isn&apos;t yours.</p>
        <Link href="/inbox" className="link">
          Back to inbox
        </Link>
      </div>
    );
  }
  if (!detail) {
    if (!error) return <p aria-busy="true">Loading chat…</p>;
    return (
      <LoadError
        message={error}
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  const notice = listingNotice(detail.listing);
  return (
    <section aria-label={`Chat with ${personName(detail.other_user)}`} className="flex flex-col gap-4">
      <header className="flex items-center gap-3 border-b border-border pb-3">
        <Link href="/inbox" className="link text-small lg:hidden" aria-label="Back to inbox">
          ← Inbox
        </Link>
        <div className="media-frame w-12 shrink-0">
          {detail.listing?.cover_thumb_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detail.listing.cover_thumb_url} alt="" />
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-body font-semibold">{personName(detail.other_user)}</h2>
          {detail.listing && detail.listing.status !== "deleted" ? (
            <Link href={`/listing/${detail.listing.id}`} className="truncate text-small text-fg-muted hover:underline">
              {detail.listing.title} · {formatPrice(detail.listing.price_centavos)}
            </Link>
          ) : (
            <span className="text-small text-fg-muted">Listing removed</span>
          )}
        </div>
        {detail.other_user && (
          <div className="ml-auto shrink-0">
            <UserSafetyMenu
              username={detail.other_user.username}
              name={personName(detail.other_user)}
              blocked={detail.blocked_by_me}
              onChange={() => void loadDetail()}
            />
          </div>
        )}
      </header>

      <p className="rounded-md bg-surface-muted p-3 text-caption text-fg-muted">
        Payments and delivery are arranged by you. Meet in a public place, check the item before
        paying, and never send money to someone you haven&apos;t met. Be careful with links.{" "}
        <Link href="/safety" className="link">
          Safety tips
        </Link>
      </p>
      {notice && (
        <p role="status" className="rounded-md bg-warning-soft p-3 text-small">
          {notice}
        </p>
      )}

      <FormAlert message={error} />
      {olderCursor && (
        <Button variant="ghost" size="sm" className="self-center" onClick={loadOlder}>
          Load earlier messages
        </Button>
      )}
      <ol className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 && (
          <li className="text-center text-small text-fg-muted">
            Say hello and ask about the item.
          </li>
        )}
        {messages.map((m) => (
          <MessageItem key={m.id} message={withCurrentOffer(m, detail.latest_offer)} />
        ))}
      </ol>

      <div className="sticky bottom-0 -mx-1 flex flex-col gap-3 border-t border-border bg-canvas px-1 pt-3 pb-4">
        <OfferPanel
          detail={detail}
          onChanged={async () => {
            await Promise.all([loadDetail(), pollMessages()]);
          }}
        />
        <Composer
          conversationId={id}
          closedReason={replyBlockedReason(detail)}
          onSent={(m) => addMessages([m])}
        />
      </div>
      {/* Below the sticky box, so scrolling here leaves the newest message visible above it. */}
      <div ref={bottom} />
    </section>
  );
}

function MessageItem({ message: m }: { message: Message }) {
  const time = (
    <time dateTime={m.created_at} className="text-caption text-fg-muted">
      {formatDateTime(m.created_at)}
    </time>
  );
  if (m.kind === "system") {
    return (
      <li className="flex flex-col items-center gap-0.5 text-center">
        <span className="text-caption font-medium text-fg-muted">
          {m.body}
          {m.offer && ` · ${formatPrice(m.offer.amount_centavos)}`}
        </span>
        {time}
      </li>
    );
  }
  const side = m.mine ? "items-end" : "items-start";
  if (m.kind === "offer" && m.offer) {
    return (
      <li className={`flex flex-col gap-0.5 ${side}`}>
        <div className="flex flex-col gap-0.5 rounded-md border border-accent/40 bg-accent-soft px-4 py-3">
          <span className="text-caption text-fg-muted">{m.mine ? "Your offer" : "Offer"}</span>
          <span className="text-title font-semibold" data-numeric>
            {formatPrice(m.offer.amount_centavos)}
          </span>
          <span className="text-caption">{OFFER_STATUS_LABELS[m.offer.status]}</span>
        </div>
        {time}
      </li>
    );
  }
  return (
    <li className={`flex flex-col gap-0.5 ${side}`}>
      <p
        className={`max-w-[85%] rounded-md px-3 py-2 text-body break-words whitespace-pre-wrap ${
          m.mine ? "bg-accent text-fg-on-brand" : "bg-ink-100 text-fg"
        }`}
      >
        <span className="sr-only">{m.mine ? "You: " : "Them: "}</span>
        {m.body}
      </p>
      {time}
    </li>
  );
}

function Composer({
  conversationId,
  closedReason,
  onSent,
}: {
  conversationId: string;
  closedReason: string | null;
  onSent: (m: Message) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      onSent(
        await apiFetch<Message>(`/conversations/${conversationId}/messages`, {
          method: "POST",
          body: JSON.stringify({ body: text }),
        }),
      );
      setBody("");
    } catch (e) {
      setError(errorText(e, "Could not send. Try again."));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void send();
  }

  if (closedReason) {
    return <p className="text-small text-fg-muted">{closedReason}</p>;
  }
  return (
    <form onSubmit={send} className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">
          Message
        </label>
        <textarea
          id="composer"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={2000}
          placeholder="Write a message"
          className="min-h-11 flex-1 resize-y rounded-sm border border-border-strong bg-surface px-3 py-2 text-body focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-accent"
        />
        <Button type="submit" disabled={busy || !body.trim()}>
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
