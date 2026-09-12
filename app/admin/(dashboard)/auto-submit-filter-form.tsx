"use client";

import { useEffect, useRef } from "react";

/**
 * A GET filter form that submits itself automatically whenever a field
 * inside it changes — so picking a filter value applies it immediately, no
 * separate "Filter" button needed. Uses a native `change` listener (not
 * React's onChange, which for text inputs really means "every keystroke")
 * so it only fires when a value is actually committed — a <select> pick, a
 * text input losing focus after being edited, Enter, or picking a
 * <datalist> suggestion — never on every keystroke while typing. A
 * visually-hidden submit button is still included so pressing Enter in a
 * text input keeps working immediately without needing to blur it first.
 */
export function AutoSubmitFilterForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const handleChange = () => form.requestSubmit();
    form.addEventListener("change", handleChange);
    return () => form.removeEventListener("change", handleChange);
  }, []);

  return (
    <form ref={formRef} action={action} className={className}>
      {children}
      <button type="submit" className="sr-only">
        Apply filters
      </button>
    </form>
  );
}
