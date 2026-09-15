"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import Image from "next/image";
import { ArrowRight, Loader2, Minus, Plus, Settings, ShoppingCart, X } from "lucide-react";
import type { CartLine } from "./types";
import { parsePrice, formatPrice } from "./utils";
import { calculateCheckoutTotals } from "@/lib/checkout-amount";

type DeliveryQuoteState = { amount: number; isRealQuote: boolean } | null;

export function CartDrawer({
  isOpen,
  items,
  isAuthenticated,
  addressId,
  notice,
  onDismissNotice,
  onClose,
  onIncrement,
  onDecrement,
  onRemove,
  onProceedToLogin,
  onCheckout,
}: {
  isOpen: boolean;
  items: CartLine[];
  isAuthenticated: boolean;
  /** The customer's currently selected (usually default) saved address — used to fetch a real, live delivery-fee estimate right in the cart. Null when not logged in yet or no address is saved. */
  addressId: string | null;
  notice?: string | null;
  onDismissNotice?: () => void;
  onClose: () => void;
  onIncrement: (name: string) => void;
  onDecrement: (name: string) => void;
  onRemove: (name: string) => void;
  onProceedToLogin: () => void;
  onCheckout: () => void;
}) {
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuoteState>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const itemsKey = items.map((line) => `${line.product.id}:${line.quantity}`).join(",");
  const canQuote = isOpen && isAuthenticated && Boolean(addressId) && items.length > 0;
  const quoteKey = `${canQuote}|${addressId ?? ""}|${itemsKey}`;

  // Reset (not fetch) whenever what we'd quote against actually changes —
  // done here, during render, rather than inside the effect below, since
  // setState directly in an effect body risks a cascading extra render;
  // adjusting state in response to a prop/derived-value change during
  // render is the pattern React itself recommends for this, and the one
  // RefundReadyPopup.tsx already uses elsewhere in this app.
  const [lastQuoteKey, setLastQuoteKey] = useState(quoteKey);
  if (quoteKey !== lastQuoteKey) {
    setLastQuoteKey(quoteKey);
    setDeliveryQuote(null);
    setIsQuoting(canQuote);
  }

  // A real, live delivery-fee estimate shown immediately in the cart — not
  // deferred to checkout — using the customer's already-selected address
  // (the same one /api/checkout/delivery-quote and the real checkout charge
  // both read). Debounced (500ms) so rapid +/- clicks don't spam Borzo;
  // re-fetches whenever `quoteKey` actually changes. Every setState call
  // here happens inside an async callback (the timer or the fetch chain),
  // never synchronously in the effect body itself. Never fires while
  // closed, logged out, or with no address on file — there's nothing real
  // to quote against yet in those cases, and the UI falls back to
  // "Calculated at checkout" instead.
  useEffect(() => {
    if (!canQuote || !addressId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch("/api/checkout/delivery-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressId,
          items: items.map((line) => ({ id: line.product.id, quantity: line.quantity })),
        }),
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setDeliveryQuote({ amount: Number(data.deliveryCharge) || 0, isRealQuote: Boolean(data.isRealQuote) });
        })
        .catch(() => {
          if (!cancelled) setDeliveryQuote(null);
        })
        .finally(() => {
          if (!cancelled) setIsQuoting(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quoteKey is the intentional, debounce-friendly stand-in for {canQuote, addressId, items}; items/addressId are read fresh from the enclosing render's closure once the key actually changes, so there's no staleness.
  }, [quoteKey]);

  if (!isOpen) {
    return null;
  }

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + parsePrice(item.product.price) * item.quantity,
    0
  );
  const { taxAmount: gst, amount: totalExclDelivery } = calculateCheckoutTotals(
    items.map(({ product, quantity }) => ({
      price: parsePrice(product.price),
      gstRate: product.gstRate,
      quantity,
    }))
  );
  const hasRealDeliveryQuote = deliveryQuote?.isRealQuote ?? false;
  const total = totalExclDelivery + (hasRealDeliveryQuote ? deliveryQuote!.amount : 0);

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close cart"
        onClick={onClose}
        className="absolute inset-0 bg-[#07112a]/58 backdrop-blur-[1px]"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col bg-white shadow-[-18px_0_45px_rgba(7,17,42,0.2)]">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div>
            <span className="flex items-center gap-2 text-lg font-black text-[#070e2b]">
              <ShoppingCart className="size-5" />
              My Cart
            </span>
            <span className="mt-1 block text-xs font-medium text-zinc-500">
              {itemCount} {itemCount === 1 ? "Item" : "Items"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="grid size-9 shrink-0 place-items-center rounded-full text-[#070e2b] transition hover:bg-zinc-100"
          >
            <X className="size-5" />
          </button>
        </div>

        {notice ? (
          <div className="flex items-start justify-between gap-2 border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-xs font-bold text-amber-800">
            <span>{notice}</span>
            {onDismissNotice ? (
              <button
                type="button"
                onClick={onDismissNotice}
                aria-label="Dismiss"
                className="shrink-0 text-amber-500 hover:text-amber-700"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-zinc-100 text-zinc-400">
              <ShoppingCart className="size-7" />
            </span>
            <p className="text-sm font-bold text-[#070e2b]">Your cart is empty</p>
            <p className="text-xs text-zinc-500">
              Add genuine parts to see them here.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {items.map(({ product, quantity }) => (
                <div key={product.name} className="flex gap-3">
                  <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#fbfbfa] ring-1 ring-zinc-100">
                    <Image
                      src={product.image}
                      alt={product.name}
                      width={90}
                      height={90}
                      className="h-full w-full object-contain"
                    />
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[#070e2b]">
                          {product.name}
                        </span>
                        <span className="mt-0.5 block text-xs font-medium text-zinc-500">
                          &#8377;{product.price}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${product.name} from cart`}
                        onClick={() => onRemove(product.name)}
                        className="shrink-0 text-zinc-400 transition hover:text-[#025632]"
                      >
                        <X className="size-4" />
                      </button>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex h-8 min-w-[92px] items-center justify-between gap-0.5 rounded-full bg-[#025632] p-1 shadow-sm shadow-[#a7f3d0]">
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${product.name}`}
                          onClick={() => onDecrement(product.name)}
                          className="grid size-6 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/20 active:scale-95"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="grid min-w-3 place-items-center text-xs font-black text-white">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Increase quantity of ${product.name}`}
                          onClick={() => onIncrement(product.name)}
                          className="grid size-6 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/20 active:scale-95"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <span className="text-sm font-black text-[#070e2b]">
                        &#8377;{formatPrice(parsePrice(product.price) * quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-zinc-100 px-5 py-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span className="font-bold text-[#070e2b]">
                    &#8377;{formatPrice(subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-600">
                  <span>Delivery Charge</span>
                  {isQuoting ? (
                    <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                      <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Calculating…
                    </span>
                  ) : hasRealDeliveryQuote ? (
                    <span className={`font-bold ${deliveryQuote!.amount === 0 ? "text-emerald-600" : "text-[#070e2b]"}`}>
                      {deliveryQuote!.amount === 0 ? "Free" : `₹${formatPrice(deliveryQuote!.amount)}`}
                    </span>
                  ) : (
                    <span className="font-bold text-zinc-500">Calculated at checkout</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-zinc-600">
                  <span>GST</span>
                  <span className="font-bold text-[#070e2b]">
                    &#8377;{formatPrice(gst)}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-dashed border-zinc-200 pt-3">
                <span className="text-base font-black text-[#070e2b]">
                  {hasRealDeliveryQuote ? "Total" : "Total (excl. delivery)"}
                </span>
                <span className="text-lg font-black text-[#070e2b]">
                  &#8377;{formatPrice(total)}
                </span>
              </div>
              {!hasRealDeliveryQuote ? (
                <p className="mt-1 text-[11px] text-zinc-400">
                  {isQuoting ? "Calculating your real delivery fee…" : "The real delivery fee is added once you choose your delivery address."}
                </p>
              ) : null}

              <button
                type="button"
                onClick={isAuthenticated ? onCheckout : onProceedToLogin}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#025632] text-base font-bold text-white shadow-sm shadow-[#a7f3d0] transition hover:bg-[#013720]"
              >
                {isAuthenticated ? "Proceed to Checkout" : "Proceed to Login"}
                <ArrowRight className="size-5" />
              </button>

              {/* <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-medium text-zinc-500">
                <ShieldCheck className="size-4 text-emerald-600" />
                Secure Payment | 100% Safe
              </p> */}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}


export function LoginModal({
  onClose,
  onRequestOtp,
  onVerifyOtp,
  onLoginSuccess,
}: {
  onClose: () => void;
  onRequestOtp: (phone: string) => Promise<string | null>;
  onVerifyOtp: (phone: string, otp: string) => Promise<string | null>;
  onLoginSuccess: (phone: string) => void;
}) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (step !== "otp" || resendCooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [step, resendCooldown]);

  const isPhoneValid = phone.trim().length === 10;
  const isOtpComplete = otp.every((digit) => digit !== "");

  const handleContinue = async () => {
    if (!isPhoneValid) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    const requestError = await onRequestOtp(phone);
    setIsSubmitting(false);
    if (requestError) {
      setError(requestError);
      return;
    }
    setStep("otp");
    setResendCooldown(30);
  };

  const handleVerify = async () => {
    if (!isOtpComplete) return;
    setError(null);
    setIsSubmitting(true);
    const verifyError = await onVerifyOtp(phone, otp.join(""));
    setIsSubmitting(false);
    if (verifyError) {
      setError(verifyError);
      return;
    }
    onLoginSuccess(phone);
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);

    setOtp((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });

    if (digit && index < otp.length - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/55 px-4 py-6 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[460px] rounded-xl bg-white p-4 shadow-2xl shadow-zinc-950/25 ring-1 ring-zinc-200 sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute left-3 top-3 grid size-7 place-items-center rounded-full text-zinc-500 transition hover:bg-zinc-100 sm:left-4 sm:top-4 sm:size-8"
        >
          <X className="size-4 sm:size-5" />
        </button>

        <div className="flex flex-col items-center pt-1 text-center sm:pt-2">
          <span className="grid size-10 place-items-center rounded-xl bg-[#025632] text-white shadow-sm sm:size-14">
            <Settings className="size-5 sm:size-8" />
          </span>
          <span className="mt-2 text-lg font-black leading-none sm:mt-3 sm:text-2xl">
            Deep <span className="text-[#025632]">Automobiles</span>
          </span>
          <span className="mt-1 text-[11px] font-medium text-zinc-500 sm:text-xs">
            Ride Better. Keep It Genuine.
          </span>
        </div>

        {step === "phone" ? (
          <>
            <h2 className="mt-4 text-center text-base font-black text-zinc-950 sm:mt-6 sm:text-xl">
              Welcome to Deep Automobiles
            </h2>
            <p className="mt-1 text-center text-xs text-zinc-500 sm:text-sm">
              Log in or Sign up to continue
            </p>

            <div className="mt-3 flex h-11 items-center overflow-hidden rounded-lg border border-zinc-200 bg-white transition focus-within:border-[#025632] focus-within:ring-2 focus-within:ring-[#025632]/15 sm:mt-5 sm:h-12">
              <span className="flex h-full items-center border-r border-zinc-200 px-3 text-sm font-bold text-zinc-700">
                +91
              </span>
              <input
                value={phone}
                onChange={(event) =>
                  setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleContinue();
                  }
                }}
                inputMode="numeric"
                autoFocus
                placeholder="Enter mobile number"
                aria-label="Mobile number"
                className="h-full w-full min-w-0 bg-transparent px-3 text-sm outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={!isPhoneValid || isSubmitting}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#025632] text-sm font-bold text-white shadow-sm shadow-[#a7f3d0] transition hover:bg-[#013720] disabled:cursor-not-allowed disabled:opacity-40 sm:mt-4 sm:h-12 sm:text-base"
            >
              Continue
              <ArrowRight className="size-4 sm:size-5" />
            </button>
            {error ? <p className="mt-3 text-center text-xs font-medium text-red-600">{error}</p> : null}

            <p className="mt-3 text-center text-[11px] text-zinc-500 sm:mt-5 sm:text-xs">
              By continuing, you agree to our{" "}
              <a href="#" className="underline hover:text-zinc-700">
                Terms of Service
              </a>{" "}
              &{" "}
              <a href="#" className="underline hover:text-zinc-700">
                Privacy Policy
              </a>
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-4 text-center text-base font-black text-zinc-950 sm:mt-6 sm:text-xl">
              Verify your number
            </h2>
            <p className="mt-1 text-center text-xs text-zinc-500 sm:text-sm">
              Enter the OTP sent to +91 {phone}{" "}
              <button
                type="button"
                onClick={() => setStep("phone")}
                className="font-bold text-[#025632] hover:underline"
              >
                Edit
              </button>
            </p>

            <div className="mt-4 flex justify-center gap-1.5 sm:mt-6 sm:gap-2">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    otpInputRefs.current[index] = element;
                  }}
                  value={digit}
                  onChange={(event) => handleOtpChange(index, event.target.value)}
                  onKeyDown={(event) => handleOtpKeyDown(index, event)}
                  inputMode="numeric"
                  maxLength={1}
                  aria-label={`OTP digit ${index + 1}`}
                  autoFocus={index === 0}
                  className="h-11 w-9 rounded-lg border border-zinc-200 text-center text-base font-black text-zinc-950 outline-none transition focus:border-[#025632] focus:ring-2 focus:ring-[#025632]/15 sm:h-12 sm:w-11 sm:text-lg"
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => void handleVerify()}
              disabled={!isOtpComplete || isSubmitting}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#025632] text-sm font-bold text-white shadow-sm shadow-[#a7f3d0] transition hover:bg-[#013720] disabled:cursor-not-allowed disabled:opacity-40 sm:mt-6 sm:h-12 sm:text-base"
            >
              Verify & Continue
              <ArrowRight className="size-4 sm:size-5" />
            </button>
            {error ? <p className="mt-3 text-center text-xs font-medium text-red-600">{error}</p> : null}

            <p className="mt-3 text-center text-[11px] text-zinc-500 sm:mt-4 sm:text-xs">
              {resendCooldown > 0 ? (
                <>Resend OTP in {resendCooldown}s</>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleContinue()}
                  className="font-bold text-[#025632] hover:underline"
                >
                  Resend OTP
                </button>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

