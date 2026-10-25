// Carta en la estructura nueva (src/data/carta.json).
// El esquema es el contrato de la carta: si los datos no lo cumplen, el build falla.
// Detalle de las reglas en docs/PLAN-pedidos-whatsapp.md.
import { z } from "astro/zod";
import cartaData from "@data/carta.json";

const id = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "debe ir en minúsculas, sin tildes y con guiones");
const name = z.string().min(1);
const price = z.number().int().nonnegative();

const optionSchema = z
  .object({
    id,
    name,
    price: price.optional(),
    maxQty: z.number().int().min(1).optional(),
  })
  .strict();

const optionGroupSchema = z
  .object({
    name,
    min: z.number().int().min(0),
    max: z.number().int().min(1),
    options: z.array(optionSchema).min(1),
  })
  .strict();

const variantSchema = z.object({ id, name, price }).strict();

const itemSchema = z
  .object({
    id,
    name,
    description: z.string().optional(),
    price: price.optional(),
    variants: z.array(variantSchema).min(1).optional(),
    optionGroups: z.array(id).optional(),
    // Texto que el cliente debe escribir. "label" va en el mensaje ("Vegetales: ...").
    requiredNote: z.object({ label: name, placeholder: z.string().min(1) }).strict().optional(),
    image: z.string().optional(),
    disabled: z.boolean().optional(),
  })
  .strict();

const categorySchema = z
  .object({
    id,
    name,
    description: z.string().optional(),
    optionGroups: z.array(id).optional(),
    disabled: z.boolean().optional(),
    items: z.array(itemSchema),
  })
  .strict();

const cartaSchema = z
  .object({
    version: z.literal(2),
    currency: z.literal("CLP"),
    optionGroups: z.record(id, optionGroupSchema),
    categories: z.array(categorySchema).min(1),
  })
  .strict()
  .superRefine((carta, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    for (const [groupId, group] of Object.entries(carta.optionGroups)) {
      const path = ["optionGroups", groupId];
      if (group.min > group.max) issue(path, `min (${group.min}) es mayor que max (${group.max})`);
      const capacity = group.options.reduce((sum, o) => sum + (o.maxQty ?? 1), 0);
      if (group.min > capacity) issue(path, `min (${group.min}) no se puede cumplir con estas opciones`);
      const seen = new Set<string>();
      for (const option of group.options) {
        if (seen.has(option.id)) issue(path, `opción repetida: ${option.id}`);
        seen.add(option.id);
      }
    }

    const checkRefs = (refs: string[] | undefined, path: (string | number)[]) => {
      for (const ref of refs ?? []) {
        if (!carta.optionGroups[ref]) issue(path, `grupo de opciones inexistente: ${ref}`);
      }
    };

    const categoryIds = new Set<string>();
    const itemIds = new Set<string>();
    carta.categories.forEach((category, ci) => {
      const cpath = ["categories", ci];
      if (categoryIds.has(category.id)) issue(cpath, `categoría repetida: ${category.id}`);
      categoryIds.add(category.id);
      checkRefs(category.optionGroups, [...cpath, "optionGroups"]);

      category.items.forEach((item, ii) => {
        const ipath = [...cpath, "items", ii];
        if (itemIds.has(item.id)) issue(ipath, `producto repetido: ${item.id}`);
        itemIds.add(item.id);

        const hasPrice = item.price !== undefined;
        const hasVariants = item.variants !== undefined;
        if (hasPrice === hasVariants) {
          issue(ipath, `${item.id} debe tener "price" o "variants" (uno de los dos)`);
        }
        const variantIds = new Set<string>();
        for (const variant of item.variants ?? []) {
          if (variantIds.has(variant.id)) issue(ipath, `variante repetida en ${item.id}: ${variant.id}`);
          variantIds.add(variant.id);
        }

        checkRefs(item.optionGroups, [...ipath, "optionGroups"]);
        const inherited = category.optionGroups ?? [];
        for (const ref of item.optionGroups ?? []) {
          if (inherited.includes(ref)) issue(ipath, `${item.id} repite el grupo ${ref}, que ya hereda de la categoría`);
        }
      });
    });
  });

export type Carta = z.infer<typeof cartaSchema>;
export type OptionGroup = Carta["optionGroups"][string] & { id: string };
export type Item = Carta["categories"][number]["items"][number];
export type Category = Carta["categories"][number];

export interface ResolvedItem extends Item {
  /** Grupos del producto y luego los heredados de la categoría (en la pizza: proteína, salsa, extras). */
  groups: OptionGroup[];
}

export interface ResolvedCategory extends Omit<Category, "items"> {
  /** Grupos de la categoría (los heredan todos sus productos). */
  groups: OptionGroup[];
  items: ResolvedItem[];
}

function parseCarta(data: unknown): Carta {
  const result = cartaSchema.safeParse(data);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`carta.json no es válida:\n${lines.join("\n")}`);
  }
  return result.data;
}

/** Carta validada, sin lo deshabilitado y con los grupos de opciones resueltos. */
export function loadCarta(): ResolvedCategory[] {
  const carta = parseCarta(cartaData);
  const group = (groupId: string): OptionGroup => ({ id: groupId, ...carta.optionGroups[groupId] });

  return carta.categories
    .filter((category) => !category.disabled)
    .map((category) => {
      const categoryGroups = (category.optionGroups ?? []).map(group);
      return {
        ...category,
        groups: categoryGroups,
        items: category.items
          .filter((item) => !item.disabled)
          .map((item) => ({
            ...item,
            groups: [...(item.optionGroups ?? []).map(group), ...categoryGroups],
          })),
      };
    });
}
