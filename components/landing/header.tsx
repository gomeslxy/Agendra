import Image from "next/image";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { HeaderClient } from "@/components/landing/header-client";

export async function Header() {
  const user = await getUser();

  return <HeaderClient isLoggedIn={!!user} />;
}
