// Desktop: shown beside the chat list until a chat is picked. Phones show only the list here.
export default function InboxPage() {
  return (
    <div className="hidden h-full min-h-64 place-items-center rounded-md border border-dashed border-border-strong p-6 text-center text-small text-fg-muted lg:grid">
      Pick a chat to read it.
    </div>
  );
}
