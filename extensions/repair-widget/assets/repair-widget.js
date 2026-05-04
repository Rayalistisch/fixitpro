(function () {
  "use strict";

  const root = document.getElementById("repair-widget-root");
  if (!root) return;

  const PROXY = root.dataset.proxyBase || "/apps/reparatie";

  // ── State ────────────────────────────────────────────────────────────────
  let state = {
    step: 1, // 1 = toestel, 2 = aanvraag
    brands: [], models: [], colors: [], repairs: [], qualities: [],
    sel: { brand: "", model: "", color: "", repair: "", quality: "", price: 0, showQuality: false },
    form: { name: "", email: "", phone: "", date: "", time: "", notes: "" },
    loading: false, error: "", submitted: false,
  };

  // ── API ──────────────────────────────────────────────────────────────────
  async function api(path) {
    const res = await fetch(PROXY + path);
    if (!res.ok) throw new Error("Laad fout (" + res.status + ")");
    return res.json();
  }

  async function load(setter, path) {
    state.loading = true; render();
    try { setter(await api(path)); }
    catch (e) { state.error = e.message; }
    state.loading = false; render();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  function render() {
    root.innerHTML = "";
    if (state.submitted) { root.appendChild(renderDone()); return; }

    const wrap = el("div", "rw-wrap");

    // Header
    const header = el("div", "rw-header");
    const steps = ["Toestel", "Aanvraag"];
    steps.forEach((label, i) => {
      const step = el("div", "rw-step-indicator" + (i + 1 === state.step ? " rw-step-active" : (i + 1 < state.step ? " rw-step-done" : "")));
      const num = el("span", "rw-step-num"); num.textContent = i + 1;
      const lbl = el("span", "rw-step-label"); lbl.textContent = label;
      step.appendChild(num); step.appendChild(lbl);
      header.appendChild(step);
      if (i < steps.length - 1) {
        const line = el("div", "rw-step-line"); header.appendChild(line);
      }
    });
    wrap.appendChild(header);

    if (state.error) {
      const err = el("div", "rw-error"); err.textContent = state.error;
      wrap.appendChild(err);
    }

    // Body: twee kolommen
    const body = el("div", "rw-body");
    body.appendChild(state.step === 1 ? renderStep1() : renderStep2());
    body.appendChild(renderSidebar());
    wrap.appendChild(body);

    root.appendChild(wrap);
  }

  // ── Stap 1: Toestel ──────────────────────────────────────────────────────
  function renderStep1() {
    const col = el("div", "rw-col-main");

    // Merk
    col.appendChild(selectGroup("Merk", "Kies een merk...", state.brands, r => r.brand || r, state.sel.brand, async val => {
      state.sel = { ...state.sel, brand: val, model: "", color: "", repair: "", quality: "", price: 0 };
      state.models = []; state.colors = []; state.repairs = []; state.qualities = [];
      await load(d => { state.models = d; }, "/catalog?models=1&brand=" + enc(val));
    }));

    // Model
    col.appendChild(selectGroup("Model", "Kies eerst een merk...", state.models, r => r.model || r, state.sel.model, async val => {
      state.sel = { ...state.sel, model: val, color: "", repair: "", quality: "", price: 0 };
      state.colors = []; state.repairs = []; state.qualities = [];
      await load(d => { state.colors = d.map(r => r.color || r); }, "/catalog?rpc=get_colors&brand=" + enc(state.sel.brand) + "&model=" + enc(val));
    }, !state.sel.brand));

    // Kleur
    col.appendChild(selectGroup("Kleur", "Kies eerst een merk...", state.colors, r => r, state.sel.color, async val => {
      state.sel = { ...state.sel, color: val, repair: "", quality: "", price: 0 };
      state.repairs = []; state.qualities = [];
      await load(d => { state.repairs = d.map(r => r.repair_type || r); },
        "/catalog?rpc=get_repair_types&brand=" + enc(state.sel.brand) + "&model=" + enc(state.sel.model) + "&color=" + enc(val));
    }, !state.sel.model));

    // Reparatie
    col.appendChild(selectGroup("Reparatie", "Kies eerst een kleur...", state.repairs, r => r, state.sel.repair, async val => {
      state.sel = { ...state.sel, repair: val, quality: "", price: 0 };
      state.qualities = [];
      await load(d => {
        state.qualities = d;
        // Als er maar 1 optie is of show_quality false: auto-select
        if (d.length === 1) {
          state.sel.quality = d[0].quality || "";
          state.sel.price = parseFloat(d[0].price) || 0;
          state.sel.showQuality = false;
        } else if (d.length > 1) {
          state.sel.showQuality = d[0].show_quality;
        }
      }, "/catalog?rpc=get_qualities_prices&brand=" + enc(state.sel.brand) + "&model=" + enc(state.sel.model) + "&color=" + enc(state.sel.color) + "&repair_type=" + enc(val));
    }, !state.sel.color));

    // Kwaliteit (alleen als meerdere opties)
    if (state.sel.repair && state.qualities.length > 1 && state.sel.showQuality) {
      col.appendChild(selectGroup("Kwaliteit", "Kies een kwaliteit...", state.qualities,
        r => (r.quality || "Standaard") + (r.price ? " — €" + parseFloat(r.price).toFixed(2) : ""),
        state.sel.quality,
        val => {
          const q = state.qualities.find(r => r.quality === val);
          state.sel.quality = val;
          state.sel.price = q ? parseFloat(q.price) || 0 : 0;
          render();
        }, false));
    }

    // Volgende stap knop
    const canNext = state.sel.brand && state.sel.model && state.sel.color && state.sel.repair &&
      (state.qualities.length <= 1 || !state.sel.showQuality || state.sel.quality);

    const btn = el("button", "rw-btn-primary" + (canNext ? "" : " rw-btn-disabled"));
    btn.textContent = "Volgende Stap";
    const sub = el("span", "rw-btn-sub"); sub.textContent = "Je betaalt pas na de reparatie";
    btn.appendChild(sub);
    btn.disabled = !canNext;
    btn.onclick = () => { if (canNext) { state.step = 2; render(); } };
    col.appendChild(btn);

    return col;
  }

  function selectGroup(label, placeholder, items, labelFn, value, onChange, disabled = false) {
    const wrap = el("div", "rw-field");
    const lbl = el("label", "rw-label"); lbl.textContent = label;
    const sel = el("select", "rw-select" + (disabled ? " rw-disabled" : ""));
    sel.disabled = disabled || state.loading;

    const opt0 = el("option"); opt0.value = ""; opt0.textContent = placeholder; opt0.disabled = true;
    sel.appendChild(opt0);

    items.forEach(item => {
      const opt = el("option");
      opt.value = (typeof item === "string" ? item : (item.brand || item.model || item.color || item.repair_type || item.quality || ""));
      opt.textContent = labelFn(item);
      if (opt.value === value) opt.selected = true;
      sel.appendChild(opt);
    });

    if (!value) sel.value = "";

    sel.onchange = async e => {
      state.error = "";
      await onChange(e.target.value);
    };

    wrap.appendChild(lbl);
    wrap.appendChild(sel);
    return wrap;
  }

  // ── Stap 2: Aanvraag ─────────────────────────────────────────────────────
  function renderStep2() {
    const col = el("div", "rw-col-main");

    const form = el("form", "rw-form");
    form.appendChild(inputField("Naam *", "text", "name", true));
    form.appendChild(inputField("E-mailadres *", "email", "email", true));
    form.appendChild(inputField("Telefoonnummer", "tel", "phone", false));
    form.appendChild(inputField("Voorkeursdatum", "date", "date", false));
    form.appendChild(inputField("Voorkeurstijd", "time", "time", false));

    const notesWrap = el("div", "rw-field");
    const notesLbl = el("label", "rw-label"); notesLbl.textContent = "Opmerking";
    const textarea = el("textarea", "rw-select");
    textarea.rows = 3;
    textarea.value = state.form.notes;
    textarea.oninput = e => { state.form.notes = e.target.value; };
    notesWrap.appendChild(notesLbl);
    notesWrap.appendChild(textarea);
    form.appendChild(notesWrap);

    const submitBtn = el("button", "rw-btn-primary");
    submitBtn.type = "submit";
    submitBtn.textContent = state.loading ? "Versturen…" : "Verstuur aanvraag";
    submitBtn.disabled = state.loading;
    form.appendChild(submitBtn);

    form.onsubmit = async e => {
      e.preventDefault();
      await submitRequest();
    };

    col.appendChild(form);

    const back = el("button", "rw-btn-back");
    back.type = "button";
    back.textContent = "← Terug naar toestel";
    back.onclick = () => { state.step = 1; render(); };
    col.appendChild(back);

    return col;

    function inputField(label, type, key, required) {
      const wrap = el("div", "rw-field");
      const lbl = el("label", "rw-label"); lbl.textContent = label;
      const inp = el("input", "rw-select");
      inp.type = type; inp.required = required;
      inp.value = state.form[key] || "";
      inp.oninput = e => { state.form[key] = e.target.value; };
      wrap.appendChild(lbl); wrap.appendChild(inp);
      return wrap;
    }
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────
  function renderSidebar() {
    const side = el("div", "rw-sidebar");
    const title = el("div", "rw-sidebar-title"); title.textContent = "Reparatie lijst";
    side.appendChild(title);

    const s = state.sel;
    const hasDevice = s.brand || s.model;

    if (!hasDevice) {
      const msg = el("div", "rw-sidebar-empty"); msg.textContent = "Kies een toestel";
      side.appendChild(msg);
    } else {
      const rows = [
        [s.brand + (s.model ? " " + s.model : ""), null],
        s.color ? [s.color, null] : null,
        s.repair ? [s.repair, s.price ? "€" + s.price.toFixed(2) : "Op aanvraag"] : null,
        s.quality && s.showQuality ? ["Kwaliteit: " + s.quality, null] : null,
      ].filter(Boolean);

      rows.forEach(([label, price]) => {
        const row = el("div", "rw-sidebar-row");
        const lbl = el("span"); lbl.textContent = label;
        row.appendChild(lbl);
        if (price) { const p = el("span", "rw-sidebar-price"); p.textContent = price; row.appendChild(p); }
        side.appendChild(row);
      });
    }

    const divider = el("div", "rw-sidebar-divider");
    side.appendChild(divider);

    const subtotalRow = el("div", "rw-sidebar-row");
    const subLbl = el("span"); subLbl.textContent = "Subtotaal";
    const subVal = el("span"); subVal.textContent = s.price ? "€" + s.price.toFixed(2) : "-";
    subtotalRow.appendChild(subLbl); subtotalRow.appendChild(subVal);
    side.appendChild(subtotalRow);

    const totalRow = el("div", "rw-sidebar-row rw-sidebar-total");
    const totLbl = el("span");
    const bold = el("strong"); bold.textContent = "Totaal";
    const incl = el("small"); incl.textContent = " incl. btw (21%)";
    totLbl.appendChild(bold); totLbl.appendChild(incl);
    const totVal = el("strong"); totVal.textContent = s.price ? "€" + s.price.toFixed(2) : "-";
    totalRow.appendChild(totLbl); totalRow.appendChild(totVal);
    side.appendChild(totalRow);

    return side;
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  function renderDone() {
    const wrap = el("div", "rw-done");
    const icon = el("div", "rw-done-icon"); icon.textContent = "✓";
    const h = el("h3"); h.textContent = "Aanvraag ontvangen!";
    const p = el("p"); p.textContent = "We nemen zo snel mogelijk contact met je op.";
    const btn = el("button", "rw-btn-secondary");
    btn.textContent = "Nieuwe aanvraag";
    btn.onclick = () => {
      state = {
        step: 1, brands: state.brands, models: [], colors: [], repairs: [], qualities: [],
        sel: { brand: "", model: "", color: "", repair: "", quality: "", price: 0, showQuality: false },
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
    state.loading = true; state.error = ""; render();
    try {
      const res = await fetch(PROXY + "/create-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: state.form.name,
          customer_email: state.form.email,
          customer_phone: state.form.phone,
          brand: state.sel.brand, model: state.sel.model,
          color: state.sel.color, issue: state.sel.repair,
          quality: state.sel.quality,
          price_text: state.sel.price ? "€" + state.sel.price.toFixed(2) : "Op aanvraag",
          preferred_date: state.form.date,
          preferred_time: state.form.time,
          notes: state.form.notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Onbekende fout");
      state.submitted = true;
    } catch (e) { state.error = e.message; }
    state.loading = false; render();
  }

  // ── Utils ─────────────────────────────────────────────────────────────────
  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function enc(s) { return encodeURIComponent(s || ""); }

  // ── Boot ──────────────────────────────────────────────────────────────────
  load(d => { state.brands = d; }, "/catalog?brands=1");
})();
