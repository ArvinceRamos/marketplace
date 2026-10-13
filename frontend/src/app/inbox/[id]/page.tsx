import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Thread } from "./thread";

type Props = PageProps<"/inbox/[id]">;

export default function ConversationPage({ params }: Props) {
  return (
    <Suspense fallback={<p aria-busy="true">Loading chat…</p>}>
      <ThreadLoader params={params} />
    </Suspense>
  );
}

async function ThreadLoader({ params }: Pick<Props, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // key: a different chat starts with fresh state.
  return <Thread key={id} id={id} />;
}
