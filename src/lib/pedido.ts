// Lógica del pedido (sin DOM): precios, validación de opciones, carro guardado y mensaje.
// Se usa en el navegador (/pedir) y en el servidor (formato de precios).
import type { OptionGroup, ResolvedCategory, ResolvedItem } from "@lib/carta";

/**
 * Mientras /pedir sea interno, TODOS los pedidos van a este número,
 * sin importar el local elegido. Quitar antes de recibir pedidos reales.
 */
export const TEST_PHONE = "56932393772";

export interface Branch {
  slug: string;
  name: string;
  wsp?: string;
  phone?: string;
}

/** Cantidad elegida por opción, agrupada por grupo: { "extras-pizza": { "palta": 2 } }. */
export type Selections = Record<string, Record<string, number>>;

/** Línea del carro. Solo guarda identificadores; los precios se calculan siempre desde la carta. */
export interface CartLine {
  itemId: string;
  variantId?: string;
  selections: Selections;
  note?: string;
  comment?: string;
  qty: number;
}

export interface Customer {
  name: string;
  delivery: "retiro" | "delivery";
  address?: string;
  payment?: string;
  comment?: string;
}

export const MAX_LINE_QTY = 50;

const clp = new Intl.NumberFormat("es-CL");

export function formatCLP(amount: number): string {
  return `$${clp.format(amount)}`;
}

/** "ARAUCO" → "Arauco", "LOMAS DE SAN ANDRES" → "Lomas de San Andres". Los demás nombres no cambian. */
export function branchDisplayName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  const small = new Set(["de", "del", "la", "las", "los", "y"]);
  return name
    .toLowerCase()
    .split(" ")
    .map((word, i) => (i > 0 && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

// --- Grupos de opciones -------------------------------------------------------

/** Grupo obligatorio con una sola opción: se marca solo y no se muestra (salsa de tomate, Pepsi). */
export function isAutoGroup(group: OptionGroup): boolean {
  return group.min >= 1 && group.options.length === 1;
}

/** Cómo se elige en pantalla: una opción, varias (sí/no) o varias con cantidad. */
export function groupControl(group: OptionGroup): "radio" | "check" | "stepper" {
  if (group.min === 1 && group.max === 1) return "radio";
  if (group.options.every((o) => (o.maxQty ?? 1) === 1)) return "check";
  return "stepper";
}

export function groupHint(group: OptionGroup): string {
  if (group.min === 0) return group.max === 1 ? "Opcional" : `Opcional · hasta ${group.max}`;
  if (group.min === group.max) return `Elige ${group.min}`;
  return `Elige entre ${group.min} y ${group.max}`;
}

export function groupCount(selections: Selections, groupId: string): number {
  return Object.values(selections[groupId] ?? {}).reduce((sum, qty) => sum + qty, 0);
}

/** Selección inicial de un producto: los grupos automáticos ya marcados. */
export function initialSelections(item: ResolvedItem): Selections {
  const selections: Selections = {};
  for (const group of item.groups) {
    if (isAutoGroup(group)) {
      selections[group.id] = { [group.options[0].id]: group.min };
    }
  }
  return selections;
}

/** Producto que se agrega directo con "+", sin abrir la hoja de opciones. */
export function isSimpleItem(item: ResolvedItem): boolean {
  return !item.variants && !item.requiredNote && item.groups.every(isAutoGroup);
}

// --- Validación y precio -------------------------------------------------------

/** Problemas de una línea respecto de la carta actual. Vacío = línea válida. */
export function lineErrors(item: ResolvedItem, line: CartLine): string[] {
  const errors: string[] = [];

  if (item.variants) {
    if (!item.variants.some((v) => v.id === line.variantId)) errors.push("Elige un tamaño");
  } else if (line.variantId !== undefined) {
    errors.push("Tamaño inexistente");
  }

  for (const groupId of Object.keys(line.selections)) {
    if (!item.groups.some((g) => g.id === groupId)) errors.push(`Grupo inexistente: ${groupId}`);
  }

  for (const group of item.groups) {
    const chosen = line.selections[group.id] ?? {};
    for (const [optionId, qty] of Object.entries(chosen)) {
      const option = group.options.find((o) => o.id === optionId);
      if (!option) errors.push(`Opción inexistente: ${optionId}`);
      else if (!Number.isInteger(qty) || qty < 1 || qty > (option.maxQty ?? 1)) {
        errors.push(`Cantidad no válida en ${option.name}`);
      }
    }
    const count = groupCount(line.selections, group.id);
    if (count < group.min) errors.push(`${group.name}: ${groupHint(group).toLowerCase()}`);
    if (count > group.max) errors.push(`${group.name}: máximo ${group.max}`);
  }

  if (item.requiredNote && !line.note?.trim()) errors.push(item.requiredNote.placeholder);
  if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_LINE_QTY) errors.push("Cantidad no válida");

  return errors;
}

/** Precio de una unidad: precio base (o del tamaño) más lo que suman las opciones. */
export function unitPrice(item: ResolvedItem, line: CartLine): number {
  const base = item.variants
    ? (item.variants.find((v) => v.id === line.variantId)?.price ?? 0)
    : (item.price ?? 0);
  let extras = 0;
  for (const group of item.groups) {
    for (const [optionId, qty] of Object.entries(line.selections[group.id] ?? {})) {
      extras += (group.options.find((o) => o.id === optionId)?.price ?? 0) * qty;
    }
  }
  return base + extras;
}

export function lineTotal(item: ResolvedItem, line: CartLine): number {
  return unitPrice(item, line) * line.qty;
}

/** Dos líneas con la misma clave son el mismo producto con lo mismo elegido: se suman. */
export function lineKey(line: CartLine): string {
  const selections = Object.keys(line.selections)
    .sort()
    .map((groupId) => {
      const chosen = line.selections[groupId];
      const options = Object.keys(chosen)
        .sort()
        .map((optionId) => `${optionId}:${chosen[optionId]}`);
      return `${groupId}=${options.join(",")}`;
    });
  return [line.itemId, line.variantId ?? "", selections.join(";"), line.note?.trim() ?? "", line.comment?.trim() ?? ""].join("|");
}

// --- Detalle legible (pantalla y mensaje) ---------------------------------------

/** "Papas fritas Grande" */
export function lineTitle(item: ResolvedItem, line: CartLine): string {
  const variant = item.variants?.find((v) => v.id === line.variantId);
  return variant ? `${item.name} ${variant.name}` : item.name;
}

/** Líneas de detalle: "Proteína: Pollo", "Extras: Palta x2 (+$5.000)", "Vegetales: …", "Nota: …". */
export function lineDetails(item: ResolvedItem, line: CartLine, withComment = true): string[] {
  const details: string[] = [];
  for (const group of item.groups) {
    const chosen = line.selections[group.id] ?? {};
    const parts = group.options
      .filter((o) => chosen[o.id])
      .map((o) => {
        const qty = chosen[o.id];
        const price = (o.price ?? 0) * qty;
        return `${o.name}${qty > 1 ? ` x${qty}` : ""}${price > 0 ? ` (+${formatCLP(price)})` : ""}`;
      });
    if (parts.length) details.push(`${group.name}: ${parts.join(", ")}`);
  }
  if (item.requiredNote && line.note?.trim()) details.push(`${item.requiredNote.label}: ${line.note.trim()}`);
  if (withComment && line.comment?.trim()) details.push(`Nota: ${line.comment.trim()}`);
  return details;
}

// --- Carta indexada y carro guardado --------------------------------------------

export type ItemIndex = Map<string, ResolvedItem>;

export function indexItems(categories: ResolvedCategory[]): ItemIndex {
  return new Map(categories.flatMap((c) => c.items.map((item) => [item.id, item] as const)));
}

/**
 * Lee el carro guardado y deja solo las líneas que siguen siendo válidas con la carta actual
 * (un producto o una opción pudo cambiar o desaparecer). Devuelve cuántas se quitaron.
 */
export function restoreCart(raw: unknown, items: ItemIndex): { lines: CartLine[]; dropped: number } {
  if (!Array.isArray(raw)) return { lines: [], dropped: 0 };
  const lines: CartLine[] = [];
  let dropped = 0;
  for (const entry of raw) {
    const line = toLine(entry);
    const item = line && items.get(line.itemId);
    if (line && item && lineErrors(item, line).length === 0) lines.push(line);
    else dropped++;
  }
  return { lines, dropped };
}

function toLine(entry: unknown): CartLine | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  if (typeof e.itemId !== "string" || typeof e.qty !== "number") return null;
  if (!e.selections || typeof e.selections !== "object") return null;
  const selections: Selections = {};
  for (const [groupId, chosen] of Object.entries(e.selections as Record<string, unknown>)) {
    if (!chosen || typeof chosen !== "object") return null;
    selections[groupId] = {};
    for (const [optionId, qty] of Object.entries(chosen as Record<string, unknown>)) {
      if (typeof qty !== "number") return null;
      selections[groupId][optionId] = qty;
    }
  }
  return {
    itemId: e.itemId,
    variantId: typeof e.variantId === "string" ? e.variantId : undefined,
    selections,
    note: typeof e.note === "string" ? e.note : undefined,
    comment: typeof e.comment === "string" ? e.comment : undefined,
    qty: e.qty,
  };
}

// --- Mensaje de WhatsApp ----------------------------------------------------------

export function buildMessage(branch: Branch, lines: CartLine[], items: ItemIndex, customer: Customer): string {
  const out: string[] = [`Hola Lomo Alemán ${branchDisplayName(branch.name)}, quiero hacer este pedido:`, ""];
  let total = 0;

  for (const line of lines) {
    const item = items.get(line.itemId);
    if (!item) continue;
    const amount = lineTotal(item, line);
    total += amount;
    out.push(`• ${line.qty}x ${lineTitle(item, line)} — ${formatCLP(amount)}`);
    for (const detail of lineDetails(item, line)) out.push(`   ${detail}`);
  }

  out.push("", `Total referencial: ${formatCLP(total)}`, "");
  if (customer.delivery === "delivery") {
    out.push("Entrega: Delivery", `Dirección: ${customer.address?.trim() ?? ""}`);
  } else {
    out.push("Entrega: Retiro en local");
  }
  out.push(`Nombre: ${customer.name.trim()}`);
  if (customer.payment) out.push(`Pago: ${customer.payment}`);
  if (customer.comment?.trim()) out.push(`Comentario: ${customer.comment.trim()}`);
  out.push("", "#pedidoweb");

  return out.join("\n");
}

export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
