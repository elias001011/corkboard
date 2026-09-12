export type MenuItem =
  | { sep: true }
  | { label: string; key?: string; danger?: boolean; action: () => void }
  | { label: string; sub: MenuItem[] }
  | { swatches: string[]; onPick: (c: string) => void };

const menuEl = document.getElementById("ctxmenu") as HTMLDivElement;

export function closeMenu() {
  menuEl.hidden = true;
  menuEl.replaceChildren();
}

function build(items: MenuItem[], container: HTMLElement) {
  for (const it of items) {
    if ("sep" in it) {
      container.append(Object.assign(document.createElement("div"), { className: "sep" }));
      continue;
    }
    if ("swatches" in it) {
      const row = document.createElement("div");
      row.className = "swatches";
      for (const c of it.swatches) {
        const s = document.createElement("div");
        s.className = "swatch";
        s.style.background = c;
        s.title = c;
        s.onclick = () => {
          closeMenu();
          it.onPick(c);
        };
        row.append(s);
      }
      container.append(row);
      continue;
    }
    const d = document.createElement("div");
    d.className = "item";
    d.textContent = it.label;
    if ("sub" in it) {
      d.classList.add("has-sub");
      const sub = document.createElement("div");
      sub.className = "menu sub";
      build(it.sub, sub);
      d.append(sub);
    } else {
      if (it.danger) d.classList.add("danger");
      if (it.key) {
        const k = document.createElement("span");
        k.className = "key";
        k.textContent = it.key;
        d.append(k);
      }
      d.onclick = (e) => {
        e.stopPropagation();
        closeMenu();
        it.action();
      };
    }
    container.append(d);
  }
}

export function showMenu(x: number, y: number, items: MenuItem[]) {
  closeMenu();
  build(items, menuEl);
  menuEl.hidden = false;
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
  menuEl.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
}

window.addEventListener("pointerdown", (e) => {
  if (!menuEl.hidden && !menuEl.contains(e.target as Node)) closeMenu();
}, true);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});
window.addEventListener("blur", closeMenu);
