// Shared server-side address validation — used by the address create/update
// APIs (see app/api/addresses) so client-side form validation is never the
// only line of defense. Framework-agnostic (no next/headers or Prisma
// imports) so it's also safe to import from client components for
// consistent inline validation messages.

export type ValidatedAddress = {
  label: string | null;
  contactName: string;
  phone: string;
  flatNo: string | null;
  floor: string | null;
  area: string;
  landmark: string | null;
  city: string;
  state: string | null;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
};

export type AddressValidationResult =
  | { ok: true; data: ValidatedAddress }
  | { ok: false; error: string };

export function isValidAddressPhone(phone: string): boolean {
  return /^\d{10}$/.test(phone);
}

export function isValidIndianPincode(pincode: string): boolean {
  return /^\d{6}$/.test(pincode);
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateAddressInput(raw: unknown): AddressValidationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid address data." };
  }
  const value = raw as Record<string, unknown>;

  const contactName = asTrimmedString(value.contactName);
  if (!contactName) return { ok: false, error: "Contact name is required." };

  const phone = asTrimmedString(value.phone);
  if (!isValidAddressPhone(phone)) {
    return { ok: false, error: "A valid 10-digit phone number is required." };
  }

  const area = asTrimmedString(value.area);
  if (!area) return { ok: false, error: "Area / address line is required." };

  const city = asTrimmedString(value.city);
  if (!city) return { ok: false, error: "City is required." };

  const pincode = asTrimmedString(value.pincode);
  if (!isValidIndianPincode(pincode)) {
    return { ok: false, error: "A valid 6-digit pincode is required." };
  }

  let latitude: number | null = null;
  if (value.latitude !== undefined && value.latitude !== null && value.latitude !== "") {
    const parsed = Number(value.latitude);
    if (!Number.isFinite(parsed)) return { ok: false, error: "Latitude must be a finite number." };
    latitude = parsed;
  }

  let longitude: number | null = null;
  if (value.longitude !== undefined && value.longitude !== null && value.longitude !== "") {
    const parsed = Number(value.longitude);
    if (!Number.isFinite(parsed)) return { ok: false, error: "Longitude must be a finite number." };
    longitude = parsed;
  }

  const label = asTrimmedString(value.label);
  const flatNo = asTrimmedString(value.flatNo);
  const floor = asTrimmedString(value.floor);
  const landmark = asTrimmedString(value.landmark);
  const state = asTrimmedString(value.state);

  return {
    ok: true,
    data: {
      label: label || null,
      contactName,
      phone,
      flatNo: flatNo || null,
      floor: floor || null,
      area,
      landmark: landmark || null,
      city,
      state: state || null,
      pincode,
      latitude,
      longitude,
    },
  };
}
