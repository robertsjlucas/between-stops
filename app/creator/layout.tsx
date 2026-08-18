import type {
  ReactNode,
} from "react";

import {
  redirect,
} from "next/navigation";

import {
  createClient,
} from "@/lib/supabase/server";

export const dynamic =
  "force-dynamic";

type CreatorLayoutProps = {
  children: ReactNode;
};

export default async function CreatorLayout({
  children,
}: CreatorLayoutProps) {
  const supabase =
    await createClient();

  const { data } =
    await supabase.auth
      .getClaims();

  if (!data?.claims?.sub) {
    redirect("/login");
  }

  return children;
}