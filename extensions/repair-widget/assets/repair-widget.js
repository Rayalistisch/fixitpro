(function () {
  "use strict";

  const root = document.getElementById("repair-widget-root");
  if (!root) return;

  const PROXY = root.dataset.proxyBase || "/apps/reparatie";

  // ── State ────────────────────────────────────────────────────────────────
  let state = {
    step: "brand", // brand → model → color → repair → quality → details → done
    brands: [],
    models: [],
    colors: [],
    repairs: [],
    qualities: [],
    selected: { brand: "", model: "", color: "", repair: "", quality: "", price: "" },
    form: { name: "", email: "", phone: "", date: "", time: "", notes: "" },
    loading: false,
    error: "",
  };

  // ── API helpers ──────────────────────────────────────────────────────────
  async function api(path) {
    const res = await fetch(PROXY + path);
    if (!res.ok) throw new Error("Fout bij laden (" + res.status + ")");
    return res.json();
  }

  async function loadBrands() {
    state.loading = true; render();
    try {
      state.brands = await api("/catalog?brands=1");
    } catch (e) { state.error = e.message; }
    state.loading = false; render();
  }

  async function loadModels(brand) {
    state.loading = true; render();
    try {
      state.models = await api("/catalog?models=1&brand=" + encodeURIComponent(brand));
    } catch (e) { state.error = e.message; }
    state.loading = false; render();
  }

  async function loadColors(brand, model) {
    state.loading = true; render();
    try {
      const data = await api(
        "/catalog?rpc=get_colors&brand=" + encodeURIComponent(brand) +
        "&model=" + encodeURIComponent(model)
      );
      state.colors = data.map ? data.map(r => r.color || r) : data;
    } catch (e) { state.error = e.message; }
    state.loading = false; render();
  }

  async function loadRepairs(brand, model, color) {
    state.loading = true; render();
    try {
      const data = await api(
        "/catalog?rpc=get_repair_types&brand=" + encodeURIComponent(brand) +
        "&model=" + encodeURIComponent(model) +
        "&color=" + encodeURIComponent(color)
      );
      state.repairs = data.map ? data.map(r => r.repair_type || r) : data;
    } catch (e) { state.error = e.message; }
    state.loading = false; render();
  }

  async function loadQualities(brand, model, color, repair) {
    state.loading = true; render();
    try {
      state.qualities = await api(
        "/catalog?rpc=get_qualities_prices&brand=" + encodeURIComponent(brand) +
        "&model=" + encodeURIComponent(model) +
        "&color=" + encodeURIComponent(color) +
        "&repair_type=" + encodeURIComponent(repair)
      );
    } catch (e) { state.error = e.message; }
    state.loading = false; render();
  }

  async function submitRequest() {
    state.loading = true; state.error = ""; render();
    try {
      const res = await fetch(PROXY + "/create-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: state.form.name,
          customer_email: state.form.email,
          customer_phone: state.form.phone,
          brand: state.selected.brand,
          model: state.selected.model,
          color: state.selected.color,
          issue: state.selected.repair,
          quality: state.selected.quality,
          price_text: state.selected.price,
          preferred_date: state.form.date,
          preferred_time: state.form.time,
          notes: state.form.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Onbekende fout");
      state.step = "done";
    } catch (e) {
      state.error = e.message;
    }
    state.loading = false; render();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function render() {
    root.innerHTML = "";
    const wrap = el("div", "rw-wrap");

    if (state.step === "done") {
      wrap.appendChild(renderDone());
      root.appendChild(wrap);
      return;
    }

    wrap.appendChild(renderProgress());
    if (state.error) {
      const err = el("div", "rw-error");
      err.textContent = state.error;
      wrap.appendChild(err);
    }

    if (state.loading) {
      const spin = el("div", "rw-loading");
      spin.textContent = "Laden…";
      wrap.appendChild(spin);
      root.appendChild(wrap);
      return;
    }

    const stepEl = {
      brand: renderBrand,
      model: renderModel,
      color: renderColor,
      repair: renderRepair,
      quality: renderQuality,
      details: renderDetails,
    }[state.step];

    if (stepEl) wrap.appendChild(stepEl());
    root.appendChild(wrap);
  }

  function renderProgress() {
    const steps = ["brand", "model", "color", "repair", "quality", "details"];
    const labels = ["Merk", "Model", "Kleur", "Reparatie", "Kwaliteit", "Gegevens"];
    const current = steps.indexOf(state.step);
    const bar = el("div", "rw-progress");
    steps.forEach((s, i) => {
      const dot = el("div", "rw-dot" + (i < current ? " rw-done" : i === current ? " rw-active" : ""));
      dot.textContent = labels[i];
      bar.appendChild(dot);
    });
    return bar;
  }

  function renderBrand() {
    const wrap = el("div", "rw-step");
    const h = el("h3", "rw-step-title"); h.textContent = "Kies je merk";
    wrap.appendChild(h);
    const grid = el("div", "rw-grid");
    state.brands.forEach(brand => {
      const btn = el("button", "rw-chip");
      btn.textContent = brand.brand || brand;
      btn.onclick = () => {
        state.selected.brand = brand.brand || brand;
        state.step = "model";
        loadModels(state.selected.brand);
      };
      grid.appendChild(btn);
    });
    wrap.appendChild(grid);
    return wrap;
  }

  function renderModel() {
    return renderList("Kies je model", state.models, m => m.model || m, val => {
      state.selected.model = val;
      state.step = "color";
      loadColors(state.selected.brand, val);
    }, () => { state.step = "brand"; render(); });
  }

  function renderColor() {
    return renderList("Kies je kleur", state.colors, c => c.color || c, val => {
      state.selected.color = val;
      state.step = "repair";
      loadRepairs(state.selected.brand, state.selected.model, val);
    }, () => { state.step = "model"; render(); });
  }

  function renderRepair() {
    return renderList("Welke reparatie?", state.repairs, r => r.repair_type || r, val => {
      state.selected.repair = val;
      state.step = "quality";
      loadQualities(state.selected.brand, state.selected.model, state.selected.color, val);
    }, () => { state.step = "color"; render(); });
  }

  function renderQuality() {
    const wrap = el("div", "rw-step");
    const h = el("h3", "rw-step-title"); h.textContent = "Kies kwaliteit";
    wrap.appendChild(h);

    if (!state.qualities.length) {
      const msg = el("p"); msg.textContent = "Geen prijsopties gevonden.";
      wrap.appendChild(msg);
    }

    state.qualities.forEach(q => {
      const card = el("button", "rw-quality-card");
      const name = el("span", "rw-q-name"); name.textContent = q.quality || "Standaard";
      const price = el("span", "rw-q-price"); price.textContent = q.price ? "€" + q.price : "Op aanvraag";
      card.appendChild(name);
      card.appendChild(price);
      card.onclick = () => {
        state.selected.quality = q.quality || "";
        state.selected.price = q.price ? "€" + q.price : "Op aanvraag";
        state.step = "details";
        render();
      };
      wrap.appendChild(card);
    });

    // Geen kwaliteitskeuze nodig (1 optie of show_quality = false)
    if (state.qualities.length === 1) {
      state.selected.quality = state.qualities[0].quality || "";
      state.selected.price = state.qualities[0].price ? "€" + state.qualities[0].price : "Op aanvraag";
      state.step = "details";
      render();
      return wrap;
    }

    wrap.appendChild(backBtn(() => { state.step = "repair"; render(); }));
    return wrap;
  }

  function renderDetails() {
    const wrap = el("div", "rw-step");
    const h = el("h3", "rw-step-title"); h.textContent = "Jouw gegevens";
    wrap.appendChild(h);

    const summary = el("div", "rw-summary");
    summary.innerHTML =
      "<strong>" + esc(state.selected.brand) + " " + esc(state.selected.model) + "</strong> · " +
      esc(state.selected.repair) + " · " + esc(state.selected.price);
    wrap.appendChild(summary);

    const form = el("form", "rw-form");

    form.appendChild(field("Naam", "text", "name", true));
    form.appendChild(field("E-mailadres", "email", "email", true));
    form.appendChild(field("Telefoonnummer", "tel", "phone", false));
    form.appendChild(field("Voorkeursdatum", "date", "date", false));
    form.appendChild(field("Voorkeurstijd", "time", "time", false));

    const notesWrap = el("div", "rw-field");
    const notesLabel = el("label"); notesLabel.textContent = "Opmerking";
    const notesArea = el("textarea", "rw-input rw-textarea");
    notesArea.rows = 3;
    notesArea.value = state.form.notes;
    notesArea.oninput = e => { state.form.notes = e.target.value; };
    notesWrap.appendChild(notesLabel);
    notesWrap.appendChild(notesArea);
    wrap.appendChild(notesWrap);

    const submit = el("button", "rw-btn rw-btn-primary");
    submit.type = "submit";
    submit.textContent = "Aanvraag versturen";

    form.onsubmit = e => {
      e.preventDefault();
      submitRequest();
    };

    form.appendChild(submit);
    wrap.appendChild(form);
    wrap.appendChild(backBtn(() => { state.step = "quality"; render(); }));
    return wrap;

    function field(label, type, key, required) {
      const wrap = el("div", "rw-field");
      const lbl = el("label"); lbl.textContent = label + (required ? " *" : "");
      const inp = el("input", "rw-input");
      inp.type = type;
      inp.value = state.form[key] || "";
      inp.required = required;
      inp.oninput = e => { state.form[key] = e.target.value; };
      wrap.appendChild(lbl);
      wrap.appendChild(inp);
      return wrap;
    }
  }

  function renderDone() {
    const wrap = el("div", "rw-done");
    const icon = el("div", "rw-done-icon"); icon.textContent = "✓";
    const h = el("h3"); h.textContent = "Aanvraag ontvangen!";
    const p = el("p"); p.textContent = "We nemen zo snel mogelijk contact met je op.";
    const btn = el("button", "rw-btn rw-btn-secondary");
    btn.textContent = "Nieuwe aanvraag";
    btn.onclick = () => {
      state = {
        step: "brand", brands: state.brands, models: [], colors: [], repairs: [], qualities: [],
        selected: { brand: "", model: "", color: "", repair: "", quality: "", price: "" },
        form: { name: "", email: "", phone: "", date: "", time: "", notes: "" },
        loading: false, error: "",
      };
      render();
    };
    wrap.appendChild(icon);
    wrap.appendChild(h);
    wrap.appendChild(p);
    wrap.appendChild(btn);
    return wrap;
  }

  function renderList(title, items, label, onSelect, onBack) {
    const wrap = el("div", "rw-step");
    const h = el("h3", "rw-step-title"); h.textContent = title;
    wrap.appendChild(h);

    if (items.length > 8) {
      const search = el("input", "rw-input rw-search");
      search.type = "search";
      search.placeholder = "Zoeken…";
      search.oninput = () => {
        const q = search.value.toLowerCase();
        list.querySelectorAll(".rw-chip").forEach(btn => {
          btn.style.display = btn.textContent.toLowerCase().includes(q) ? "" : "none";
        });
      };
      wrap.appendChild(search);
    }

    const list = el("div", "rw-list");
    items.forEach(item => {
      const btn = el("button", "rw-chip");
      btn.textContent = label(item);
      btn.onclick = () => onSelect(label(item));
      list.appendChild(btn);
    });
    wrap.appendChild(list);
    wrap.appendChild(backBtn(onBack));
    return wrap;
  }

  function backBtn(onClick) {
    const btn = el("button", "rw-btn rw-btn-back");
    btn.type = "button";
    btn.textContent = "← Terug";
    btn.onclick = onClick;
    return btn;
  }

  // ── Utils ────────────────────────────────────────────────────────────────
  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function esc(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  loadBrands();
})();
