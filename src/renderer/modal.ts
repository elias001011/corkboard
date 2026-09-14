const modalEl = document.getElementById("modal") as HTMLDivElement;

function open(box: HTMLElement): () => void {
  modalEl.replaceChildren(box);
  modalEl.hidden = false;
  const first = box.querySelector<HTMLElement>("input, textarea, button");
  first?.focus();
  return () => {
    modalEl.hidden = true;
    modalEl.replaceChildren();
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { text?: string } = {}, children: (Node | string)[] = []) {
  const e = document.createElement(tag);
  const { text, ...rest } = props;
  Object.assign(e, rest);
  if (text !== undefined) e.textContent = text;
  e.append(...children);
  return e;
}

export function promptText(title: string, initial = "", placeholder = ""): Promise<string | null> {
  return new Promise((resolve) => {
    const input = el("input", { type: "text", value: initial, placeholder });
    const ok = el("button", { text: "OK", className: "primary" });
    const cancel = el("button", { text: "Cancelar" });
    const box = el("div", { className: "box" }, [el("h3", { text: title }), input, el("div", { className: "row" }, [cancel, ok])]);
    const close = open(box);
    input.select();
    const done = (v: string | null) => {
      close();
      resolve(v);
    };
    ok.onclick = () => done(input.value.trim());
    cancel.onclick = () => done(null);
    input.onkeydown = (e) => {
      if (e.key === "Enter") done(input.value.trim());
      if (e.key === "Escape") done(null);
    };
  });
}

export function confirmDialog(title: string, message: string, okLabel = "Excluir"): Promise<boolean> {
  return new Promise((resolve) => {
    const ok = el("button", { text: okLabel, className: "primary" });
    const cancel = el("button", { text: "Cancelar" });
    const box = el("div", { className: "box" }, [el("h3", { text: title }), el("p", { text: message }), el("div", { className: "row" }, [cancel, ok])]);
    const close = open(box);
    ok.focus();
    ok.onclick = () => (close(), resolve(true));
    cancel.onclick = () => (close(), resolve(false));
    box.onkeydown = (e) => {
      if (e.key === "Escape") (close(), resolve(false));
    };
  });
}

export function chooseDialog(title: string, message: string, options: { label: string; value: string; primary?: boolean }[]): Promise<string | null> {
  return new Promise((resolve) => {
    const cancel = el("button", { text: "Cancelar" });
    const btns = options.map((o) => {
      const b = el("button", { text: o.label, className: o.primary ? "primary" : "" });
      b.onclick = () => (close(), resolve(o.value));
      return b;
    });
    const box = el("div", { className: "box" }, [el("h3", { text: title }), el("p", { text: message }), el("div", { className: "row" }, [cancel, ...btns])]);
    const close = open(box);
    cancel.onclick = () => (close(), resolve(null));
  });
}

export interface DateFields {
  createdAt: number;
  infoDate?: string;
}

function toDateInput(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function datesDialog(current: DateFields, infoLabel = "Data da informação"): Promise<DateFields | null> {
  return new Promise((resolve) => {
    const created = el("input", { type: "date", value: toDateInput(current.createdAt) });
    const info = el("input", { type: "text", value: current.infoDate ?? "", placeholder: "livre: 2019, mar/2021, 12/05/2023…" });
    const ok = el("button", { text: "Salvar", className: "primary" });
    const cancel = el("button", { text: "Cancelar" });
    const box = el("div", { className: "box" }, [
      el("h3", { text: "Datas" }),
      el("label", {}, ["Data de criação (quando você criou)", created]),
      el("label", {}, [`${infoLabel} (de quando é o fato)`, info]),
      el("div", { className: "row" }, [cancel, ok]),
    ]);
    const close = open(box);
    ok.onclick = () => {
      const [y, m, d] = created.value.split("-").map(Number);
      const sameDay = created.value === toDateInput(current.createdAt);
      const ts = !created.value || sameDay ? current.createdAt : new Date(y, m - 1, d, 12).getTime();
      close();
      resolve({ createdAt: ts, infoDate: info.value.trim() || undefined });
    };
    cancel.onclick = () => (close(), resolve(null));
    box.onkeydown = (e) => {
      if (e.key === "Escape") (close(), resolve(null));
      if (e.key === "Enter" && e.target !== cancel) ok.click();
    };
  });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, ms = 4000) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.append(t);
  }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t!.hidden = true), ms);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("pt-BR");
}
