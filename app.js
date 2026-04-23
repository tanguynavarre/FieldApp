const symptomList    = document.getElementById("symptomList");
const resultDiv      = document.getElementById("result");
const backBtn        = document.getElementById("backBtn");
const searchInput    = document.getElementById("searchInput");
const languageSelect = document.getElementById("languageSelect");
const machineSelect  = document.getElementById("machineSelect");

let rows = [];
let currentObservable = null;

const languageMap = {
  EN: "English",
  FR: "French",
  ES: "Spanish",
  DE: "German",
  IT: "Italian",
  PT: "Portuguese"
};

function initLanguageSelector() {
  languageSelect.innerHTML = "";
  Object.entries(languageMap).forEach(([code, label]) => {
    const opt = document.createElement("option");
    opt.value  = code;
    opt.textContent = `${code} — ${label}`;
    languageSelect.appendChild(opt);
  });
  languageSelect.value = "EN";
}

initLanguageSelector();

/* ── Load data ── */
fetch("data.json")
  .then(r => r.json())
  .then(data => {
    rows = data;

    // Populate machine filter from data
    const machines = [...new Set(data.map(r => r["Machine"]).filter(Boolean))];
    machines.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      machineSelect.appendChild(opt);
    });

    renderObservableList();
  });

/* ── Active rows (respects machine filter) ── */
function filteredRows() {
  const machine = machineSelect.value;
  return machine ? rows.filter(r => r["Machine"] === machine) : rows;
}

/* ── Observable symptom list — what the tech SEES on arrival ── */
function renderObservableList(filter = "") {
  symptomList.innerHTML  = "";
  resultDiv.innerHTML    = "";
  symptomList.classList.remove("hidden");
  backBtn.classList.add("hidden");
  currentObservable = null;

  // Dedupe by Observable Symptom, preserving order
  const seen = new Map();
  filteredRows().forEach(r => {
    const obs = r["Observable Symptom"];
    if (obs && !seen.has(obs)) seen.set(obs, 0);
    if (obs) seen.set(obs, seen.get(obs) + 1);
  });

  [...seen.entries()]
    .filter(([obs]) => obs.toLowerCase().includes(filter.toLowerCase()))
    .forEach(([obs, count]) => {
      const li = document.createElement("li");

      const label = document.createElement("span");
      label.textContent = obs;
      li.appendChild(label);

      const badge = document.createElement("span");
      badge.className   = "count-badge";
      badge.textContent = count;
      li.appendChild(badge);

      li.onclick = () => openObservable(obs);
      symptomList.appendChild(li);
    });
}

searchInput.oninput    = e => renderObservableList(e.target.value);
machineSelect.onchange = () => renderObservableList(searchInput.value);

backBtn.onclick = () => {
  currentObservable = null;
  renderObservableList(searchInput.value);
};

languageSelect.onchange = () => {
  if (currentObservable) openObservable(currentObservable);
};

/* ── Open observable symptom — shows all causes and steps ── */
function openObservable(observable) {
  currentObservable = observable;
  symptomList.classList.add("hidden");
  backBtn.classList.remove("hidden");
  resultDiv.innerHTML = "";

  const data = filteredRows().filter(r => r["Observable Symptom"] === observable);
  if (!data.length) return;

  // Page title
  const titleEl = document.createElement("h2");
  titleEl.className   = "symptom-title";
  titleEl.textContent = observable;
  resultDiv.appendChild(titleEl);

  // Machine badge
  const machine = machineSelect.value;
  if (machine) {
    const badge = document.createElement("div");
    badge.className   = "machine-badge";
    badge.textContent = machine;
    resultDiv.appendChild(badge);
  }

  // Group by Sub-Issue (the possible root cause the tech discovers on inspection)
  const bySubIssue = new Map();
  data.forEach(r => {
    const sub = r["Sub-Issue (Observable / Physical)"] || r["Symptom on Field"] || "Unknown";
    if (!bySubIssue.has(sub)) bySubIssue.set(sub, []);
    bySubIssue.get(sub).push(r);
  });

  // Intro — how many possible causes
  if (bySubIssue.size > 1) {
    const intro = document.createElement("p");
    intro.className   = "causes-intro";
    intro.textContent = `${bySubIssue.size} possible causes found for this machine. Work through them in order.`;
    resultDiv.appendChild(intro);
  }

  let causeIndex = 1;
  for (const [subIssue, subRows] of bySubIssue.entries()) {
    renderSubIssueBlock(subIssue, subRows, causeIndex, bySubIssue.size);
    causeIndex++;
  }
}

/* ── Step ordering ── */
function extractOrder(text) {
  const match = text?.match(/^(\d+)[_\.\-]/);
  return match ? parseInt(match[1], 10) : 999;
}

/* ── Render one possible cause block ── */
function renderSubIssueBlock(subIssue, subRows, index, total) {
  const block = document.createElement("div");
  block.className = "sub-issue-block";

  // Cause heading with number
  const header = document.createElement("div");
  header.className = "sub-issue-header";

  const numEl = document.createElement("span");
  numEl.className   = "cause-num";
  numEl.textContent = `${index}`;
  header.appendChild(numEl);

  const titleEl = document.createElement("span");
  titleEl.className   = "sub-issue-title";
  titleEl.textContent = subIssue;
  header.appendChild(titleEl);

  // Category tag (the component involved)
  const cat = subRows[0]["Category"];
  if (cat) {
    const catTag = document.createElement("span");
    catTag.className   = "category-tag";
    catTag.textContent = cat;
    header.appendChild(catTag);
  }

  block.appendChild(header);

  // Data-backed note
  const noteRow = subRows.find(r => r["Data-backed note"] && r["Data-backed note"] !== "/");
  if (noteRow) {
    const noteEl = document.createElement("div");
    noteEl.className   = "data-note";
    noteEl.textContent = `📊 ${noteRow["Data-backed note"]}`;
    block.appendChild(noteEl);
  }

  // Solve rate / risk
  const statsRow = subRows.find(r => r["Solve Rate"] && r["Solve Rate"] !== "/");
  if (statsRow) {
    const stats = document.createElement("div");
    stats.className = "stats-row";
    const risk = statsRow["Diagnosis Risk"] || "";
    stats.innerHTML = `
      <span class="stat-badge solve">✓ ${statsRow["Solve Rate"]} solved</span>
      ${risk ? `<span class="stat-badge risk-${risk.toLowerCase()}">${risk} risk</span>` : ""}
    `;
    block.appendChild(stats);
  }

  // Split remote vs field rows
  const remoteRows = subRows.filter(r => r["Observability Level"] === "Remote");
  const fieldRows  = subRows.filter(r => r["Observability Level"] !== "Remote");

  if (remoteRows.length) {
    const tag = document.createElement("div");
    tag.className   = "obs-tag obs-remote";
    tag.textContent = "🛰 Remote — Support / Live Support";
    block.appendChild(tag);
    [...remoteRows]
      .sort((a, b) => extractOrder(a["Actions for support"]) - extractOrder(b["Actions for support"]))
      .forEach(r => renderActionRow(r, "support", block));
  }

  if (fieldRows.length) {
    const tag = document.createElement("div");
    tag.className   = "obs-tag obs-field";
    tag.textContent = "🔧 On-site — Maintenance";
    block.appendChild(tag);
    [...fieldRows]
      .sort((a, b) => extractOrder(a["Actions for field"]) - extractOrder(b["Actions for field"]))
      .forEach(r => renderActionRow(r, "field", block));
  }

  // AI context
  const langCode  = languageSelect.value;
  const langLabel = languageMap[langCode] || "English";
  const context   = `Help me solve in ${langLabel}: ${subIssue} (${subRows[0]["Category"]})`;

  const ai = document.createElement("div");
  ai.className = "ai-box";
  ai.innerHTML = `
    <p>${context}</p>
    <button class="copy-btn">📋 Copy context</button>
    <a href="https://bloqit.atlassian.net/wiki/ai" target="_blank">🤖 Open Rovo</a>
  `;
  ai.querySelector(".copy-btn").onclick = () => navigator.clipboard.writeText(context);
  block.appendChild(ai);

  resultDiv.appendChild(block);
}

/* ── Render a single action row ── */
function renderActionRow(r, type, container) {
  const action = document.createElement("div");
  action.className = "action";

  const text   = type === "support"
    ? (r["Actions for support"] || r["Actions for field"])
    : r["Actions for field"];

  const sopUrl = type === "support"
    ? (r["Clear SOP and link__1"] || r["Clear SOP and link"])
    : r["Clear SOP and link"];

  const isRealLink = sopUrl && sopUrl.startsWith("http");

  action.innerHTML = `
    <label>
      <input type="checkbox">
      ${text}
    </label>
    ${isRealLink
      ? `<a class="direct-link" href="${sopUrl}" target="_blank">↗ SOP</a>`
      : `<span class="sop-missing">No SOP link</span>`
    }
    ${r["Spare Parts Required"] && r["Spare Parts Required"] !== "/" && r["Spare Parts Required"] !== "Missing"
      ? `<div class="spare-parts">🔩 <strong>Parts:</strong> ${r["Spare Parts Required"]}</div>`
      : ""
    }
    ${r["Need to Call LP (TRUE / FALSE)"] === "TRUE"
      ? `<div class="lp-alert">📞 Call LP required</div>`
      : ""
    }
  `;

  container.appendChild(action);
}
