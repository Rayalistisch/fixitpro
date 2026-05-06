// FixIt Pro — Reparatie Widget
// Identiek aan live versie; Supabase-calls vervangen door App Proxy calls.

(function initAll() {
  document.querySelectorAll('.gsmrt[data-sid][data-proxy]').forEach(function(ROOT) {
    if (ROOT.dataset.gsmrtInit === "1") return;
    ROOT.dataset.gsmrtInit = "1";
    initInstance(ROOT);
  });

  // Theme editor re-renders
  document.addEventListener('shopify:section:load', function(e) {
    e.target.querySelectorAll('.gsmrt[data-sid][data-proxy]').forEach(function(ROOT) {
      ROOT.dataset.gsmrtInit = "";
      initInstance(ROOT);
    });
  });
})();

function initInstance(ROOT) {
  var SID   = ROOT.dataset.sid;
  var PROXY = ROOT.dataset.proxy || "/apps/reparatie";
  var API_URL = PROXY + "/create-request";

  var CACHE = { brands: null, allDevices: null, models: {}, colors: {}, repairTypes: {}, qualPrices: {} };
  var DATA  = { brands: [], models: [], colors: [], repairTypes: [] };
  var _loadVer = 0;

  function $id(id) { return ROOT.querySelector('#' + id + '-' + SID); }

  var dom = {
    stepBtns:     Array.from(ROOT.querySelectorAll('[data-gsmrt-stepbtn]')),
    panels:       Array.from(ROOT.querySelectorAll('[data-gsmrt-panel]')),
    loading:      $id('gsmrt-loading'),
    brand:        $id('repair-brand'),
    brandCustomInput: $id('repair-brand-custom'),
    model:        $id('repair-model'),
    modelSearch:  $id('repair-model-search'),
    modelResults: $id('repair-model-results'),
    customNotice: $id('gsmrt-custom-notice'),
    color:        $id('repair-color'),
    issue:        $id('repair-issue'),
    quality:      $id('repair-quality'),
    colorGrid:    $id('repair-color-grid'),
    colorHint:    $id('repair-color-hint'),
    issueGrid:    $id('repair-issue-grid'),
    issueHint:    $id('repair-issue-hint'),
    qualityGrid:  $id('repair-quality-grid'),
    qualityHint:  $id('repair-quality-hint'),
    colorGroup:   $id('gsmrt-color-group'),
    issueGroup:   $id('gsmrt-issue-group'),
    qualityGroup: $id('gsmrt-quality-group'),
    actionsGroup: $id('gsmrt-actions'),
    servicesSection: $id('gsmrt-services-section'),
    deviceForm:   $id('gsmrt-device-form'),
    deviceBar:    $id('gsmrt-device-bar'),
    deviceName:   $id('gsmrt-device-name'),
    changeDevice: $id('gsmrt-change-device'),
    addRepair:    $id('GsmAddBtn'),
    next:         $id('GsmNextBtn'),
    sideNext:     $id('GsmSideNextBtn'),
    cartBox:      $id('GsmCartBox'),
    sideDevice:   $id('GsmSideDevice'),
    sideSubtotal: $id('GsmSideSubtotal'),
    sideTotal:    $id('GsmSideTotal'),
    btwLabel:     $id('GsmBtwLabel'),
    btwToggle:    $id('gsmrt-btw-toggle'),
    btwToggleLabel: $id('gsmrt-btw-label'),
    summary:      $id('GsmSummary'),
    back:         $id('GsmBackBtn'),
    form:         $id('RepairForm'),
    submitBtn:    $id('GsmSubmitBtn'),
    submitIcon:   $id('GsmSubmitIcon'),
    submitLabel:  $id('GsmSubmitLabel'),
    success:      $id('RepairSuccess'),
    error:        $id('RepairError'),
    name:         $id('ContactName'),
    phone:        $id('ContactPhone'),
    email:        $id('ContactEmail'),
    prefDate:     $id('PreferredDate'),
    prefTime:     $id('PreferredTime'),
    notes:        $id('ContactMessage'),
    serviceSelect: $id('service-select'),
    addService:   $id('GsmAddServiceBtn'),
    mobileBar:    $id('gsmrt-mobilebar'),
    mobileBarCount: $id('gsmrt-mobilebar-count'),
    mobileBarTotal: $id('gsmrt-mobilebar-total'),
    mobileBarBtn: $id('gsmrt-mobilebar-btn'),
    toastContainer: $id('gsmrt-toasts'),
  };

  // ── Meta ─────────────────────────────────────────────────────────────────
  var SERVICE_TYPES = new Set(["Softwarereset","Onderzoeken","Reingen","Reinigen"]);

  var REPAIR_META = [
    { match: /scherm|display/i,           duration: "60–120 min", hot: true,  desc: "Schermmodule vervangen incl. lijm/afdichting." },
    { match: /batterij|accu/i,            duration: "45–90 min",  hot: true,  desc: "Nieuwe accu + test op laad/gezondheid." },
    { match: /oplaad|charging|dock|poort/i, duration: "60–120 min", hot: true, desc: "Oplaadpoort vervangen incl. schoonmaak." },
    { match: /camera/i,                   duration: "45–90 min",  hot: false, desc: "Camera-module vervangen + test." },
    { match: /speaker|luid/i,             duration: "45–90 min",  hot: false, desc: "Speaker vervangen en geluidstest." },
    { match: /microfoon|mic/i,            duration: "45–90 min",  hot: false, desc: "Microfoon vervangen + beltest." },
    { match: /achterpaneel|back|behuizing/i, duration: "90–180 min", hot: false, desc: "Behuizing/achterkant vervangen (indien mogelijk)." },
    { match: /waterschade|vocht/i,        duration: "1–3 dagen",  hot: false, desc: "Diagnose + behandelplan (no cure, no pay mogelijk)." },
    { match: /overige/i,                  duration: "Op afspraak", hot: false, desc: "Staat je reparatie er niet bij? Wij brengen je een offerte op maat." },
  ];

  var QUALITY_META = {
    "officieel":   { hint: "OEM / Origineel onderdeel.", badge: "Beste match" },
    "origineel":   { hint: "OEM / Origineel onderdeel.", badge: "Beste match" },
    "pulled":      { hint: "Origineel uit donor toestel.", badge: "Scherp" },
    "refurbished": { hint: "Gereviseerd onderdeel.", badge: "Budget" },
    "compatibel":  { hint: "Aftermarket alternatief.", badge: "Budget" },
    "compatible":  { hint: "Aftermarket alternatief.", badge: "Budget" },
  };

  var GENERIC_REPAIR_TYPES   = ["Scherm reparatie","Batterij vervanging","Oplaadpoort reparatie","Camera reparatie","Speaker reparatie","Microfoon reparatie","Achterpaneel","Waterschade","Overige reparatie"];
  var GENERIC_QUALITY_OPTIONS = ["Origineel","Compatibel"];
  var QUALITY_ORDER = { "officieel":1,"origineel":2,"pulled":3,"refurbished":4,"compatibel":5,"compatible":5 };

  function pickRepairMeta(t) {
    return REPAIR_META.find(function(x){ return x.match.test(t); }) || { duration:"± 60–120 min", hot:false, desc:"Reparatie incl. test en controle." };
  }
  function pickQualityMeta(q) {
    return QUALITY_META[String(q||"").trim().toLowerCase()] || { hint:"Keuze op basis van beschikbaarheid.", badge:"" };
  }
  function qualityLabel(q) {
    return q === "officieel" ? "Originele kwaliteit" : q;
  }

  // ── Utils ─────────────────────────────────────────────────────────────────
  function safeStr(v){ return String(v==null?"":v).trim(); }
  function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
  function show(el){ if(el) el.style.display=""; }
  function hide(el){ if(el) el.style.display="none"; }
  function scrollToEl(el){ if(!el) return; window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 300, behavior:"smooth" }); }

  function colorToCss(c) {
    var l = String(c||"").toLowerCase();
    if(l.includes("black")||l==="midnight") return "#111827";
    if(l.includes("white")||l==="starlight") return "#f8fafc";
    if(l.includes("blue")) return "#2f6fed";
    if(l.includes("natural")) return "#c7b79a";
    if(l.includes("titanium")) return "#9ca3af";
    if(l.includes("graphite")) return "#374151";
    if(l.includes("silver")) return "#cbd5e1";
    if(l.includes("gold")) return "#d6b26e";
    if(l.includes("rose")) return "#fb7185";
    if(l.includes("pink")) return "#ff4fa3";
    if(l.includes("purple")) return "#a855f7";
    if(l.includes("red")) return "#ef4444";
    if(l.includes("green")) return "#22c55e";
    if(l.includes("yellow")) return "#f59e0b";
    if(l.includes("gray")||l.includes("grey")) return "#94a3b8";
    return "#e2e8f0";
  }

  function formatPrice(v) {
    if(v==null) return "Op aanvraag";
    var n = Number(v);
    if(!isFinite(n)||n===0) return "Op aanvraag";
    return "€ " + n.toFixed(0) + ",-";
  }
  function displayPrice(v) {
    if(v==null) return "Op aanvraag";
    var n = Number(v);
    if(!isFinite(n)||n===0) return "Op aanvraag";
    var out = state.priceMode === "excl" ? n/1.21 : n;
    return "€ " + Math.round(out) + ",-";
  }

  // ── Proxy data fetching (vervangt Supabase) ───────────────────────────────
  async function proxyGet(path) {
    var res = await fetch(PROXY + "/catalog" + path);
    if(!res.ok) throw new Error("Proxy " + res.status);
    return res.json();
  }

  async function getBrands() {
    if(!CACHE.brands) {
      var d = await proxyGet("?brands=1");
      CACHE.brands = Array.isArray(d) ? d.map(function(r){ return typeof r==="string"?r:(r.brand||""); }).filter(Boolean) : [];
    }
    return CACHE.brands||[];
  }
  async function getModels(brand) {
    if(!CACHE.models[brand]) {
      var d = await proxyGet("?models=1&brand=" + encodeURIComponent(brand));
      CACHE.models[brand] = Array.isArray(d) ? d.map(function(r){ return typeof r==="string"?r:(r.model||""); }).filter(Boolean) : [];
    }
    return CACHE.models[brand]||[];
  }
  async function getAllDevices() {
    if(CACHE.allDevices) return CACHE.allDevices;
    var brands = await getBrands();
    var perBrand = await Promise.all(brands.map(async function(b) {
      var models = await getModels(b);
      return models.map(function(m){ return { brand:b, model:m }; });
    }));
    CACHE.allDevices = perBrand.flat();
    return CACHE.allDevices;
  }
  async function getColors(brand, model) {
    var k = brand+"||"+model;
    if(!CACHE.colors[k]) {
      var d = await proxyGet("?rpc=get_colors&brand="+encodeURIComponent(brand)+"&model="+encodeURIComponent(model));
      CACHE.colors[k] = Array.isArray(d) ? d.map(function(r){ return r.color||r; }).filter(Boolean) : [];
    }
    return CACHE.colors[k]||[];
  }
  async function getRepairTypes(brand, model, color) {
    var k = brand+"||"+model+"||"+color;
    if(!CACHE.repairTypes[k]) {
      var d = await proxyGet("?rpc=get_repair_types&brand="+encodeURIComponent(brand)+"&model="+encodeURIComponent(model)+"&color="+encodeURIComponent(color));
      CACHE.repairTypes[k] = Array.isArray(d) ? d.map(function(r){ return r.repair_type||r; }).filter(Boolean) : [];
    }
    return CACHE.repairTypes[k]||[];
  }
  async function getQualPrices(brand, model, color, repairType) {
    var k = brand+"||"+model+"||"+color+"||"+repairType;
    if(!CACHE.qualPrices[k]) {
      var d = await proxyGet("?rpc=get_qualities_prices&brand="+encodeURIComponent(brand)+"&model="+encodeURIComponent(model)+"&color="+encodeURIComponent(color)+"&repair_type="+encodeURIComponent(repairType));
      CACHE.qualPrices[k] = Array.isArray(d) ? d : [];
    }
    return CACHE.qualPrices[k]||[];
  }

  function getCachedQualPrices(brand, model, color, repairType) {
    return CACHE.qualPrices[brand+"||"+model+"||"+color+"||"+repairType]||[];
  }
  function getCachedVisibleQualPrices(brand, model, color, repairType) {
    var all = getCachedQualPrices(brand, model, color, repairType);
    if(!all.length||!('show_quality' in all[0])) return all;
    return all.filter(function(x){ return x.show_quality; });
  }
  function getCachedPrice(brand, model, color, repairType, quality) {
    var qp = getCachedQualPrices(brand, model, color, repairType).find(function(x){ return x.quality===quality; });
    return qp !== undefined ? qp.price : null;
  }
  function getRepairPriceRange(brand, model, color, repairType) {
    var prices = getCachedVisibleQualPrices(brand, model, color, repairType)
      .map(function(x){ return x.price; }).filter(function(p){ return p!==null&&p!==undefined; });
    if(!prices.length) return "Op aanvraag";
    var mn = Math.min.apply(null,prices), mx = Math.max.apply(null,prices);
    return mn===mx ? displayPrice(mn) : displayPrice(mn)+" – "+displayPrice(mx);
  }

  async function loadData() {
    var v = ++_loadVer;
    DATA.brands = await getBrands();
    if(v !== _loadVer) return false;
    DATA.models  = (state.brand && !state.brandIsCustom) ? await getModels(state.brand) : [];
    if(v !== _loadVer) return false;
    DATA.colors  = (state.brand && state.model && !isCustomDevice()) ? await getColors(state.brand, state.model) : [];
    if(v !== _loadVer) return false;
    if(state.brand && state.model && state.color && !isCustomDevice()) {
      DATA.repairTypes = await getRepairTypes(state.brand, state.model, state.color);
      if(v !== _loadVer) return false;
      await Promise.all(DATA.repairTypes.filter(function(rt){ return !SERVICE_TYPES.has(rt); }).map(function(rt){
        return getQualPrices(state.brand, state.model, state.color, rt);
      }));
      if(v !== _loadVer) return false;
    } else if(isCustomDevice() && state.brand && state.model) {
      DATA.repairTypes = GENERIC_REPAIR_TYPES;
    } else {
      DATA.repairTypes = [];
    }
    return true;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  var state = { step:1, brand:"", model:"", color:"", repairType:"", quality:"", qualityStepShown:false, cart:[], brandIsCustom:false, modelIsCustom:false, priceMode:"incl" };

  function isCustomDevice(){ return state.brandIsCustom||state.modelIsCustom; }
  function hasRepairInCart(){ return state.cart.some(function(i){ return i.type==="repair"; }); }
  function calcCartTotal(){
    var total=0, hasUnknown=false;
    state.cart.forEach(function(i){ if(i.price==null) hasUnknown=true; else total+=Number(i.price)||0; });
    return { total:total, hasUnknown:hasUnknown };
  }
  function getTotalText(){
    var r = calcCartTotal(), t = state.priceMode==="excl" ? r.total/1.21 : r.total;
    if(r.hasUnknown) return t>0 ? "€ "+Math.round(t)+",- + deels op aanvraag" : "Deels op aanvraag";
    return "€ "+Math.round(t)+",-";
  }
  function currentRepairKey(){ return ["repair",state.brand,state.model,state.color,state.repairType,state.quality].join("||"); }
  function canAddRepair(){
    if(isCustomDevice()) return !!(state.brand&&state.model&&state.repairType&&state.quality);
    return !!(state.brand&&state.model&&state.color&&state.repairType&&state.quality);
  }

  function setSelectOptions(el, options, placeholder) {
    if(!el) return;
    el.innerHTML = "";
    var ph = document.createElement("option"); ph.value=""; ph.textContent=placeholder; el.appendChild(ph);
    options.forEach(function(v){ var o=document.createElement("option"); o.value=v; o.textContent=v||"-"; el.appendChild(o); });
  }

  // ── Typeahead ─────────────────────────────────────────────────────────────
  function hideModelResults(){ if(dom.modelResults){ dom.modelResults.style.display="none"; dom.modelResults.innerHTML=""; } }

  function renderDeviceResults(devices) {
    if(!dom.modelResults) return;
    var typedVal = dom.modelSearch ? dom.modelSearch.value.trim() : "";
    var hasExact = devices.some(function(d){ return d.model.toLowerCase()===typedVal.toLowerCase(); });
    var showCustom = typedVal && !hasExact;
    if(!devices.length && !showCustom) {
      dom.modelResults.style.display="block";
      dom.modelResults.innerHTML='<div style="padding:10px 12px;font-weight:900;color:#64748b;">Geen resultaten gevonden</div>';
      return;
    }
    dom.modelResults.style.display="block";
    var html = devices.slice(0,50).map(function(d){
      return '<button type="button" data-brand="'+esc(d.brand)+'" data-model="'+esc(d.model)+'" data-custom="0" style="width:100%;text-align:left;padding:10px 12px;border:0;background:#fff;cursor:pointer;color:#0f172a;display:flex;align-items:baseline;gap:8px;" onmouseover="this.style.background=\'#f1f8fb\'" onmouseout="this.style.background=\'#fff\'"><span style="font-weight:900;">'+esc(d.model)+'</span><span style="font-size:.82rem;color:#94a3b8;font-weight:700;">'+esc(d.brand)+'</span></button>';
    }).join("");
    if(showCustom) html += '<button type="button" data-brand="" data-model="'+esc(typedVal)+'" data-custom="1" style="width:100%;text-align:left;padding:10px 12px;border:0;border-top:1px solid #e2e8f0;background:#fff;cursor:pointer;font-weight:900;color:#0c86ad;" onmouseover="this.style.background=\'#f1f8fb\'" onmouseout="this.style.background=\'#fff\'">Gebruik "<em>'+esc(typedVal)+'</em>" (vrij invullen)</button>';
    dom.modelResults.innerHTML = html;
    dom.modelResults.querySelectorAll("[data-model]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var pm = btn.getAttribute("data-model")||"";
        var pb = btn.getAttribute("data-brand")||"";
        var isCustom = btn.getAttribute("data-custom")==="1";
        if(!pm) return;
        var label = isCustom ? pm : (pb ? pb+" "+pm : pm);
        if(dom.modelSearch) dom.modelSearch.value=label;
        hideModelResults();
        if(isCustom){
          var parts = pm.trim().split(/\s+/);
          setState({ brand: parts.length>1?parts[0]:pm, model: parts.length>1?parts.slice(1).join(" "):pm, brandIsCustom:true, modelIsCustom:true, color:"", repairType:"", quality:"" })
            .then(function(){ requestAnimationFrame(function(){ scrollToEl(dom.issueGroup); }); });
        } else {
          setState({ brand:pb, model:pm, brandIsCustom:false, modelIsCustom:false, color:"", repairType:"", quality:"" })
            .then(function(){ requestAnimationFrame(function(){ scrollToEl(dom.colorGroup); }); });
        }
      }, { once:true });
    });
  }

  // ── Color grid ────────────────────────────────────────────────────────────
  function renderColorGrid(colors) {
    if(!dom.colorGrid) return;
    dom.colorGrid.innerHTML="";
    if(!colors.length){ if(dom.colorHint) dom.colorHint.textContent="Geen kleuren gevonden."; return; }
    if(dom.colorHint) dom.colorHint.textContent="Klik op een kleur om door te gaan.";
    colors.forEach(function(c){
      var wrap=document.createElement("div"); wrap.className="gsmrt__colorwrap";
      var btn=document.createElement("button"); btn.type="button";
      btn.className="gsmrt__colorchip"+(state.color===c?" is-active":"");
      var bg=colorToCss(c); btn.style.background=bg; btn.title=c;
      if(["#ffffff","#f8fafc","#e5e7eb"].includes(bg)) btn.style.border="1px solid rgba(0,0,0,.22)";
      btn.addEventListener("click",function(){ setState({ color:c, repairType:"", quality:"" }).then(function(){ requestAnimationFrame(function(){ scrollToEl(dom.issueGroup); }); }); });
      var lbl=document.createElement("div"); lbl.className="gsmrt__colorlabel"; lbl.textContent=c;
      wrap.appendChild(btn); wrap.appendChild(lbl); dom.colorGrid.appendChild(wrap);
    });
  }

  // ── Repair cards ──────────────────────────────────────────────────────────
  function renderIssueCards(repairTypes) {
    if(!dom.issueGrid) return;
    dom.issueGrid.innerHTML="";
    if(!repairTypes.length){ if(dom.issueHint) dom.issueHint.textContent="Geen reparaties gevonden."; return; }
    if(dom.issueHint) dom.issueHint.textContent="";
    var cartRepairNames = state.cart.filter(function(x){ return x.type==="repair"&&x.brand===state.brand&&x.model===state.model; }).map(function(x){ return x.issue; });

    repairTypes.forEach(function(repair){
      var meta = pickRepairMeta(repair);
      var priceRange = isCustomDevice() ? "Op aanvraag" : getRepairPriceRange(state.brand, state.model, state.color, repair);
      var isDone = cartRepairNames.includes(repair);

      var card=document.createElement("button"); card.type="button";
      card.className="gsmrt__repaircard"+(state.repairType===repair?" is-active":"")+(isDone?" is-done":"");

      var head=document.createElement("div"); head.className="gsmrt__repairhead";
      var title=document.createElement("div"); title.className="gsmrt__repairtitle"; title.textContent=repair;
      var meta_row=document.createElement("div"); meta_row.className="gsmrt__repairmeta";
      if(meta.hot){ var pill=document.createElement("span"); pill.className="gsmrt__pill gsmrt__pill--hot"; pill.textContent="🔥 Populair"; meta_row.appendChild(pill); }
      var dur=document.createElement("span"); dur.className="gsmrt__pill"; dur.textContent="⏱ "+meta.duration; meta_row.appendChild(dur);
      head.appendChild(title); head.appendChild(meta_row);

      var desc=document.createElement("div"); desc.className="gsmrt__repairdesc"; desc.textContent=meta.desc;
      var price=document.createElement("div"); price.className="gsmrt__repairprice"; price.textContent=priceRange;

      card.appendChild(head); card.appendChild(desc); card.appendChild(price);
      if(isDone){ var done=document.createElement("div"); done.className="gsmrt__repairdone"; done.textContent="✓ Toegevoegd"; card.appendChild(done); }

      card.addEventListener("click", function(){
        if(isDone){
          state.cart = state.cart.filter(function(x){ return !(x.type==="repair"&&x.brand===state.brand&&x.model===state.model&&x.issue===repair); });
          if(!hasRepairInCart()) goToStep(1);
          setState({ repairType:"", quality:"" }); return;
        }
        if(repair==="Overige"||repair==="Overige reparatie"){
          state.repairType=repair; state.quality="Standaard"; state.qualityStepShown=false;
          if(canAddRepair()){ addCurrentRepairToCart(); setState({ repairType:"", quality:"" }); } return;
        }
        var visQPs = getCachedVisibleQualPrices(state.brand, state.model, state.color, repair);
        if(visQPs.length===1){
          state.qualityStepShown=false; state.repairType=repair; state.quality=visQPs[0].quality;
          if(canAddRepair()){ addCurrentRepairToCart(); setState({ repairType:"", quality:"" }); } else setState({ repairType:repair, quality:visQPs[0].quality });
        } else if(visQPs.length===0){
          state.qualityStepShown=false;
          var allQPs=getCachedQualPrices(state.brand, state.model, state.color, repair);
          var cheapest=allQPs.reduce(function(best,x){ if(best===null)return x; if(x.price===null)return best; if(best.price===null)return x; return x.price<best.price?x:best; }, null);
          var q=cheapest?cheapest.quality:(allQPs[0]&&allQPs[0].quality)||"";
          state.repairType=repair; state.quality=q;
          if(canAddRepair()){ addCurrentRepairToCart(); setState({ repairType:"", quality:"" }); } else setState({ repairType:repair, quality:q });
        } else {
          state.qualityStepShown=true;
          setState({ repairType:repair, quality:"" }).then(function(){ requestAnimationFrame(function(){ scrollToEl(dom.qualityGroup); }); });
        }
      });
      dom.issueGrid.appendChild(card);
    });
  }

  // ── Quality chips ─────────────────────────────────────────────────────────
  function renderQualityChips(qualities) {
    if(!dom.qualityGrid) return;
    dom.qualityGrid.innerHTML="";
    if(isCustomDevice()&&state.repairType) qualities=GENERIC_QUALITY_OPTIONS;
    qualities = Array.from(qualities).sort(function(a,b){ return (QUALITY_ORDER[String(a).toLowerCase()]||999)-(QUALITY_ORDER[String(b).toLowerCase()]||999); });
    if(!qualities.length){ if(dom.qualityHint) dom.qualityHint.textContent="Geen kwaliteiten gevonden."; return; }
    if(dom.qualityHint) dom.qualityHint.textContent="Kies een kwaliteit. Je kunt daarna toevoegen aan je lijst.";
    qualities.forEach(function(q){
      var p=getCachedPrice(state.brand, state.model, state.color, state.repairType, q);
      var chip=document.createElement("button"); chip.type="button";
      chip.className="gsmrt__qualitychip"+(state.quality===q?" is-active":"");
      var nm=document.createElement("div"); nm.className="gsmrt__qname"; nm.textContent=qualityLabel(q);
      var pr=document.createElement("div"); pr.className="gsmrt__qprice"; pr.textContent=displayPrice(p);
      var qm=pickQualityMeta(q);
      if(qm.hint){ var hint=document.createElement("div"); hint.className="gsmrt__qhint"; hint.textContent=qm.hint; chip.appendChild(nm); chip.appendChild(hint); chip.appendChild(pr); }
      else { chip.appendChild(nm); chip.appendChild(pr); }
      chip.addEventListener("click", function(){
        state.quality=q;
        if(canAddRepair()){ addCurrentRepairToCart(); setState({ repairType:"", quality:"" }); } else setState({ quality:q });
      });
      dom.qualityGrid.appendChild(chip);
    });
  }

  // ── Master render ─────────────────────────────────────────────────────────
  function renderAll() {
    setSelectOptions(dom.brand, DATA.brands, "Kies een merk…");
    if(dom.brand){ var o=document.createElement("option"); o.value="__custom__"; o.textContent="Ander merk (vrij invullen)…"; dom.brand.appendChild(o); }
    if(state.brandIsCustom){ if(dom.brand) dom.brand.value="__custom__"; if(dom.brandCustomInput){ dom.brandCustomInput.style.display=""; dom.brandCustomInput.value=state.brand; } }
    else { if(dom.brand) dom.brand.value=state.brand||""; if(dom.brandCustomInput) dom.brandCustomInput.style.display="none"; }

    setSelectOptions(dom.model, DATA.models, state.brand?"Kies een model…":"Kies eerst een merk…");
    if(dom.model){ dom.model.disabled=!state.brand; dom.model.value=state.model||""; }

    setSelectOptions(dom.color, DATA.colors, (state.brand&&state.model)?"Kies een kleur…":"Kies eerst een model…");
    if(dom.color) dom.color.value=state.color||"";
    renderColorGrid(DATA.colors);

    var repairCards = DATA.repairTypes.filter(function(rt){ return !SERVICE_TYPES.has(rt)&&rt!=="Overige"&&rt!=="Overige reparatie"; });
    var showRepairs = isCustomDevice() ? !!(state.brand&&state.model) : !!(state.brand&&state.model&&state.color);
    if(showRepairs) repairCards.push("Overige");
    setSelectOptions(dom.issue, repairCards, "Kies een type reparatie…");
    if(dom.issue) dom.issue.value=state.repairType||"";
    renderIssueCards(repairCards);

    var qualities = isCustomDevice()
      ? (state.repairType ? GENERIC_QUALITY_OPTIONS : [])
      : getCachedVisibleQualPrices(state.brand, state.model, state.color, state.repairType).map(function(x){ return x.quality; });
    setSelectOptions(dom.quality, qualities, "Kies een kwaliteit…");
    if(dom.quality) dom.quality.value=state.quality||"";
    renderQualityChips(qualities);

    var canNext = hasRepairInCart()||canAddRepair();
    if(dom.addRepair) dom.addRepair.disabled=!canAddRepair();
    if(dom.next){ dom.next.disabled=!canNext; }
    if(dom.sideNext){ dom.sideNext.disabled=!canNext; }
    var step2Btn=dom.stepBtns.find(function(b){ return b.getAttribute("data-gsmrt-stepbtn")==="2"; });
    if(step2Btn) step2Btn.disabled=!hasRepairInCart();
    if(dom.addService) dom.addService.disabled=!(dom.serviceSelect&&dom.serviceSelect.value);

    renderCart(); renderSideTotals(); renderMobileBar();

    // Progressive disclosure
    function revealGroup(el, doShow) {
      if(!el) return;
      if(doShow && el.style.display==="none"){ el.style.display=""; el.classList.add("gsmrt__group--reveal"); el.addEventListener("animationend", function(){ el.classList.remove("gsmrt__group--reveal"); },{ once:true }); }
      else if(!doShow){ el.style.display="none"; el.classList.remove("gsmrt__group--reveal"); }
    }

    var isCustom  = isCustomDevice();
    var hasModel  = !!(state.brand&&state.model);
    var hasColor  = !!(state.brand&&state.model&&state.color);
    var hasRepairT = isCustom ? !!(state.brand&&state.model&&state.repairType) : !!(state.brand&&state.model&&state.color&&state.repairType);
    var collapseToBar = isCustom ? hasModel : hasColor;

    if(collapseToBar){
      if(dom.deviceForm) dom.deviceForm.style.display="none";
      if(dom.colorGroup) dom.colorGroup.style.display="none";
      if(dom.deviceBar) dom.deviceBar.style.display="";
      if(dom.deviceName) dom.deviceName.textContent = isCustom ? state.brand+" "+state.model+" (op aanvraag)" : state.brand+" "+state.model+" ("+state.color+")";
    } else {
      if(dom.deviceForm) dom.deviceForm.style.display="";
      if(dom.deviceBar) dom.deviceBar.style.display="none";
      revealGroup(dom.colorGroup, hasModel&&!isCustom);
    }

    revealGroup(dom.customNotice, isCustom&&hasModel);
    revealGroup(dom.issueGroup,   isCustom ? hasModel : hasColor);

    var visCount = (!isCustom&&state.brand&&state.model&&state.color&&state.repairType)
      ? getCachedVisibleQualPrices(state.brand, state.model, state.color, state.repairType).length
      : (isCustom&&state.repairType ? GENERIC_QUALITY_OPTIONS.length : 0);
    revealGroup(dom.qualityGroup, hasRepairT&&visCount>1);
    revealGroup(dom.actionsGroup, canAddRepair()||hasRepairInCart());
    revealGroup(dom.servicesSection, hasRepairInCart());

    if(dom.addRepair) dom.addRepair.style.display = hasRepairInCart() ? "" : "none";
    if(dom.next) dom.next.style.display = (canAddRepair()||hasRepairInCart()) ? "" : "none";
  }

  // ── Cart ──────────────────────────────────────────────────────────────────
  function renderCart() {
    if(!dom.cartBox) return;
    if(!state.cart.length){ dom.cartBox.style.display="none"; dom.cartBox.innerHTML=""; return; }
    var html = state.cart.map(function(item, idx){
      if(item.type==="service") return '<li class="gsmrt__cartitem"><div style="flex:1;min-width:0;"><div style="font-weight:900;color:#0f172a;font-size:.92rem;">🔧 '+esc(item.title)+'</div>'+(item.note?'<div style="font-size:.82rem;color:#64748b;margin-top:2px;">'+esc(item.note)+'</div>':'')+'<div style="font-weight:1000;color:var(--primary);font-size:.92rem;margin-top:4px;">'+displayPrice(item.price)+'</div></div><button type="button" class="gsmrt__remove" data-remove="'+idx+'" title="Verwijder">✕</button></li>';
      var lines=[item.color?'<span>'+esc(item.color)+'</span>':"",item.issue?'<span>'+esc(item.issue)+'</span>':"",item.qualityVisible&&item.quality?'<span>'+esc(qualityLabel(item.quality))+'</span>':""].filter(Boolean).join('<span style="opacity:.35;margin:0 3px;">·</span>');
      return '<li class="gsmrt__cartitem"><div style="flex:1;min-width:0;"><div style="font-size:1.20rem;color:#64748b;margin-top:3px;line-height:1.4;">'+lines+'</div></div><button type="button" class="gsmrt__remove" data-remove="'+idx+'" title="Verwijder">✕</button></li>';
    }).join("");
    dom.cartBox.style.display="block";
    dom.cartBox.innerHTML='<ul class="gsmrt__cartlist">'+html+'</ul>';
    dom.cartBox.querySelectorAll("[data-remove]").forEach(function(btn){
      btn.addEventListener("click", function(){
        state.cart.splice(Number(btn.getAttribute("data-remove")),1);
        if(!hasRepairInCart()) goToStep(1);
        renderAll();
      },{ once:true });
    });
  }

  function renderSideTotals() {
    if(dom.sideDevice) dom.sideDevice.textContent = (state.brand&&state.model) ? state.brand+" "+state.model : "Kies een toestel";
    var t = state.cart.length ? getTotalText() : "-";
    if(dom.sideSubtotal) dom.sideSubtotal.textContent=t;
    if(dom.sideTotal) dom.sideTotal.textContent=t;
    if(dom.btwLabel) dom.btwLabel.textContent = state.priceMode==="excl" ? "excl. btw (21%)" : "incl. btw (21%)";
  }

  function renderMobileBar() {
    if(!dom.mobileBar) return;
    var canNext=hasRepairInCart()||canAddRepair();
    if(canNext) dom.mobileBar.classList.add("is-visible"); else dom.mobileBar.classList.remove("is-visible");
    if(dom.mobileBarCount){
      var rc=state.cart.filter(function(i){ return i.type==="repair"; }).length;
      var sc=state.cart.filter(function(i){ return i.type==="service"; }).length;
      var p=[]; if(rc) p.push(rc+(rc===1?" reparatie":" reparaties")); if(sc) p.push(sc+(sc===1?" service":" services"));
      dom.mobileBarCount.textContent=p.length?p.join(" + "):"Kies een reparatie";
    }
    if(dom.mobileBarTotal) dom.mobileBarTotal.textContent=state.cart.length?getTotalText():"";
    if(dom.mobileBarBtn) dom.mobileBarBtn.disabled=!canNext;
  }

  function showToast(msg) {
    if(!dom.toastContainer) return;
    var toast=document.createElement("div"); toast.className="gsmrt__toast";
    toast.innerHTML='<span class="gsmrt__toast__icon">✓</span><span>'+esc(msg)+'</span>';
    dom.toastContainer.appendChild(toast);
    setTimeout(function(){ toast.classList.add("is-out"); toast.addEventListener("animationend",function(){ toast.remove(); },{once:true}); },2500);
  }

  function renderSummary() {
    if(!dom.summary) return;
    var list = state.cart.map(function(item){
      if(item.type==="service") return '<div style="margin:0 0 10px;"><strong>Service:</strong> '+esc(item.title)+'<br>'+(item.note?"Opmerking: "+esc(item.note)+"<br>":"")+'Prijs: '+esc(item.price_text||"-")+'</div>';
      return '<div style="margin:0 0 10px;"><strong>'+esc(item.brand)+" "+esc(item.model)+'</strong><br>Kleur: '+esc(item.color||"-")+'<br>Reparatie: '+esc(item.issue||"-")+'<br>'+(item.qualityVisible?"Kwaliteit: "+esc(qualityLabel(item.quality||"-"))+"<br>":"")+'Prijs: '+esc(item.price_text||"-")+'</div>';
    }).join("");
    dom.summary.innerHTML=list+'<strong>Totaal:</strong> '+esc(getTotalText());
  }

  // ── Steps ─────────────────────────────────────────────────────────────────
  function goToStep(step, opts) {
    if(step===2&&!hasRepairInCart()) return;
    state.step=step;
    dom.panels.forEach(function(p){ p.classList.toggle("is-active", p.getAttribute("data-gsmrt-panel")===String(step)); });
    dom.stepBtns.forEach(function(b){ b.classList.toggle("is-active", b.getAttribute("data-gsmrt-stepbtn")===String(step)); });
    if(step===2) renderSummary();
    if(dom.mobileBar){ if(step===2) dom.mobileBar.classList.remove("is-visible"); else renderMobileBar(); }
    if(!(opts&&opts.skipScroll)) window.scrollTo({ top: ROOT.getBoundingClientRect().top+window.scrollY-120, behavior:"smooth" });
  }

  function setState(partial) {
    Object.assign(state, partial);
    return loadData().then(function(wasLatest){ if(wasLatest) renderAll(); });
  }

  // ── Cart actions ──────────────────────────────────────────────────────────
  function addCurrentRepairToCart() {
    if(!canAddRepair()) return false;
    var price = isCustomDevice() ? null : getCachedPrice(state.brand, state.model, state.color, state.repairType, state.quality);
    var item = { type:"repair", brand:state.brand, model:state.model, color:isCustomDevice()?"":state.color, issue:state.repairType, quality:state.quality, qualityVisible:state.qualityStepShown, price:price, price_text:formatPrice(price), key:currentRepairKey() };
    if(!state.cart.some(function(x){ return x.key===item.key; })){ state.cart.push(item); showToast(state.repairType+" toegevoegd"); }
    return true;
  }

  function addServiceToCart() {
    if(!dom.serviceSelect||!dom.serviceSelect.value) return false;
    var parts=String(dom.serviceSelect.value||"").split("||");
    var title=safeStr(parts[0]), price=parts[1]?Number(parts[1]):null, note=safeStr(parts[2]);
    var item={ type:"service", title:title, note:note, price:isNaN(price)?null:price, price_text:formatPrice(isNaN(price)?null:price), key:"service||"+title };
    if(!state.cart.some(function(x){ return x.key===item.key; })){ state.cart.push(item); showToast(title+" toegevoegd"); }
    dom.serviceSelect.value=""; return true;
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function bindEvents() {
    if(dom.btwToggle) dom.btwToggle.addEventListener("change", function(){
      state.priceMode=dom.btwToggle.checked?"incl":"excl";
      if(dom.btwToggleLabel) dom.btwToggleLabel.textContent=dom.btwToggle.checked?"Incl. BTW":"Excl. BTW";
      renderAll();
    });
    dom.stepBtns.forEach(function(btn){ btn.addEventListener("click", function(){ var s=Number(btn.getAttribute("data-gsmrt-stepbtn")); if(s) goToStep(s); }); });

    if(dom.modelSearch){
      var _devCache=null;
      async function getDevs(){ if(!_devCache) _devCache=await getAllDevices(); return _devCache; }
      function filterDevs(q,devs){ if(!q) return devs.slice(0,50); var l=q.toLowerCase(); return devs.filter(function(d){ return d.model.toLowerCase().includes(l)||d.brand.toLowerCase().includes(l)||(d.brand+" "+d.model).toLowerCase().includes(l); }); }
      dom.modelSearch.addEventListener("input", async function(){ var q=dom.modelSearch.value.trim(); if(!q){ hideModelResults(); return; } var devs=await getDevs(); if(dom.modelSearch.value.trim()!==q) return; renderDeviceResults(filterDevs(q, devs)); });
      dom.modelSearch.addEventListener("focus", async function(){ var q=dom.modelSearch.value.trim(); if(!q) return; var devs=await getDevs(); if(dom.modelSearch.value.trim()!==q) return; renderDeviceResults(filterDevs(q, devs)); });
      dom.modelSearch.addEventListener("blur", function(){ setTimeout(hideModelResults,200); });
    }

    if(dom.changeDevice) dom.changeDevice.addEventListener("click", function(){
      if(dom.modelSearch){ dom.modelSearch.value=""; dom.modelSearch.focus(); }
      setState({ brand:"", model:"", color:"", repairType:"", quality:"", brandIsCustom:false, modelIsCustom:false });
    });

    if(dom.serviceSelect) dom.serviceSelect.addEventListener("change", function(){ renderAll(); });
    if(dom.addRepair) dom.addRepair.addEventListener("click", function(){ if(addCurrentRepairToCart()) setState({ repairType:"", quality:"" }).then(function(){ requestAnimationFrame(function(){ scrollToEl(dom.issueGroup); }); }); });
    if(dom.next) dom.next.addEventListener("click", function(){ if(canAddRepair()) addCurrentRepairToCart(); renderAll(); goToStep(2); });
    if(dom.sideNext) dom.sideNext.addEventListener("click", function(){ if(dom.next) dom.next.click(); });
    if(dom.mobileBarBtn) dom.mobileBarBtn.addEventListener("click", function(){ if(dom.next) dom.next.click(); });
    if(dom.back) dom.back.addEventListener("click", function(){ goToStep(1); });
    if(dom.addService) dom.addService.addEventListener("click", function(){ if(addServiceToCart()) renderAll(); });

    if(dom.form) dom.form.addEventListener("submit", async function(e){
      e.preventDefault();
      if(dom.success) dom.success.style.display="none";
      if(dom.error){ dom.error.style.display="none"; dom.error.textContent=""; }
      var firstRepair=state.cart.find(function(i){ return i.type==="repair"; });
      if(!firstRepair){ if(dom.error){ dom.error.style.display="block"; dom.error.textContent="Kies minimaal 1 reparatie."; } return; }
      var totalText=getTotalText();
      var serviceTitles=state.cart.filter(function(i){ return i.type==="service"; }).map(function(s){ return s.title; });
      var combinedIssue=serviceTitles.length ? firstRepair.issue+" + "+serviceTitles.join(" + ") : firstRepair.issue;
      var payload={ customer_name:dom.name?dom.name.value:"", customer_email:dom.email?dom.email.value:"", customer_phone:dom.phone?dom.phone.value:"", brand:firstRepair.brand||"", model:firstRepair.model||"", color:firstRepair.color||"", issue:combinedIssue||"", quality:firstRepair.quality||"", price_text:totalText||"", items:state.cart, price_total_text:totalText, preferred_date:dom.prefDate?dom.prefDate.value:"", preferred_time:dom.prefTime?dom.prefTime.value:"", notes:dom.notes?dom.notes.value.trim():"", status:"pending" };
      if(dom.submitBtn) dom.submitBtn.disabled=true;
      if(dom.submitIcon) dom.submitIcon.classList.add("is-spinning");
      if(dom.submitLabel) dom.submitLabel.textContent="Versturen…";
      try {
        var res=await fetch(API_URL,{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
        if(res.ok){ dom.form.reset(); state.cart=[]; setState({ step:1, brand:"", model:"", color:"", repairType:"", quality:"" }); goToStep(1); if(dom.success) dom.success.style.display="block"; }
        else { var t=await res.text(); if(dom.error){ dom.error.style.display="block"; dom.error.textContent="Fout ("+res.status+"): "+t; } }
      } catch(err){ if(dom.error){ dom.error.style.display="block"; dom.error.textContent="Netwerkfout. Probeer later opnieuw."; } }
      finally { if(dom.submitBtn) dom.submitBtn.disabled=false; if(dom.submitIcon) dom.submitIcon.classList.remove("is-spinning"); if(dom.submitLabel) dom.submitLabel.textContent="Verstuur reparatie-aanvraag"; }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  bindEvents();
  if(dom.loading) dom.loading.classList.add("is-on");
  loadData().then(function(ok){
    if(!ok) return;
    if(dom.loading) dom.loading.classList.remove("is-on");
    renderAll();
    goToStep(1,{ skipScroll:true });
    getAllDevices().catch(function(){});
  }).catch(function(err){
    console.error("[FixIt Pro widget]", err);
    if(dom.loading){ dom.loading.classList.add("is-on"); dom.loading.textContent="Kon data niet laden. Probeer later opnieuw."; }
  });
}
