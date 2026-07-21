export type ClassValue = string | number | false | null | undefined | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const i of inputs) {
    if (!i) continue;
    if (Array.isArray(i)) {
      const inner = cn(...i);
      if (inner) out.push(inner);
    } else {
      out.push(String(i));
    }
  }
  return out.join(" ");
}
