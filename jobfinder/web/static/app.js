"use strict";

// All job text comes from third-party postings, so it is only ever inserted with textContent, never innerHTML.

const state = { jobs: [], selected: null, detail: null, tab: "jd", generating: false, pollTimer: null };
const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) {
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }
  return node;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
  return data;
}

// Logos ---------------------------------------------------------------------------------------------------

const PALETTE = ["#1f5fae", "#2f7d4f", "#8a4fbf", "#b0532b", "#0f7c8c", "#a1407a", "#5b6b1f", "#3d55c4"];

function initials(name) {
  const words = (name || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
}

function colorFor(name) {
  let hash = 0;
  for (const ch of name || "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function logoSources(job) {
  const sources = [];
  if (job.logo_url && /^https?:\/\//i.test(job.logo_url)) sources.push(job.logo_url);
  if (job.company_domain) sources.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(job.company_domain)}.ico`);
  return sources;
}

// Shows initials at once; swaps in the real logo only after it has loaded, so a slow or missing icon never
// leaves an empty box.
function logo(job, big = false) {
  const box = el("div", { class: big ? "logo big" : "logo", "aria-hidden": "true" }, initials(job.company));
  box.style.background = colorFor(job.company);
  box.style.borderColor = "transparent";
  const sources = logoSources(job);
  let index = 0;
  const tryNext = () => {
    if (index >= sources.length) return;
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.alt = "";
    img.onload = () => {
      if (img.naturalWidth < 8) { index += 1; tryNext(); return; }  // tracking pixels and blank placeholders
      box.replaceChildren(img);
      box.style.background = "#fff";
      box.style.borderColor = "";
    };
    img.onerror = () => { index += 1; tryNext(); };
    img.src = sources[index];
  };
  tryNext();
  return box;
}

// Formatting ----------------------------------------------------------------------------------------------

function ago(iso) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function visaChip(job) {
  return el("span", { class: `chip ${job.visa_status}`, text: job.visa_label || "Not mentioned" });
}

function metaChips(job, detailed = false) {
  const chips = [visaChip(job)];
  if (job.is_new) chips.push(el("span", { class: "chip new", text: "New" }));
  chips.push(el("span", { class: "chip", text: job.country_name || job.location || "Europe" }));
  if (job.posted_at) chips.push(el("span", { class: "chip", text: ago(job.posted_at) }));
  if (job.salary) chips.push(el("span", { class: "chip", text: job.salary }));
  if (job.remote) chips.push(el("span", { class: "chip", text: "Remote" }));
  if (job.status && job.status !== "new") chips.push(el("span", { class: "chip status", text: job.status[0].toUpperCase() + job.status.slice(1) }));
  if (detailed) {
    if (job.location && job.location !== job.country_name) chips.push(el("span", { class: "chip", text: job.location }));
    if (job.known_sponsor) chips.push(el("span", { class: "chip likely", text: "On official sponsor register" }));
    (job.sources || []).forEach((s) => chips.push(el("span", { class: "chip", text: `via ${s}` })));
  }
  return chips;
}

// Description: blank lines separate paragraphs, lines starting with "•" become list items.
function renderDescription(text) {
  const box = el("div", { class: "jd" });
  if (!text) { box.append(el("p", { class: "muted", text: "This posting has no description. Open it on the company site." })); return box; }
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    let list = null;
    let para = [];
    const flush = () => { if (para.length) { box.append(el("p", { text: para.join(" ") })); para = []; } };
    for (const line of lines) {
      if (line.startsWith("•") || /^[-*]\s/.test(line)) {
        flush();
        if (!list) { list = el("ul"); box.append(list); }
        list.append(el("li", { text: line.replace(/^[•\-*]\s*/, "") }));
      } else {
        list = null;
        para.push(line);
      }
    }
    flush();
  }
  return box;
}

// List ----------------------------------------------------------------------------------------------------

function filtered() {
  const q = $("q").value.trim().toLowerCase();
  const visa = $("visa").value, country = $("country").value, status = $("status").value, onlyNew = $("onlyNew").checked;
  const jobs = state.jobs.filter((j) =>
    (!visa || j.visa_status === visa) &&
    (!country || j.country_name === country) &&
    (status === "all" || (status === "open" ? !["hidden", "applied"].includes(j.status) : j.status === status)) &&
    (!onlyNew || j.is_new) &&
    (!q || `${j.title} ${j.company} ${j.location} ${(j.tags || []).join(" ")}`.toLowerCase().includes(q)));
  const sort = $("sort").value;
  if (sort === "posted") jobs.sort((a, b) => (b.posted_at || "").localeCompare(a.posted_at || ""));
  else if (sort === "company") jobs.sort((a, b) => a.company.localeCompare(b.company));
  else jobs.sort((a, b) => b.score - a.score);
  return jobs;
}

function renderList() {
  const list = $("list");
  if (!state.jobs.length) { list.replaceChildren($("emptyState").content.cloneNode(true)); return; }
  const jobs = filtered();
  if (!jobs.length) { list.replaceChildren(el("div", { class: "empty" }, el("p", { text: "No jobs match these filters." }))); return; }
  list.replaceChildren(...jobs.map((job) => el("button", {
    class: `card${job.id === state.selected ? " selected" : ""}${job.active === false ? " dim" : ""}`,
    type: "button",
    title: job.active === false ? "Not seen in the latest search; the posting may have closed." : null,
    onclick: () => select(job.id),
  },
    logo(job),
    el("div", {},
      el("div", { class: "card-title", text: job.title }),
      el("div", { class: "card-company", text: job.company }),
      el("div", { class: "card-meta" }, metaChips(job))),
    el("div", { class: "score", title: "Match score out of 100" }, String(job.score), el("small", { text: "match" })),
  )));
}

function renderSummary() {
  const total = state.jobs.length;
  const sponsored = state.jobs.filter((j) => j.visa_status === "sponsored").length;
  const fresh = state.jobs.filter((j) => j.is_new).length;
  $("summary").textContent = total
    ? `${total} matches · ${sponsored} with visa sponsorship · ${fresh} new`
    : "Visa-sponsorship jobs in Europe";
}

// Detail --------------------------------------------------------------------------------------------------

async function select(id, { push = true } = {}) {
  if (state.selected !== id) Object.assign(state, { letterId: null, letterError: null, letterNotice: null, notes: "" });
  state.selected = id;
  if (push) history.replaceState(null, "", `#job=${id}`);
  document.body.classList.add("show-detail");
  renderList();
  const detail = $("detail");
  detail.replaceChildren(el("div", { class: "empty-detail" }, el("span", { class: "spinner" })));
  try {
    state.detail = await api(`/api/jobs/${encodeURIComponent(id)}`);
    if (state.selected === id) renderDetail();
  } catch (err) {
    detail.replaceChildren(el("div", { class: "error", text: err.message }));
  }
}

function renderDetail() {
  const job = state.detail;
  const companyLine = el("div", { class: "d-company" }, job.company);
  if (job.company_domain) {
    companyLine.append(" · ", el("a", { href: `https://${job.company_domain}`, target: "_blank", rel: "noopener", text: job.company_domain }));
  }
  const statusButton = (status, label) => el("button", {
    class: `btn small${job.status === status ? " on" : ""}`, type: "button",
    "aria-pressed": job.status === status ? "true" : "false",
    onclick: () => setStatus(job.status === status ? "new" : status),
  }, label);

  const tabs = [["jd", "Job description"], ["why", "Why it matches"], ["letter", `Cover letter${job.letters?.length ? ` (${job.letters.length})` : ""}`]];
  $("detail").replaceChildren(
    el("button", { class: "btn small back", type: "button", onclick: closeDetail }, "← All jobs"),
    el("div", { class: "d-head" }, logo(job, true), el("div", {},
      el("h1", { class: "d-title", text: job.title }), companyLine,
      el("div", { class: "d-meta" }, metaChips(job, true)))),
    el("div", { class: "d-actions" },
      /^https?:\/\//i.test(job.url) ? el("a", { class: "btn primary", href: job.url, target: "_blank", rel: "noopener" }, "Apply on company site ↗") : null,
      el("button", { class: "btn", type: "button", onclick: () => { state.tab = "letter"; renderDetail(); generateLetter(); } }, "✍ Generate cover letter"),
      statusButton("saved", "★ Save"), statusButton("applied", "✓ Applied"), statusButton("hidden", "Hide")),
    el("div", { class: "tabs", role: "tablist" }, tabs.map(([key, label]) => el("button", {
      class: "tab", role: "tab", type: "button", "aria-selected": state.tab === key ? "true" : "false",
      onclick: () => { state.tab = key; renderDetail(); },
    }, label))),
    el("div", { class: "panel", role: "tabpanel" }, renderPanel(job)),
  );
}

function renderPanel(job) {
  if (state.tab === "why") {
    return el("div", { class: "why" },
      el("h3", { text: `Match score: ${job.score} / 100` }),
      job.visa_evidence?.length
        ? [el("p", { class: "muted", text: "What the posting says about visas and relocation:" }),
           job.visa_evidence.map((e) => el("div", { class: "evidence", text: e }))]
        : el("p", { class: "muted", text: "The posting does not mention visas or relocation. Ask the recruiter whether they can sponsor." }),
      el("ul", {}, (job.reasons || []).map((r) => el("li", { text: r }))));
  }
  if (state.tab === "letter") return renderLetterPanel(job);
  return renderDescription(job.description);
}

function renderLetterPanel(job) {
  const latest = job.letters?.[0];
  const notes = el("textarea", { class: "cl-notes", id: "clNotes", maxlength: "2000",
    placeholder: "Optional: anything true to mention, e.g. \"available from January\" or \"I use their product\"." });
  notes.value = state.notes || "";
  notes.addEventListener("input", () => { state.notes = notes.value; });

  const panel = el("div", {},
    el("p", { class: "muted", text: "Written from your resume and this job description. It only uses facts from your resume; read it and edit before sending." }),
    notes,
    el("div", { class: "cl-row" },
      el("button", { class: "btn primary", type: "button", disabled: state.generating, onclick: generateLetter },
        state.generating ? [el("span", { class: "spinner" }), " Writing…"] : (latest ? "Write a new version" : "Generate cover letter"))),
  );
  if (state.letterError) panel.append(el("div", { class: "error", text: state.letterError }));
  if (state.letterNotice) panel.append(el("div", { class: "notice", text: state.letterNotice }));
  if (latest) {
    const shown = job.letters.find((l) => l.id === state.letterId) || latest;
    const text = el("textarea", { class: "cl-text", "aria-label": "Cover letter" });
    text.value = shown.text;
    const copyBtn = el("button", { class: "btn small", type: "button", onclick: async () => {
      await navigator.clipboard.writeText(text.value);
      copyBtn.textContent = "Copied ✓";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
    } }, "Copy");
    panel.append(
      el("div", { class: "cl-row" }, copyBtn,
        el("button", { class: "btn small", type: "button", onclick: () => download(job, text.value) }, "Download .txt"),
        el("span", { class: "muted", text: `${shown.generator === "template" ? "Template" : "Written by Claude"} · ${new Date(shown.created_at).toLocaleString()}` })),
      text);
    if (job.letters.length > 1) {
      panel.append(el("div", { class: "history" }, el("div", { class: "muted", text: "Earlier versions:" }),
        job.letters.map((l, i) => el("div", {}, el("button", { type: "button", onclick: () => { state.letterId = l.id; renderDetail(); } },
          `Version ${job.letters.length - i} · ${new Date(l.created_at).toLocaleString()}${l.id === shown.id ? " (shown)" : ""}`)))));
    }
  }
  return panel;
}

function download(job, text) {
  const name = `Cover letter - ${job.company} - ${job.title}`.replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 120);
  const link = el("a", { href: URL.createObjectURL(new Blob([text], { type: "text/plain" })), download: `${name}.txt` });
  link.click();
  URL.revokeObjectURL(link.href);
}

async function generateLetter() {
  if (state.generating || !state.detail) return;
  const id = state.detail.id;
  state.generating = true;
  state.letterError = state.letterNotice = null;
  renderDetail();
  try {
    const letter = await api(`/api/jobs/${encodeURIComponent(id)}/cover-letter`, { method: "POST", body: { notes: state.notes || "" } });
    if (state.detail?.id === id) {
      state.detail.letters = [letter, ...(state.detail.letters || [])];
      state.letterId = letter.id;
      state.letterNotice = letter.notice || null;
    }
  } catch (err) {
    state.letterError = err.message;
  } finally {
    state.generating = false;
    if (state.detail?.id === id) renderDetail();
  }
}

async function setStatus(status) {
  const job = state.detail;
  await api(`/api/jobs/${encodeURIComponent(job.id)}/status`, { method: "POST", body: { status } });
  job.status = status;
  const row = state.jobs.find((j) => j.id === job.id);
  if (row) row.status = status;
  renderDetail();
  renderList();
}

function closeDetail() {
  document.body.classList.remove("show-detail");
  history.replaceState(null, "", location.pathname);
}

// Search runs ---------------------------------------------------------------------------------------------

function renderSearchState(search) {
  const label = $("searchState");
  const button = $("refreshBtn");
  button.disabled = !!search?.running;
  button.replaceChildren(...(search?.running ? [el("span", { class: "spinner" }), " Searching…"] : ["Find new jobs"]));
  label.classList.toggle("error", !!search?.error);
  label.textContent = search?.error ? `Search failed: ${search.error}` : (search?.message || "");
}

async function startSearch() {
  try {
    renderSearchState(await api("/api/search", { method: "POST" }));
    pollSearch();
  } catch (err) {
    renderSearchState({ error: err.message });
  }
}

function pollSearch() {
  clearTimeout(state.pollTimer);
  state.pollTimer = setTimeout(async () => {
    const search = await api("/api/search").catch(() => null);
    renderSearchState(search);
    if (search?.running) pollSearch(); else loadJobs();
  }, 2000);
}

async function loadJobs() {
  const data = await api("/api/jobs");
  state.jobs = data.jobs;
  const country = $("country");
  const current = country.value;
  country.replaceChildren(el("option", { value: "", text: "All countries" }), ...data.countries.map((c) => el("option", { value: c, text: c })));
  country.value = data.countries.includes(current) ? current : "";
  renderSummary();
  renderList();
  renderSearchState(data.search);
  if (data.search?.running) pollSearch();
}

// Start ---------------------------------------------------------------------------------------------------

["q", "visa", "country", "status", "sort", "onlyNew"].forEach((id) => $(id).addEventListener("input", renderList));
$("refreshBtn").addEventListener("click", startSearch);

loadJobs().then(() => {
  const match = location.hash.match(/job=([\w-]+)/);
  const tab = location.hash.match(/tab=(jd|why|letter)/);
  if (tab) state.tab = tab[1];
  if (match && state.jobs.some((j) => j.id === match[1])) select(match[1], { push: false });
  else if (state.jobs.length && window.matchMedia("(min-width: 821px)").matches) select(filtered()[0]?.id ?? state.jobs[0].id);
}).catch((err) => {
  $("list").replaceChildren(el("div", { class: "error", text: `Could not load jobs: ${err.message}` }));
});
