"use client";

import { StaffAuthShell } from "@/components/hostess/StaffAuthShell";
import { StaffForgotForm } from "@/components/hostess/StaffForgotForm";

export default function ForgotPasswordPage() {
  return (
    <StaffAuthShell title="Сброс пароля" subtitle="Мы отправим на почту ссылку для установки нового пароля.">
      <StaffForgotForm />
    </StaffAuthShell>
  );
}
