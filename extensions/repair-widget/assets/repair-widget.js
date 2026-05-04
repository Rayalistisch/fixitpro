(function () {
  "use strict";

  const root = document.getElementById("repair-widget-root");
  if (!root) return;

  const PROXY = root.dataset.proxyBase || "/apps/reparatie";

  // Kleurmapping voor visuele chips
  const COLOR_MAP = {
    "zwart": "#1c1c1e", "black": "#1c1c1e",
    "wit": "#f5f5f7", "white": "#f5f5f7",
    "space black": "#1c1c1e", "space gray": "#3a3a3c", "space grey": "#3a3a3c",
    "silver": "#c0c0c8", "zilver": "#c0c0c8",
    "goud": "#d4af7a", "gold": "#d4af7a",
    "rose gold": "#e8b4a0", "rosé": "#e8b4a0",
    "blauw": "#3a7bd5", "blue": "#3a7bd5",
    "rood": "#e03040", "red": "#e03040",
    "groen": "#34a853", "green": "#34a853",
    "grijs": "#8e8e93", "gray": "#8e8e93", "grey": "#8e8e93",
    "paars": "#8b5cf6", "purple": "#8b5cf6",
    "geel": "#f59e0b", "yellow": "#f59e0b",
    "oranje": "#f97316", "orange": "#f97316",
    "roze": "#ec4899", "pink": "#ec4899",
    "titanium": "#878681", "natural titanium": "#c4b8a8",
    "deep purple": "#4c1d95", "midnight": "#1c1c1e",
    "starlight": "#f5f0e8", "product red": "#bf0013",
    "coral": "#ff7f7f", "teal": "#008080",
  };

  function colorHex(name) {
    return COLOR_MAP[(name || "").toLowerCase()] || "#94a3b8";
  }

  // ── State ────────────────────────────────────────────────────────────────
  let S = {
    step: 1,
    brands: [], models: [], colors: [], repairs: [], qualities: [],
    brand: "", model: "", color: "", repair: "", quality: "", price: 0,
    form: { name: "", email: "", phone: "", date: "", time: "", notes: "" },
    loading: false, error: "", submitted: false,
  };

  // ── API ──────────────────────────────────────────────────────────────────
  async function api(path) {
    const r = await fetch(PROXY + path);
    if (!r.ok) throw new Error("Laad fout (" + r.status + ")");
    return r.json();
  }

  async function go(fn) {
    S.loading = true; S.error = ""; render();
    try { await fn(); } catch (e) { S.error = e.message; }
    S.loading = false; render();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function render() {
    root.innerHTML = "";

    const wrap = el("div", "rw-root");
    const inner = el("div", "gsmrt__wrap");

    if (S.submitted) {
      inner.appendChild(renderDone());
      wrap.appendChild(inner);
      root.appendChild(wrap);
      return;
    }

    // Stap-indicator
    inner.appendChild(renderSteps());

    if (S.error) {
      const err = el("div", "gsmrt__alert gsmrt__alert--error");
      err.textContent = S.error;
      inner.appendChild(err);
    }

    // Grid
    const grid = el("div", "gsmrt__grid");
    const main = el("div", "gsmrt__card");

    if (S.step === 1) {
      main.appendChild(renderStep1());
    } else {
      main.appendChild(renderStep2());
    }

    grid.appendChild(main);
    grid.appendChild(renderSidebar());
    inner.appendChild(grid);
    wrap.appendChild(inner);
    root.appendChild(wrap);
  }

  function renderSteps() {
    const bar = el("div", "gsmrt__steps");

    ["Toestel", "Aanvraag"].forEach((label, i) => {
      if (i > 0) { const line = el("div", "gsmrt__line"); bar.appendChild(line); }
      const btn = el("button", "gsmrt__step" + (i + 1 === S.step ? " is-active" : ""));
      btn.disabled = i + 1 > S.step;
      btn.onclick = () => { if (i + 1 <= S.step) { S.step = i + 1; render(); } };
      const num = el("span", "gsmrt__num"); num.textContent = i + 1;
      btn.appendChild(num);
      btn.appendChild(document.createTextNode(label));
      bar.appendChild(btn);
    });

    return bar;
  }

  // ── Stap 1 ───────────────────────────────────────────────────────────────
  function renderStep1() {
    const frag = document.createDocumentFragment();

    // Merk — typeahead
    frag.appendChild(renderTypeahead("Merk", "Zoek merk...", S.brands, r => r.brand || r, S.brand, async val => {
      S.brand = val; S.model = ""; S.color = ""; S.repair = ""; S.quality = ""; S.price = 0;
      S.models = []; S.colors = []; S.repairs = []; S.qualities = [];
      await go(async () => { S.models = await api("/catalog?models=1&brand=" + enc(val)); });
    }));

    // Model — typeahead (alleen als merk gekozen)
    if (S.brand) {
      const g = el("div", "gsmrt__group gsmrt__group--reveal");
      g.appendChild(renderTypeahead("Model", "Zoek model...", S.models, r => r.model || r, S.model, async val => {
        S.model = val; S.color = ""; S.repair = ""; S.quality = ""; S.price = 0;
        S.colors = []; S.repairs = []; S.qualities = [];
        await go(async () => {
          const d = await api("/catalog?rpc=get_colors&brand=" + enc(S.brand) + "&model=" + enc(val));
          S.colors = d.map(r => r.color || r);
        });
      }));
      frag.appendChild(g);
    }

    // Kleur — visuele chips
    if (S.model && S.colors.length) {
      const g = el("div", "gsmrt__group gsmrt__group--reveal");
      const lbl = el("div", "gsmrt__label"); lbl.textContent = "Kleur";
      g.appendChild(lbl);

      const grid = el("div", "gsmrt__colorgrid");
      S.colors.forEach(c => {
        const wrap = el("div", "gsmrt__colorwrap");
        const chip = el("button", "gsmrt__colorchip" + (S.color === c ? " is-active" : ""));
        chip.style.background = colorHex(c);
        chip.title = c;
        chip.onclick = async () => {
          S.color = c; S.repair = ""; S.quality = ""; S.price = 0;
          S.repairs = []; S.qualities = [];
          await go(async () => {
            const d = await api("/catalog?rpc=get_repair_types&brand=" + enc(S.brand) + "&model=" + enc(S.model) + "&color=" + enc(c));
            S.repairs = d.map(r => r.repair_type || r);
          });
        };
        const lbl2 = el("span", "gsmrt__colorlabel"); lbl2.textContent = c;
        wrap.appendChild(chip); wrap.appendChild(lbl2);
        grid.appendChild(wrap);
      });

      g.appendChild(grid);
      frag.appendChild(g);
    }

    // Reparatietype — kaarten
    if (S.color && S.repairs.length) {
      const g = el("div", "gsmrt__group gsmrt__group--reveal");
      const lbl = el("div", "gsmrt__label"); lbl.textContent = "Reparatie";
      g.appendChild(lbl);

      const grid = el("div", "gsmrt__issuegrid");
      S.repairs.forEach(r => {
        const card = el("button", "gsmrt__repaircard" + (S.repair === r ? " is-active" : ""));
        const head = el("div", "gsmrt__repairhead");
        const title = el("div", "gsmrt__repairtitle"); title.textContent = r;
        head.appendChild(title);
        card.appendChild(head);
        card.onclick = async () => {
          S.repair = r; S.quality = ""; S.price = 0;
          S.qualities = [];
          await go(async () => {
            S.qualities = await api("/catalog?rpc=get_qualities_prices&brand=" + enc(S.brand) + "&model=" + enc(S.model) + "&color=" + enc(S.color) + "&repair_type=" + enc(r));
            if (S.qualities.length === 1) {
              S.quality = S.qualities[0].quality || "";
              S.price = parseFloat(S.qualities[0].price) || 0;
            }
          });
        };
        grid.appendChild(card);
      });

      g.appendChild(grid);
      frag.appendChild(g);
    }

    // Kwaliteit — chips (alleen als meerdere en show_quality)
    if (S.repair && S.qualities.length > 1 && S.qualities[0].show_quality) {
      const g = el("div", "gsmrt__group gsmrt__group--reveal");
      const lbl = el("div", "gsmrt__label"); lbl.textContent = "Kwaliteit";
      g.appendChild(lbl);

      const grid = el("div", "gsmrt__qualitygrid");
      S.qualities.forEach(q => {
        const chip = el("button", "gsmrt__qualitychip" + (S.quality === q.quality ? " is-active" : ""));
        const name = el("div", "gsmrt__qname"); name.textContent = q.quality || "Standaard";
        const price = el("div", "gsmrt__qprice"); price.textContent = q.price ? "€" + parseFloat(q.price).toFixed(2) : "Op aanvraag";
        chip.appendChild(name); chip.appendChild(price);
        chip.onclick = () => {
          S.quality = q.quality || "";
          S.price = parseFloat(q.price) || 0;
          render();
        };
        grid.appendChild(chip);
      });

      g.appendChild(grid);
      frag.appendChild(g);
    }

    // Laden indicator
    if (S.loading) {
      const ld = el("div", "gsmrt__loading"); ld.textContent = "Laden…";
      frag.appendChild(ld);
    }

    // Volgende stap knop
    const canNext = S.brand && S.model && S.color && S.repair &&
      (S.qualities.length <= 1 || !S.qualities[0]?.show_quality || S.quality);

    const actions = el("div", "gsmrt__actions");
    const btn = el("button", "gsmrt__btn gsmrt__btn--primary");
    btn.disabled = !canNext || S.loading;
    btn.textContent = "Volgende stap →";
    btn.onclick = () => { if (canNext) { S.step = 2; render(); } };
    actions.appendChild(btn);
    frag.appendChild(actions);

    return frag;
  }

  // ── Typeahead component ──────────────────────────────────────────────────
  function renderTypeahead(labelText, placeholder, items, labelFn, value, onSelect) {
    const group = el("div", "gsmrt__group");
    const lbl = el("div", "gsmrt__label"); lbl.textContent = labelText;
    group.appendChild(lbl);

    const ta = el("div", "gsmrt__typeahead");
    const inp = el("input", "gsmrt__input");
    inp.type = "text";
    inp.placeholder = placeholder;
    inp.value = value || "";
    inp.autocomplete = "off";
    inp.disabled = S.loading;

    const results = el("div", "gsmrt__results");

    function showItems(filter) {
      results.innerHTML = "";
      const filtered = items.filter(i => labelFn(i).toLowerCase().includes(filter.toLowerCase()));
      filtered.slice(0, 30).forEach(item => {
        const div = el("div", "gsmrt__result-item");
        div.textContent = labelFn(item);
        div.onmousedown = async () => {
          inp.value = labelFn(item);
          results.style.display = "none";
          await onSelect(labelFn(item));
        };
        results.appendChild(div);
      });
      results.style.display = filtered.length ? "block" : "none";
    }

    inp.onfocus = () => { if (items.length) showItems(inp.value); };
    inp.oninput = () => showItems(inp.value);
    inp.onblur = () => setTimeout(() => { results.style.display = "none"; }, 150);

    ta.appendChild(inp);
    ta.appendChild(results);
    group.appendChild(ta);
    return group;
  }

  // ── Stap 2 ───────────────────────────────────────────────────────────────
  function renderStep2() {
    const frag = document.createDocumentFragment();

    const form = el("form", "");
    form.onsubmit = async e => { e.preventDefault(); await submitRequest(); };

    const fields = [
      ["Naam *", "text", "name", true],
      ["E-mailadres *", "email", "email", true],
      ["Telefoonnummer", "tel", "phone", false],
      ["Voorkeursdatum", "date", "date", false],
      ["Voorkeurstijd", "time", "time", false],
    ];

    fields.forEach(([label, type, key, req]) => {
      const g = el("div", "gsmrt__group");
      const lbl = el("div", "gsmrt__label"); lbl.textContent = label;
      const inp = el("input", "gsmrt__input");
      inp.type = type; inp.required = req;
      inp.value = S.form[key] || "";
      inp.oninput = e => { S.form[key] = e.target.value; };
      g.appendChild(lbl); g.appendChild(inp);
      form.appendChild(g);
    });

    const notesG = el("div", "gsmrt__group");
    const notesLbl = el("div", "gsmrt__label"); notesLbl.textContent = "Opmerking";
    const ta = el("textarea", "gsmrt__textarea");
    ta.rows = 3; ta.value = S.form.notes;
    ta.oninput = e => { S.form.notes = e.target.value; };
    notesG.appendChild(notesLbl); notesG.appendChild(ta);
    form.appendChild(notesG);

    const actions = el("div", "gsmrt__actions");
    const submit = el("button", "gsmrt__btn gsmrt__btn--primary");
    submit.type = "submit";
    submit.disabled = S.loading;
    submit.textContent = S.loading ? "Versturen…" : "Aanvraag versturen";
    actions.appendChild(submit);
    form.appendChild(actions);

    frag.appendChild(form);

    const back = el("button", "gsmrt__btn gsmrt__btn--ghost");
    back.type = "button";
    back.style.marginTop = "10px";
    back.textContent = "← Terug";
    back.onclick = () => { S.step = 1; render(); };
    frag.appendChild(back);

    return frag;
  }

  // ── Sidebar samenvatting ──────────────────────────────────────────────────
  function renderSidebar() {
    const side = el("div", "gsmrt__card gsmrt__side");

    const title = el("div", "gsmrt__summary-title"); title.textContent = "Jouw selectie";
    side.appendChild(title);

    const rows = [
      S.brand && ["Merk", S.brand],
      S.model && ["Model", S.model],
      S.color && ["Kleur", S.color],
      S.repair && ["Reparatie", S.repair],
      S.quality && ["Kwaliteit", S.quality],
    ].filter(Boolean);

    if (!rows.length) {
      const empty = el("div", "gsmrt__summary-empty"); empty.textContent = "Kies een toestel";
      side.appendChild(empty);
    } else {
      rows.forEach(([k, v]) => {
        const row = el("div", "gsmrt__summary-row");
        const key = el("span"); key.textContent = k;
        const val = el("span", "gsmrt__summary-val"); val.textContent = v;
        row.appendChild(key); row.appendChild(val);
        side.appendChild(row);
      });

      const divider = el("div", "gsmrt__summary-row gsmrt__summary-total");
      const pl = el("span"); pl.textContent = "Richtprijs";
      const pv = el("span", "gsmrt__summary-val");
      pv.style.color = "var(--primary)";
      pv.textContent = S.price ? "€" + S.price.toFixed(2) : (S.repair ? "Op aanvraag" : "-");
      divider.appendChild(pl); divider.appendChild(pv);
      side.appendChild(divider);
    }

    return side;
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  function renderDone() {
    const wrap = el("div", "gsmrt__card gsmrt__done");
    const icon = el("div", "gsmrt__done-icon"); icon.textContent = "✓";
    const h = el("h3"); h.textContent = "Aanvraag ontvangen!";
    const p = el("p"); p.textContent = "We nemen zo snel mogelijk contact met je op.";
    const btn = el("button", "gsmrt__btn gsmrt__btn--ghost");
    btn.textContent = "Nieuwe aanvraag";
    btn.onclick = () => {
      S = {
        step: 1, brands: S.brands, models: [], colors: [], repairs: [], qualities: [],
        brand: "", model: "", color: "", repair: "", quality: "", price: 0,
        form: { name: "", email: "", phone: "", date: "", time: "", notes: "" },
        loading: false, error: "", submitted: false,
      };
      render();
    };
    wrap.appendChild(icon); wrap.appendChild(h); wrap.appendChild(p); wrap.appendChild(btn);
    return wrap;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submitRequest() {
    await go(async () => {
      const res = await fetch(PROXY + "/create-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: S.form.name, customer_email: S.form.email,
          customer_phone: S.form.phone, brand: S.brand, model: S.model,
          color: S.color, issue: S.repair, quality: S.quality,
          price_text: S.price ? "€" + S.price.toFixed(2) : "Op aanvraag",
          preferred_date: S.form.date, preferred_time: S.form.time, notes: S.form.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Onbekende fout");
      S.submitted = true;
    });
  }

  // ── Utils ─────────────────────────────────────────────────────────────────
  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function enc(s) { return encodeURIComponent(s || ""); }

  // ── Boot ──────────────────────────────────────────────────────────────────
  go(async () => { S.brands = await api("/catalog?brands=1"); });
})();
