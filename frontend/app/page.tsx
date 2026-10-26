"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/misc";
import { ROLE_HOME, useAuth } from "@/lib/auth";

export default function Home() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready) router.replace(user ? ROLE_HOME[user.role] : "/login");
  }, [ready, user, router]);
  return <div className="grid min-h-dvh place-items-center"><Spinner className="h-8 w-8" /></div>;
}
