"use client";

import { useState, type FormEvent } from "react";
import { parseError } from "@/lib/api";
import { LoadingIndicator } from "@/components/LoadingIndicator";

/** The "delete my data" form on /privacy: one field for the email or phone
 * the booking was made with. The server answers the same way whether or
 * not anything matched, and so does this form. */
export function EraseDataForm() {
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!contact.trim()) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/privacy/erase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact: contact.trim() }),
      });
      if (!res.ok) {
        setError(await parseError(res));
        return;
      }
      const body: { message?: string } = await res.json().catch(() => ({}));
      setResult(body.message ?? "Запрос выполнен.");
      setContact("");
    } catch {
      setError("Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-ink">Email или телефон, указанный при бронировании</span>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
          maxLength={255}
          autoComplete="email"
          className="rounded-lg border border-line bg-paper px-3 py-2 text-ink outline-none transition-colors focus:border-claret"
          placeholder="ivan@example.com или +7 (900) 000-00-00"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">
          {error}
        </p>
      )}
      {result && (
        <p role="status" className="rounded-lg bg-status-confirmed-tint px-3 py-2 text-sm text-status-confirmed">
          {result}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting || !contact.trim()}
        className="inline-flex h-11 items-center justify-center self-start rounded-lg bg-claret px-5 text-sm font-medium text-on-accent transition-colors duration-150 ease-out hover:bg-claret-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? <LoadingIndicator label="Удаляем…" /> : "Удалить мои данные"}
      </button>
    </form>
  );
}
