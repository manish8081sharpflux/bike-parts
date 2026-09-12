type ClassNameResolver = {
  bivarianceHack(state: unknown): string | undefined;
}["bivarianceHack"];

type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | ClassNameResolver
  | ClassValue[]
  | { [key: string]: boolean | null | undefined };

export function cn(...inputs: ClassValue[]) {
  const classes: string[] = [];

  for (const input of inputs) {
    if (!input) {
      continue;
    }

    if (typeof input === "string" || typeof input === "number") {
      classes.push(String(input));
      continue;
    }

    if (typeof input === "function") {
      continue;
    }

    if (Array.isArray(input)) {
      classes.push(cn(...input));
      continue;
    }

    for (const [key, value] of Object.entries(input)) {
      if (value) {
        classes.push(key);
      }
    }
  }

  return classes.join(" ");
}
