"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { GuestAuthForm } from "@/components/guest/GuestAuthForm";

function RegisterForm() {
  const searchParams = useSearchParams();
  return <GuestAuthForm initialMode="register" initialEmail={searchParams.get("email") ?? ""} />;
}

export default function GuestRegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
