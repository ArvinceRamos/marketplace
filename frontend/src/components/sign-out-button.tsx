"use client";

import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({
  variant = "ghost",
  className = "",
}: {
  variant?: ButtonVariant;
  className?: string;
}) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant={variant} onClick={signOut} className={className}>
      Log out
    </Button>
  );
}
