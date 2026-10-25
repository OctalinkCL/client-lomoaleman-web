// Carro de /pedir: elegir local, armar productos, guardar el pedido y enviarlo por WhatsApp.
// La lógica (precios, validación, mensaje) vive en src/lib/pedido.ts; aquí solo hay pantalla.
import type { OptionGroup, ResolvedCategory, ResolvedItem } from "@lib/carta";
import {
  MAX_LINE_QTY,
  TEST_PHONE,
  branchDisplayName,
  buildMessage,
  formatCLP,
  groupControl,
  groupCount,
  groupHint,
  indexItems,
  initialSelections,
  isAutoGroup,
  isSimpleItem,
  lineDetails,
  lineErrors,
  lineKey,
  lineTitle,
  lineTotal,
  restoreCart,
  whatsappUrl,
  type Branch,
  type CartLine,
  type Customer,
} from "@lib/pedido";

const STORAGE_BRANCH = "lomoaleman:pedir:local";
const STORAGE_CART = "lomoaleman:pedir:carro:v1";
/** Hora (ms) en que se tocó "Enviar" con el carro actual. */
const STORAGE_SENT = "lomoaleman:pedir:enviado";
/** Datos del cliente, solo si marcó "Recordar mis datos". Nunca salen del teléfono. */
const STORAGE_CUSTOMER = "lomoaleman:pedir:cliente:v1";

const data = JSON.parse(document.getElementById("pedir-data")?.textContent ?? "{}") as {
  categories: ResolvedCategory[];
  branches: Branch[];
};
const items = indexItems(data.categories);
const branches = new Map(data.branches.map((b) => [b.slug, b]));

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const ui = {
  main: el("pedir"),
  toast: el("pedir-toast"),
  bar: {
    branch: el("bar-branch"),
    change: el<HTMLButtonElement>("bar-change"),
    pick: el<HTMLButtonElement>("bar-pick"),
    cart: el<HTMLButtonElement>("bar-cart"),
    call: el<HTMLAnchorElement>("bar-call"),
  },
  branchDialog: el<HTMLDialogElement>("branch-dialog"),
  branchList: el("branch-list"),
  itemDialog: el<HTMLDialogElement>("item-dialog"),
  itemTitle: el("item-title"),
  itemDescription: el("item-description"),
  itemBody: el("item-body"),
  itemQty: el("item-qty"),
  itemMinus: el<HTMLButtonElement>("item-minus"),
  itemPlus: el<HTMLButtonElement>("item-plus"),
  itemAdd: el<HTMLButtonElement>("item-add"),
  cartDialog: el<HTMLDialogElement>("cart-dialog"),
  cartBranchName: el("cart-branch-name"),
  cartBranchAddress: el("cart-branch-address"),
  cartBranchChange: el<HTMLButtonElement>("cart-branch-change"),
  cartSubmit: el<HTMLButtonElement>("cart-submit"),
  cartMain: el("cart-main"),
  cartLines: el("cart-lines"),
  cartTotal: el("cart-total"),
  cartForm: el<HTMLFormElement>("cart-form"),
  cartErrors: el("cart-errors"),
  addressField: el("address-field"),
  cartSent: el("cart-sent"),
  cartClear: el<HTMLButtonElement>("cart-clear"),
  cartBack: el<HTMLButtonElement>("cart-back"),
  cartEmpty: el<HTMLButtonElement>("cart-empty"),
  cartForget: el<HTMLButtonElement>("cart-forget"),
  sentDialog: el<HTMLDialogElement>("sent-dialog"),
  sentWhen: el("sent-when"),
  sentNew: el<HTMLButtonElement>("sent-new"),
  sentKeep: el<HTMLButtonElement>("sent-keep"),
};

// --- Utilidades ----------------------------------------------------------------

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// localStorage puede fallar (modo privado, bloqueado): el carro sigue funcionando sin guardar.
function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function save(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // sin almacenamiento disponible
  }
}

let toastTimer: number | undefined;
function toast(message: string): void {
  ui.toast.textContent = message;
  ui.toast.classList.replace("opacity-0", "opacity-100");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.replace("opacity-100", "opacity-0"), 2200);
}

function priceTag(price: number | undefined): string {
  return price ? `<span class="text-neutral-400">+${formatCLP(price)}</span>` : "";
}

// --- Estado --------------------------------------------------------------------

let branch: Branch | undefined;
let lines: CartLine[] = [];
/** Producto tocado antes de elegir local: se abre después de elegirlo. */
let pendingItemId: string | undefined;

function canOrder(b: Branch | undefined): boolean {
  return Boolean(b?.wsp);
}

function saveCart(): void {
  save(STORAGE_CART, lines.length ? JSON.stringify(lines) : null);
}

function cartTotals(): { count: number; total: number } {
  let count = 0;
  let total = 0;
  for (const line of lines) {
    const item = items.get(line.itemId);
    if (!item) continue;
    count += line.qty;
    total += lineTotal(item, line);
  }
  return { count, total };
}

function addLine(line: CartLine): void {
  const key = lineKey(line);
  const existing = lines.find((l) => lineKey(l) === key);
  if (existing) existing.qty = Math.min(MAX_LINE_QTY, existing.qty + line.qty);
  else lines.push(line);
  saveCart();
  save(STORAGE_SENT, null); // si cambia el carro, ya no es el pedido enviado
  renderBar();
}

function emptyCart(): void {
  lines = [];
  saveCart();
  save(STORAGE_SENT, null);
  ui.cartForm.reset();
  ui.addressField.classList.add("hidden");
  if (ui.cartDialog.open) ui.cartDialog.close();
  renderBar();
  toast("Pedido vaciado");
}

/** "hace 5 minutos", "hace 2 horas", "hace 3 días". */
function timeAgo(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

// --- Datos del cliente (solo en este teléfono) ---------------------------------------

type SavedCustomer = Pick<Customer, "name" | "delivery" | "address" | "payment">;

function loadCustomer(): SavedCustomer | null {
  try {
    const c = JSON.parse(load(STORAGE_CUSTOMER) ?? "null");
    if (!c || typeof c.name !== "string") return null;
    return {
      name: c.name,
      delivery: c.delivery === "delivery" ? "delivery" : "retiro",
      address: typeof c.address === "string" ? c.address : undefined,
      payment: typeof c.payment === "string" ? c.payment : undefined,
    };
  } catch {
    return null;
  }
}

function formField<T extends HTMLElement>(name: string): T {
  return ui.cartForm.elements.namedItem(name) as unknown as T;
}

function fillCustomer(c: SavedCustomer): void {
  formField<HTMLInputElement>("name").value = c.name;
  for (const radio of ui.cartForm.querySelectorAll<HTMLInputElement>('input[name="delivery"]')) {
    radio.checked = radio.value === c.delivery;
  }
  formField<HTMLInputElement>("address").value = c.address ?? "";
  formField<HTMLSelectElement>("payment").value = c.payment ?? "";
  ui.addressField.classList.toggle("hidden", c.delivery !== "delivery");
}

// --- Barra fija ----------------------------------------------------------------

function renderBar(): void {
  const { bar } = ui;
  ui.main.dataset.orderable = !branch ? "none" : canOrder(branch) ? "true" : "false";
  for (const node of [bar.change, bar.pick, bar.cart, bar.call]) node.classList.add("hidden");

  if (!branch) {
    bar.branch.textContent = "Elige tu local y arma tu pedido.";
    bar.pick.classList.remove("hidden");
    return;
  }

  const name = esc(branchDisplayName(branch.name));
  bar.change.classList.remove("hidden");

  if (!canOrder(branch)) {
    bar.branch.innerHTML = `<strong class="text-white">${name}</strong> recibe pedidos por teléfono`;
    if (branch.phone) {
      bar.call.href = `tel:+${branch.phone}`;
      bar.call.textContent = `Llamar a ${branchDisplayName(branch.name)}`;
      bar.call.classList.remove("hidden");
    }
    return;
  }

  const { count, total } = cartTotals();
  if (count === 0) {
    bar.branch.innerHTML = `Pidiendo a <strong class="text-white">${name}</strong> · toca + para agregar`;
  } else {
    bar.branch.innerHTML = `Pidiendo a <strong class="text-white">${name}</strong>`;
    bar.cart.textContent = `Ver pedido (${count}) · ${formatCLP(total)}`;
    bar.cart.classList.remove("hidden");
  }
}

// --- Elegir local --------------------------------------------------------------

function setBranch(slug: string): void {
  branch = branches.get(slug);
  save(STORAGE_BRANCH, branch ? slug : null);
  renderBar();
}

function openBranchDialog(): void {
  ui.branchList.innerHTML = data.branches
    .map((b) => {
      const current = b.slug === branch?.slug;
      const tag = canOrder(b) ? "" : `<span class="text-xs text-neutral-400">Solo teléfono</span>`;
      return `
        <li>
          <button type="button" data-branch="${esc(b.slug)}"
            class="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-md text-left hover:bg-neutral-900 ${current ? "bg-neutral-900 text-lomo font-bold" : ""}">
            <span>${esc(branchDisplayName(b.name))}${current ? " ✓" : ""}</span>${tag}
          </button>
        </li>`;
    })
    .join("");
  ui.branchDialog.showModal();
}

ui.branchList.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-branch]");
  if (!button?.dataset.branch) return;
  setBranch(button.dataset.branch);
  ui.branchDialog.close();

  // Cambio de local desde el pedido abierto: se actualiza la tarjeta, o se cierra el pedido
  // si el nuevo local solo recibe pedidos por teléfono.
  if (ui.cartDialog.open) {
    if (canOrder(branch)) {
      renderCart();
    } else {
      ui.cartDialog.close();
      toast(`${branchDisplayName(branch!.name)} recibe pedidos por teléfono`);
    }
    return;
  }

  const itemId = pendingItemId;
  pendingItemId = undefined;
  if (itemId && canOrder(branch)) openItem(itemId);
});

// --- Agregar productos -----------------------------------------------------------

function openItem(itemId: string): void {
  const item = items.get(itemId);
  if (!item) return;
  if (isSimpleItem(item)) {
    addLine({ itemId, selections: initialSelections(item), qty: 1 });
    toast(`Agregado: ${item.name}`);
  } else {
    openItemDialog(item);
  }
}

ui.main.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-add]");
  if (!button?.dataset.add) return;
  if (!branch) {
    pendingItemId = button.dataset.add;
    openBranchDialog();
    return;
  }
  if (canOrder(branch)) openItem(button.dataset.add);
});

// --- Hoja de opciones de un producto ---------------------------------------------

let editing: { item: ResolvedItem; line: CartLine } | undefined;

function fieldset(title: string, hint: string, hintKey: string, body: string): string {
  return `
    <fieldset class="grid gap-2">
      <legend class="w-full flex items-baseline justify-between gap-3 mb-1">
        <span class="font-bold">${esc(title)}</span>
        <span data-hint="${esc(hintKey)}" class="text-xs">${esc(hint)}</span>
      </legend>
      ${body}
    </fieldset>`;
}

const optionRow =
  "flex items-center justify-between gap-3 rounded-md border-2 border-neutral-800 px-3 py-2 has-[:checked]:border-lomo";

function groupBody(group: OptionGroup): string {
  const control = groupControl(group);
  return group.options
    .map((option) => {
      const data = `data-group="${esc(group.id)}" data-option="${esc(option.id)}"`;
      const label = `<span>${esc(option.name)}</span>`;
      if (control === "stepper") {
        return `
          <div class="flex items-center justify-between gap-3 rounded-md border-2 border-neutral-800 px-3 py-1">
            <span class="flex flex-col">${label}${priceTag(option.price)}</span>
            <span class="flex items-center">
              <button type="button" ${data} data-step="-1" class="w-9 h-9 text-xl disabled:opacity-30" aria-label="Quitar ${esc(option.name)}">−</button>
              <span data-qty="${esc(group.id)}:${esc(option.id)}" class="w-6 text-center font-bold">0</span>
              <button type="button" ${data} data-step="1" class="w-9 h-9 text-xl disabled:opacity-30" aria-label="Agregar ${esc(option.name)}">+</button>
            </span>
          </div>`;
      }
      const type = control === "radio" ? "radio" : "checkbox";
      return `
        <label class="${optionRow}">
          <span class="flex items-center gap-3">
            <input type="${type}" name="g-${esc(group.id)}" ${data} class="accent-amber-500 w-4 h-4" />
            ${label}
          </span>
          ${priceTag(option.price)}
        </label>`;
    })
    .join("");
}

function openItemDialog(item: ResolvedItem): void {
  editing = { item, line: { itemId: item.id, selections: initialSelections(item), qty: 1 } };
  ui.itemTitle.textContent = item.name;
  ui.itemDescription.textContent = item.description ?? "";

  const parts: string[] = [];
  if (item.variants) {
    const body = item.variants
      .map(
        (v) => `
        <label class="${optionRow}">
          <span class="flex items-center gap-3">
            <input type="radio" name="variant" data-variant="${esc(v.id)}" class="accent-amber-500 w-4 h-4" />
            <span>${esc(v.name)}</span>
          </span>
          <span class="font-semibold">${formatCLP(v.price)}</span>
        </label>`,
      )
      .join("");
    parts.push(fieldset("Tamaño", "Elige 1", "variant", body));
  }
  for (const group of item.groups) {
    if (isAutoGroup(group)) continue;
    parts.push(fieldset(group.name, groupHint(group), group.id, groupBody(group)));
  }
  if (item.requiredNote) {
    parts.push(`
      <label class="grid gap-1">
        <span class="font-bold">${esc(item.requiredNote.label)}</span>
        <textarea data-note rows="2" maxlength="120" placeholder="${esc(item.requiredNote.placeholder)}"
          class="rounded-md bg-neutral-900 border-2 border-neutral-700 px-3 py-2"></textarea>
      </label>`);
  }
  parts.push(`
    <label class="grid gap-1">
      <span class="font-bold">Comentario <span class="text-neutral-400 font-normal">(opcional)</span></span>
      <input data-comment maxlength="120" placeholder="Ej: sin mayo"
        class="rounded-md bg-neutral-900 border-2 border-neutral-700 px-3 py-2" />
    </label>`);

  ui.itemBody.innerHTML = parts.join("");
  ui.itemBody.scrollTop = 0;
  refreshItemDialog();
  ui.itemDialog.showModal();
}

/** Actualiza cantidades, botones deshabilitados, avisos y el botón "Agregar" sin redibujar. */
function refreshItemDialog(): void {
  if (!editing) return;
  const { item, line } = editing;

  for (const group of item.groups) {
    if (isAutoGroup(group)) continue;
    const count = groupCount(line.selections, group.id);
    const full = count >= group.max;
    const chosen = line.selections[group.id] ?? {};

    for (const node of ui.itemBody.querySelectorAll<HTMLElement>(`[data-group="${CSS.escape(group.id)}"]`)) {
      const optionId = node.dataset.option ?? "";
      const qty = chosen[optionId] ?? 0;
      const maxQty = group.options.find((o) => o.id === optionId)?.maxQty ?? 1;
      if (node instanceof HTMLInputElement) {
        node.checked = qty > 0;
        if (node.type === "checkbox") node.disabled = full && qty === 0;
      } else if (node instanceof HTMLButtonElement) {
        node.disabled = node.dataset.step === "1" ? full || qty >= maxQty : qty === 0;
      }
    }
    for (const span of ui.itemBody.querySelectorAll<HTMLElement>(`[data-qty^="${CSS.escape(group.id)}:"]`)) {
      span.textContent = String(chosen[span.dataset.qty!.split(":")[1]] ?? 0);
    }
    const hint = ui.itemBody.querySelector<HTMLElement>(`[data-hint="${CSS.escape(group.id)}"]`);
    hint?.classList.toggle("text-amber-500", count < group.min);
    hint?.classList.toggle("text-neutral-400", count >= group.min);
  }
  const variantHint = ui.itemBody.querySelector<HTMLElement>('[data-hint="variant"]');
  variantHint?.classList.toggle("text-amber-500", !line.variantId);
  variantHint?.classList.toggle("text-neutral-400", Boolean(line.variantId));

  ui.itemQty.textContent = String(line.qty);
  ui.itemMinus.disabled = line.qty <= 1;
  ui.itemPlus.disabled = line.qty >= MAX_LINE_QTY;

  const errors = lineErrors(item, line);
  ui.itemAdd.disabled = errors.length > 0;
  ui.itemAdd.textContent = errors.length ? errors[0] : `Agregar · ${formatCLP(lineTotal(item, line))}`;
}

ui.itemBody.addEventListener("change", (event) => {
  if (!editing) return;
  const input = event.target as HTMLInputElement;
  const { selections } = editing.line;

  if (input.dataset.variant) {
    editing.line.variantId = input.dataset.variant;
  } else if (input.dataset.group && input.dataset.option) {
    const groupId = input.dataset.group;
    const optionId = input.dataset.option;
    if (input.type === "radio") {
      selections[groupId] = { [optionId]: 1 };
    } else {
      const chosen = (selections[groupId] ??= {});
      if (input.checked) chosen[optionId] = 1;
      else delete chosen[optionId];
      if (Object.keys(chosen).length === 0) delete selections[groupId];
    }
  }
  refreshItemDialog();
});

ui.itemBody.addEventListener("click", (event) => {
  if (!editing) return;
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-step]");
  if (!button || button.disabled) return;
  const groupId = button.dataset.group!;
  const optionId = button.dataset.option!;
  const chosen = (editing.line.selections[groupId] ??= {});
  const qty = (chosen[optionId] ?? 0) + Number(button.dataset.step);
  if (qty > 0) chosen[optionId] = qty;
  else delete chosen[optionId];
  if (Object.keys(chosen).length === 0) delete editing.line.selections[groupId];
  refreshItemDialog();
});

ui.itemBody.addEventListener("input", (event) => {
  if (!editing) return;
  const field = event.target as HTMLInputElement | HTMLTextAreaElement;
  if (field.hasAttribute("data-note")) editing.line.note = field.value;
  if (field.hasAttribute("data-comment")) editing.line.comment = field.value;
  refreshItemDialog();
});

ui.itemMinus.addEventListener("click", () => {
  if (!editing) return;
  editing.line.qty = Math.max(1, editing.line.qty - 1);
  refreshItemDialog();
});

ui.itemPlus.addEventListener("click", () => {
  if (!editing) return;
  editing.line.qty = Math.min(MAX_LINE_QTY, editing.line.qty + 1);
  refreshItemDialog();
});

ui.itemAdd.addEventListener("click", () => {
  if (!editing || lineErrors(editing.item, editing.line).length) return;
  const { item, line } = editing;
  addLine({
    ...line,
    note: line.note?.trim() || undefined,
    comment: line.comment?.trim() || undefined,
  });
  ui.itemDialog.close();
  toast(`Agregado: ${line.qty > 1 ? `${line.qty}x ` : ""}${item.name}`);
});

ui.itemDialog.addEventListener("close", () => {
  editing = undefined;
});

// --- Pedido: revisar y enviar ------------------------------------------------------

function commentInput(value: string): string {
  return `<input data-line-comment maxlength="120" placeholder="Comentario (ej: sin mayo)" value="${esc(value)}"
    class="rounded-md bg-neutral-900 border border-neutral-800 px-2 py-1 text-sm" />`;
}

function renderCart(): void {
  if (!branch) return;
  const branchName = branchDisplayName(branch.name);
  ui.cartBranchName.textContent = `Lomo Alemán ${branchName}`;
  ui.cartBranchAddress.textContent = branch.address ?? "";
  ui.cartSubmit.textContent = `Enviar pedido a ${branchName}`;
  ui.cartLines.innerHTML = lines
    .map((line, index) => {
      const item = items.get(line.itemId);
      if (!item) return "";
      const details = lineDetails(item, line, false)
        .map((d) => `<li>${esc(d)}</li>`)
        .join("");
      return `
        <li data-line="${index}" class="py-3 grid gap-2">
          <div class="flex items-start justify-between gap-3">
            <p class="font-semibold">${esc(lineTitle(item, line))}</p>
            <p class="font-semibold shrink-0">${formatCLP(lineTotal(item, line))}</p>
          </div>
          ${details ? `<ul class="text-sm text-neutral-400">${details}</ul>` : ""}
          ${line.comment ? commentInput(line.comment) : `<button type="button" data-line-add-comment class="justify-self-start text-sm text-neutral-400 underline underline-offset-2">Agregar comentario</button>`}
          <div class="flex items-center justify-between">
            <div class="flex items-center rounded-md border-2 border-neutral-700">
              <button type="button" data-line-step="-1" class="w-9 h-9 text-xl" aria-label="Menos">−</button>
              <span class="w-8 text-center font-bold">${line.qty}</span>
              <button type="button" data-line-step="1" class="w-9 h-9 text-xl disabled:opacity-30" aria-label="Más" ${line.qty >= MAX_LINE_QTY ? "disabled" : ""}>+</button>
            </div>
            <button type="button" data-line-remove class="text-sm text-red-400 underline underline-offset-2">Quitar</button>
          </div>
        </li>`;
    })
    .join("");
  ui.cartTotal.textContent = formatCLP(cartTotals().total);
}

function openCart(): void {
  if (!branch || !lines.length) return;
  ui.cartMain.classList.remove("hidden");
  ui.cartSent.classList.add("hidden");
  ui.cartErrors.classList.add("hidden");
  const saved = loadCustomer();
  if (saved && !formField<HTMLInputElement>("name").value) fillCustomer(saved);
  ui.cartForget.classList.toggle("hidden", !saved);
  renderCart();
  ui.cartDialog.showModal();
}

function lineIndex(target: HTMLElement): number {
  return Number(target.closest<HTMLElement>("[data-line]")?.dataset.line ?? -1);
}

function afterCartChange(): void {
  saveCart();
  save(STORAGE_SENT, null);
  renderBar();
  if (lines.length) renderCart();
  else ui.cartDialog.close();
}

ui.cartLines.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const index = lineIndex(target);
  const line = lines[index];
  if (!line) return;
  const addComment = target.closest<HTMLElement>("[data-line-add-comment]");
  if (addComment) {
    addComment.outerHTML = commentInput("");
    ui.cartLines.querySelector<HTMLInputElement>(`[data-line="${index}"] [data-line-comment]`)?.focus();
    return;
  }
  const step = target.closest<HTMLElement>("[data-line-step]")?.dataset.lineStep;
  if (step) {
    line.qty = Math.min(MAX_LINE_QTY, line.qty + Number(step));
    if (line.qty < 1) lines.splice(index, 1);
    afterCartChange();
  } else if (target.closest("[data-line-remove]")) {
    lines.splice(index, 1);
    afterCartChange();
  }
});

ui.cartLines.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  const line = lines[lineIndex(input)];
  if (!line || !input.hasAttribute("data-line-comment")) return;
  line.comment = input.value.trim() || undefined;
  saveCart();
});

ui.cartForm.addEventListener("input", () => ui.cartErrors.classList.add("hidden"));

ui.cartForm.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.name === "delivery") ui.addressField.classList.toggle("hidden", input.value !== "delivery");
});

ui.cartForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!branch || !lines.length) return;

  const form = new FormData(ui.cartForm);
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const customer: Customer = {
    name: value("name"),
    delivery: value("delivery") === "delivery" ? "delivery" : "retiro",
    address: value("address") || undefined,
    payment: value("payment") || undefined,
    comment: value("comment") || undefined,
  };

  const errors: string[] = [];
  if (!customer.name) errors.push("Escribe tu nombre.");
  if (!value("delivery")) errors.push("Elige retiro o delivery.");
  if (customer.delivery === "delivery" && !customer.address) errors.push("Escribe la dirección de entrega.");
  if (errors.length) {
    ui.cartErrors.textContent = errors.join(" ");
    ui.cartErrors.classList.remove("hidden");
    return;
  }
  ui.cartErrors.classList.add("hidden");

  if (form.get("remember")) {
    const saved: SavedCustomer = {
      name: customer.name,
      delivery: customer.delivery,
      address: customer.delivery === "delivery" ? customer.address : undefined,
      payment: customer.payment,
    };
    save(STORAGE_CUSTOMER, JSON.stringify(saved));
  } else {
    save(STORAGE_CUSTOMER, null);
  }
  save(STORAGE_SENT, String(Date.now()));

  const url = whatsappUrl(TEST_PHONE, buildMessage(branch, lines, items, customer));
  // Pestaña nueva para no perder la página; si el navegador la bloquea, se abre aquí mismo.
  const opened = window.open(url, "_blank");
  if (opened) opened.opener = null;
  else window.location.href = url;

  ui.cartMain.classList.add("hidden");
  ui.cartSent.classList.remove("hidden");
});

ui.cartClear.addEventListener("click", emptyCart);

ui.cartEmpty.addEventListener("click", () => {
  const { count } = cartTotals();
  const what = count === 1 ? "el producto" : `los ${count} productos`;
  if (window.confirm(`¿Vaciar tu pedido? Se quitarán ${what}.`)) emptyCart();
});

ui.cartForget.addEventListener("click", () => {
  save(STORAGE_CUSTOMER, null);
  ui.cartForm.reset();
  ui.addressField.classList.add("hidden");
  ui.cartForget.classList.add("hidden");
  toast("Tus datos se borraron de este teléfono");
});

ui.sentNew.addEventListener("click", () => {
  ui.sentDialog.close();
  emptyCart();
});

ui.sentKeep.addEventListener("click", () => {
  save(STORAGE_SENT, null);
  ui.sentDialog.close();
});

ui.cartBack.addEventListener("click", () => {
  ui.cartSent.classList.add("hidden");
  ui.cartMain.classList.remove("hidden");
});

// --- Cierre de hojas y barra ---------------------------------------------------------

for (const dialog of [ui.branchDialog, ui.itemDialog, ui.cartDialog, ui.sentDialog]) {
  dialog.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    // Clic en el fondo oscuro (fuera de la hoja) o en un botón de cerrar.
    if (target === dialog || target.closest("[data-close]")) dialog.close();
  });
}
ui.branchDialog.addEventListener("close", () => {
  pendingItemId = undefined;
});

ui.cartBranchChange.addEventListener("click", openBranchDialog);
ui.bar.pick.addEventListener("click", openBranchDialog);
ui.bar.change.addEventListener("click", openBranchDialog);
ui.bar.cart.addEventListener("click", openCart);

// --- Inicio ------------------------------------------------------------------------

function init(): void {
  const param = new URLSearchParams(window.location.search).get("sucursal");
  if (param && branches.has(param)) {
    setBranch(param);
  } else {
    branch = branches.get(load(STORAGE_BRANCH) ?? "");
  }

  let saved: unknown = [];
  try {
    saved = JSON.parse(load(STORAGE_CART) ?? "[]");
  } catch {
    saved = [];
  }
  const restored = restoreCart(saved, items);
  lines = restored.lines;
  if (restored.dropped) {
    saveCart();
    toast(
      restored.dropped === 1
        ? "Se quitó 1 producto que cambió en la carta"
        : `Se quitaron ${restored.dropped} productos que cambiaron en la carta`,
    );
  }
  renderBar();

  // Si vuelve con el mismo carro que ya envió, preguntar si empieza uno nuevo.
  const sentAt = Number(load(STORAGE_SENT));
  if (sentAt && lines.length && canOrder(branch)) {
    ui.sentWhen.textContent = `Lo enviaste ${timeAgo(sentAt)}. ¿Quieres empezar uno nuevo?`;
    ui.sentDialog.showModal();
  } else if (sentAt && !lines.length) {
    save(STORAGE_SENT, null);
  }
}

init();
