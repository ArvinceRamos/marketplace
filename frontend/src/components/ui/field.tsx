import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type Base = { label: string; name: string; error?: string; hint?: string };

// 44px tall, 16px text (prevents iOS zoom), strong border that turns accent on focus.
const inputClass =
  "w-full rounded-sm border border-border-strong bg-surface px-4 py-2.5 text-body text-fg " +
  "placeholder:text-fg-subtle hover:border-ink-500 " +
  "focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-accent " +
  "aria-[invalid=true]:border-danger disabled:bg-ink-100 disabled:text-fg-subtle";

function Messages({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  return (
    <>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-caption text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-caption text-danger">
          {error}
        </p>
      )}
    </>
  );
}

function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

const labelClass = "text-small font-medium text-fg";

export function TextField({
  label,
  name,
  error,
  hint,
  ...rest
}: Base & InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${inputClass} min-h-11`}
        {...rest}
      />
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

export function TextArea({
  label,
  name,
  error,
  hint,
  ...rest
}: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${inputClass} min-h-28`}
        {...rest}
      />
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-small text-danger"
    >
      {message}
    </p>
  );
}
