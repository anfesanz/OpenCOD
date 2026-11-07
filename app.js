const ALL_COUNTRIES = "All Countries";
const ALL_AGES = "All Ages";

const state = {
  data: null,
  sources: null,
  credits: null,
  country: "Argentina",
  dimension: "region",
  selectedYear: "all",
  selectedAgeGroup: ALL_AGES,
};

// Colour follows the entity, never its rank: each major cause chapter owns a
// fixed categorical slot (validated for colour-vision deficiency in both
// themes); everything else folds into a neutral "Other".
const CAUSE_SLOTS = {
  "Circulatory system": 1,
  Neoplasms: 2,
  "Respiratory system": 3,
  "External causes": 4,
  "Infectious diseases": 5,
  "Endocrine disorders": 6,
  "Digestive system": 7,
  "Ill-defined causes": 8,
};
const OTHER_CAUSES = "Other";

// ----------------------------------------------------------------- helpers
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function safeUrl(url) {
  return /^https?:\/\//i.test(url || "") ? url : "";
}

function isPlaceholder(text) {
  return /^\s*TODO\b/i.test(String(text || ""));
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-GB").format(Math.round(Number(value) || 0));
}

function formatCompact(value) {
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${unit}`;
}

async function fetchJson(path, required = true) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) {
    if (required) throw new Error(`Could not load ${path} (${response.status}).`);
    return null;
  }
  return response.json();
}

// ----------------------------------------------------------------- theme
function storedTheme() {
  try {
    return localStorage.getItem("lac-theme");
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function currentTheme() {
  const explicit = document.documentElement.dataset.theme;
  if (explicit) return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setupTheme() {
  applyTheme(storedTheme());
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem("lac-theme", next);
    } catch {
      /* storage unavailable: theme lasts for this visit only */
    }
    if (state.data) renderCharts();
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.data && !document.documentElement.dataset.theme) renderCharts();
  });
}

// ----------------------------------------------------------------- data access
function getOverview(country) {
  if (country !== ALL_COUNTRIES) {
    return state.data.overview.find((entry) => entry.country_name === country);
  }
  return state.data.overview.reduce(
    (acc, row) => ({
      first_year: Math.min(acc.first_year, Number(row.first_year)),
      last_year: Math.max(acc.last_year, Number(row.last_year)),
      years_available: Math.max(acc.years_available, Number(row.years_available)),
      regions_available: acc.regions_available + Number(row.regions_available),
      causes_available: Math.max(acc.causes_available, Number(row.causes_available)),
      total_deaths: acc.total_deaths + Number(row.total_deaths),
    }),
    {
      first_year: Infinity,
      last_year: -Infinity,
      years_available: 0,
      regions_available: 0,
      causes_available: 0,
      total_deaths: 0,
    }
  );
}

function getProfile(country) {
  return country === ALL_COUNTRIES ? buildCombinedProfile() : state.data.profiles[country];
}

function combineRows(rows, keyField, valueField = "deaths") {
  const totals = new Map();
  for (const row of rows) {
    totals.set(row[keyField], (totals.get(row[keyField]) || 0) + Number(row[valueField] || 0));
  }
  return [...totals.entries()].map(([key, value]) => ({ [keyField]: key, [valueField]: value }));
}

function aggregateBy(rows, fields) {
  const totals = new Map();
  for (const row of rows) {
    const key = fields.map((field) => row[field]).join("|||");
    totals.set(key, (totals.get(key) || 0) + Number(row.deaths || 0));
  }
  return [...totals.entries()].map(([key, deaths]) => {
    const parts = key.split("|||");
    const row = Object.fromEntries(fields.map((field, index) => [field, parts[index]]));
    if ("year" in row) row.year = Number(row.year);
    return { ...row, deaths };
  });
}

let combinedProfileCache = null;
function buildCombinedProfile() {
  if (combinedProfileCache) return combinedProfileCache;
  const profiles = Object.values(state.data.profiles);
  const all = (field) => profiles.flatMap((profile) => profile[field] || []);
  combinedProfileCache = {
    yearly_deaths: combineRows(all("yearly_deaths"), "year").sort((a, b) => a.year - b.year),
    sex_totals: combineRows(all("sex_totals"), "sex").sort((a, b) => b.deaths - a.deaths),
    age_totals: combineRows(all("age_totals"), "age_group"),
    top_regions: combineRows(all("top_regions"), "region")
      .sort((a, b) => b.deaths - a.deaths)
      .slice(0, 15),
    top_causes: combineRows(all("top_causes"), "cause_group")
      .sort((a, b) => b.deaths - a.deaths)
      .slice(0, 15),
    cause_age_year: aggregateBy(all("cause_age_year"), ["year", "age_group", "cause_category"]),
    age_year_totals: aggregateBy(all("age_year_totals"), ["year", "age_group"]),
    available_years: [...new Set(all("available_years"))].sort((a, b) => a - b),
    available_age_groups: [...new Set(all("available_age_groups"))].sort(compareAgeGroups),
  };
  return combinedProfileCache;
}

function parseAgeGroup(ageGroup) {
  const label = String(ageGroup).trim();
  const normalized = label.toLowerCase();
  const numbers = label.match(/\d+/g)?.map(Number) || [];
  if (normalized === "<1 year" || normalized === "<1" || label === "0") {
    return { floor: 0, ceiling: 0.99, openEnded: false, label };
  }
  if (numbers.length >= 2) return { floor: numbers[0], ceiling: numbers[1], openEnded: false, label };
  if (numbers.length === 1 && normalized.includes("+")) {
    return { floor: numbers[0], ceiling: Infinity, openEnded: true, label };
  }
  if (numbers.length === 1) return { floor: numbers[0], ceiling: numbers[0], openEnded: false, label };
  return { floor: Infinity, ceiling: Infinity, openEnded: true, label };
}

function compareAgeGroups(left, right) {
  const a = parseAgeGroup(left);
  const b = parseAgeGroup(right);
  if (a.floor !== b.floor) return a.floor - b.floor;
  if (a.openEnded !== b.openEnded) return a.openEnded ? 1 : -1;
  if (a.ceiling !== b.ceiling) return a.ceiling - b.ceiling;
  return a.label.localeCompare(b.label);
}

// ----------------------------------------------------------------- controls
function updateCauseSelectors() {
  const profile = getProfile(state.country);
  const yearSelect = document.getElementById("year-select");
  const ageSelect = document.getElementById("age-select");
  const years = profile.available_years || [];
  const ageGroups = [...(profile.available_age_groups || [])].sort(compareAgeGroups);

  yearSelect.innerHTML = [`<option value="all">Whole period</option>`]
    .concat(years.map((year) => `<option value="${year}">${year}</option>`))
    .join("");
  if (!years.map(String).includes(String(state.selectedYear))) state.selectedYear = "all";
  yearSelect.value = String(state.selectedYear);

  const ageOptions = [ALL_AGES].concat(ageGroups);
  ageSelect.innerHTML = ageOptions
    .map((age) => `<option value="${escapeHtml(age)}">${escapeHtml(age === ALL_AGES ? "All ages" : age)}</option>`)
    .join("");
  if (!ageOptions.includes(state.selectedAgeGroup)) state.selectedAgeGroup = ALL_AGES;
  ageSelect.value = state.selectedAgeGroup;
}

function setupControls() {
  const countrySelect = document.getElementById("country-select");
  countrySelect.innerHTML = [ALL_COUNTRIES]
    .concat(state.data.meta.countries)
    .map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`)
    .join("");
  state.country = state.data.meta.countries.includes("Argentina") ? "Argentina" : state.data.meta.countries[0];
  countrySelect.value = state.country;
  document.getElementById("dimension-select").value = state.dimension;
  updateCauseSelectors();

  countrySelect.addEventListener("change", (event) => {
    state.country = event.target.value;
    updateCauseSelectors();
    render();
  });
  document.getElementById("dimension-select").addEventListener("change", (event) => {
    state.dimension = event.target.value;
    renderAvailabilityChart();
  });
  document.getElementById("year-select").addEventListener("change", (event) => {
    state.selectedYear = event.target.value;
    renderWaffleChart();
  });
  document.getElementById("age-select").addEventListener("change", (event) => {
    state.selectedAgeGroup = event.target.value;
    renderWaffleChart();
  });
  document.getElementById("country-download").addEventListener("click", () => {
    const item = state.data.downloads?.[state.country];
    if (item) window.LacAuth.download(state.country, item);
  });
}

// ----------------------------------------------------------------- download + sources
function updateDownloadButton() {
  const button = document.getElementById("country-download");
  const label = document.getElementById("country-download-label");
  const detail = document.getElementById("country-download-detail");
  const note = document.getElementById("country-download-note");
  const item = state.data.downloads?.[state.country];
  const { session } = window.LacAuth.state;

  if (state.country === ALL_COUNTRIES || !item) {
    button.disabled = true;
    label.textContent = "Select one country to download";
    detail.textContent = "Age, sex, location, cause code, year and deaths";
    note.textContent = "";
    return;
  }

  if (window.LacAuth.paused) {
    button.disabled = true;
    label.textContent = "Downloads temporarily paused";
    detail.textContent = window.LacAuth.pausedMessage;
    note.textContent = "";
    return;
  }

  button.disabled = false;
  const needsSignIn = window.LacAuth.enabled && !session;
  label.textContent = needsSignIn ? `Sign in to download ${state.country}` : `Download ${state.country} data`;
  const format = window.LacAuth.enabled ? "zipped CSV" : "CSV";
  detail.textContent = `${formatNumber(item.rows)} rows · ${formatBytes(item.bytes)} ${format}`;
  note.textContent = item.note || "";
}

function sourceLinks(entries) {
  return (entries || [])
    .map((entry) => {
      const url = safeUrl(entry.url);
      const name = escapeHtml(entry.institution);
      return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${name}</a>` : name;
    })
    .join("; ");
}

function updateCountrySource() {
  const target = document.getElementById("country-source");
  const entry = state.sources?.countries?.[state.country];
  target.innerHTML = entry ? `Source: ${sourceLinks(entry.mortality)}` : "";
}

function renderSourcesTable() {
  const body = document.getElementById("sources-body");
  const countries = state.sources?.countries || {};
  body.innerHTML = Object.keys(countries)
    .sort((a, b) => a.localeCompare(b))
    .map(
      (country) => `
        <tr>
          <th scope="row">${escapeHtml(country)}</th>
          <td>${sourceLinks(countries[country].mortality)}</td>
          <td>${sourceLinks(countries[country].population)}</td>
        </tr>`
    )
    .join("");
}

// ----------------------------------------------------------------- credits
function renderCredits() {
  const credits = state.credits;
  if (!credits) {
    document.getElementById("about").hidden = true;
    return;
  }
  const mark = (text) => (isPlaceholder(text) ? ` class="placeholder"` : "");
  const project = credits.project || {};

  document.getElementById("about-summary").textContent = project.summary || "";

  document.getElementById("team-list").innerHTML = (credits.team || [])
    .map((person) => {
      const url = safeUrl(person.url);
      const orcid = String(person.orcid || "").trim();
      const name = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(person.name)}</a>`
        : escapeHtml(person.name);
      const orcidLink = orcid
        ? ` <a class="orcid" href="https://orcid.org/${encodeURIComponent(orcid)}" target="_blank" rel="noopener">ORCID</a>`
        : "";
      return `
        <li${mark(person.name)}>
          <strong>${name}</strong>${orcidLink}
          <span${mark(person.role)}>${escapeHtml(person.role)}</span>
          <span class="muted${isPlaceholder(person.affiliation) ? " placeholder" : ""}">${escapeHtml(person.affiliation)}</span>
        </li>`;
    })
    .join("");

  document.getElementById("funder-list").innerHTML = (credits.funders || [])
    .map((funder) => {
      const url = safeUrl(funder.url);
      const name = url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(funder.name)}</a>`
        : escapeHtml(funder.name);
      const grant = funder.grant ? ` <span class="muted">· ${escapeHtml(funder.grant)}</span>` : "";
      const logo = funder.logo
        ? `<img class="credit-logo funder-logo" src="${escapeHtml(funder.logo)}" alt="${escapeHtml(funder.name)} logo" />`
        : "";
      return `<li class="funder-entry"${mark(funder.name)}>${logo}<span>${name}${grant}</span></li>`;
    })
    .join("");

  const ack = document.getElementById("acknowledgements");
  ack.textContent = credits.acknowledgements || "";
  ack.classList.toggle("placeholder", isPlaceholder(credits.acknowledgements));

  const citation = document.getElementById("citation");
  citation.textContent = credits.citation || "";
  citation.classList.toggle("placeholder", isPlaceholder(credits.citation));
  document.getElementById("copy-citation").addEventListener("click", async (event) => {
    try {
      await navigator.clipboard.writeText(credits.citation || "");
      event.target.textContent = "Copied";
      setTimeout(() => (event.target.textContent = "Copy citation"), 1600);
    } catch {
      event.target.textContent = "Select and copy the text above";
    }
  });

  const license = credits.license || {};
  const licenseUrl = safeUrl(license.url);
  const licenseName = escapeHtml(license.name || "");
  document.getElementById("license").innerHTML = license.name
    ? `<span${mark(license.name)}>Data licence: ${
        licenseUrl ? `<a href="${escapeHtml(licenseUrl)}" target="_blank" rel="noopener">${licenseName}</a>` : licenseName
      }</span>`
    : "";

  const repo = safeUrl(project.repository);
  const repoLink = document.getElementById("footer-repo");
  if (repo) {
    repoLink.href = repo;
    repoLink.hidden = false;
  }
}

function renderHeroFacts() {
  const overview = getOverview(ALL_COUNTRIES);
  const facts = [
    [String(state.data.meta.countries.length), "countries"],
    [formatCompact(overview.total_deaths), "recorded deaths"],
    [`${overview.first_year}–${overview.last_year}`, "years"],
  ];
  document.getElementById("hero-facts").innerHTML = facts
    .map(([value, label]) => `<li><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></li>`)
    .join("");
}

// ----------------------------------------------------------------- KPIs
function renderKpis() {
  const overview = getOverview(state.country);
  const items = [
    ["Years covered", `${overview.first_year}–${overview.last_year}`],
    ["Years with data", formatNumber(overview.years_available)],
    ["Regions", formatNumber(overview.regions_available)],
    ["Distinct cause codes", formatNumber(overview.causes_available)],
    ["Recorded deaths", formatNumber(overview.total_deaths)],
  ];
  document.getElementById("kpi-grid").innerHTML = items
    .map(
      ([label, value]) => `
        <article class="kpi-card">
          <span class="kpi-label">${label}</span>
          <span class="kpi-value">${value}</span>
        </article>`
    )
    .join("");
}

// ----------------------------------------------------------------- charts
const PLOT_CONFIG = { responsive: true, displayModeBar: false };

function baseLayout() {
  return {
    margin: { l: 56, r: 16, t: 8, b: 44 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: token("--ink"), family: token("--font-sans"), size: 12 },
    hoverlabel: {
      bgcolor: token("--panel-strong"),
      bordercolor: token("--line-strong"),
      font: { color: token("--ink"), family: token("--font-sans") },
    },
    xaxis: { gridcolor: token("--grid"), zeroline: false, linecolor: token("--line-strong"), fixedrange: true },
    yaxis: { gridcolor: token("--grid"), zeroline: false, fixedrange: true, automargin: true },
    bargap: 0.28,
  };
}

function renderYearlyChart() {
  const rows = getProfile(state.country).yearly_deaths;
  const accent = token("--chart-accent");
  const layout = baseLayout();
  layout.yaxis = { ...layout.yaxis, title: { text: "Deaths" }, rangemode: "tozero", tickformat: "~s" };
  layout.xaxis = { ...layout.xaxis, showgrid: false, dtick: rows.length > 12 ? 5 : 1 };
  layout.hovermode = "x unified";
  Plotly.react(
    "yearly-chart",
    [
      {
        x: rows.map((row) => row.year),
        y: rows.map((row) => row.deaths),
        type: "scatter",
        mode: "lines+markers",
        line: { color: accent, width: 2 },
        marker: { size: 8, color: accent, line: { color: token("--panel-strong"), width: 2 } },
        fill: "tozeroy",
        fillcolor: token("--chart-accent-fill"),
        hovertemplate: "%{y:,.0f} deaths<extra></extra>",
      },
    ],
    layout,
    PLOT_CONFIG
  );
}

function renderSexChart() {
  const rows = getProfile(state.country).sex_totals;
  const colors = { Male: token("--series-1"), Female: token("--series-2") };
  const layout = baseLayout();
  layout.margin = { l: 10, r: 10, t: 10, b: 10 };
  layout.showlegend = false; // slices are labelled directly
  Plotly.react(
    "sex-chart",
    [
      {
        labels: rows.map((row) => row.sex),
        values: rows.map((row) => row.deaths),
        type: "pie",
        hole: 0.58,
        sort: false,
        direction: "clockwise",
        marker: {
          colors: rows.map((row) => colors[row.sex] || token("--series-other")),
          line: { color: token("--panel-strong"), width: 2 },
        },
        textinfo: "label+percent",
        textposition: "outside",
        textfont: { color: token("--ink"), size: 13 },
        hovertemplate: "%{label}<br>%{value:,.0f} deaths (%{percent})<extra></extra>",
      },
    ],
    layout,
    PLOT_CONFIG
  );
}

function renderAvailabilityChart() {
  const dimension = state.dimension;
  const allCountries = state.country === ALL_COUNTRIES;
  let rows = state.data.availability[dimension];
  if (!allCountries) rows = rows.filter((row) => row.country_name === state.country);

  if (dimension === "age_group") {
    rows = [...rows].sort((a, b) => compareAgeGroups(b.age_group, a.age_group));
  } else {
    rows = [...rows].sort((a, b) => b.total_deaths - a.total_deaths).slice(0, 20).reverse();
  }

  const label = (row) => {
    let text = String(row[dimension]);
    if (dimension === "cause_group") {
      const name = window.icdLabel(text);
      if (name) text = `${text} · ${name}`;
    }
    return allCountries ? `${text} (${row.country_name})` : text;
  };

  const layout = baseLayout();
  layout.margin = { l: 8, r: 16, t: 8, b: 44 };
  layout.xaxis = { ...layout.xaxis, title: { text: "Year" }, dtick: 5 };
  layout.yaxis = { ...layout.yaxis, showgrid: false, type: "category" };

  Plotly.react(
    "availability-chart",
    [
      {
        type: "bar",
        orientation: "h",
        y: rows.map(label),
        base: rows.map((row) => Number(row.first_year) - 0.5),
        x: rows.map((row) => Number(row.last_year) - Number(row.first_year) + 1),
        marker: {
          color: rows.map((row) => Number(row.availability_pct)),
          cmin: 0,
          cmax: 100,
          colorscale: [
            [0, token("--seq-low")],
            [1, token("--seq-high")],
          ],
          line: { width: 0 },
        },
        customdata: rows.map((row) => [
          row.first_year,
          row.last_year,
          Number(row.availability_pct).toFixed(0),
          formatNumber(row.total_deaths),
        ]),
        hovertemplate:
          "%{y}<br>%{customdata[0]}–%{customdata[1]} · %{customdata[2]}% of years covered<br>%{customdata[3]} deaths<extra></extra>",
      },
    ],
    layout,
    PLOT_CONFIG
  );
}

function renderHorizontalBar(targetId, rows, labelFn) {
  const layout = baseLayout();
  layout.margin = { l: 8, r: 16, t: 8, b: 44 };
  layout.xaxis = { ...layout.xaxis, title: { text: "Deaths" }, tickformat: "~s" };
  layout.yaxis = { ...layout.yaxis, showgrid: false, type: "category" };
  Plotly.react(
    targetId,
    [
      {
        x: rows.map((row) => row.deaths),
        y: rows.map(labelFn),
        type: "bar",
        orientation: "h",
        marker: { color: token("--chart-accent") },
        hovertemplate: "%{y}<br>%{x:,.0f} deaths<extra></extra>",
      },
    ],
    layout,
    PLOT_CONFIG
  );
}

function causeLabel(row) {
  const code = String(row.cause_group);
  const name = window.icdLabel(code);
  if (!name || code === "ALL") return name || code;
  const short = name.length > 30 ? `${name.slice(0, 29)}…` : name;
  return `${short} (${code})`;
}

function renderAgeChart() {
  const rows = [...getProfile(state.country).age_totals].sort((a, b) => compareAgeGroups(a.age_group, b.age_group));
  const layout = baseLayout();
  layout.margin = { l: 56, r: 16, t: 8, b: 64 };
  layout.xaxis = { ...layout.xaxis, type: "category", tickangle: -45, showgrid: false };
  layout.yaxis = { ...layout.yaxis, title: { text: "Deaths" }, tickformat: "~s" };
  Plotly.react(
    "age-chart",
    [
      {
        x: rows.map((row) => row.age_group),
        y: rows.map((row) => row.deaths),
        type: "bar",
        marker: { color: token("--chart-accent") },
        hovertemplate: "Age %{x}<br>%{y:,.0f} deaths<extra></extra>",
      },
    ],
    layout,
    PLOT_CONFIG
  );
}

// ----------------------------------------------------------------- waffle
function causeColor(category) {
  const slot = CAUSE_SLOTS[category];
  return slot ? token(`--series-${slot}`) : token("--series-other");
}

function buildWaffleRows() {
  const profile = getProfile(state.country);
  const matches = (row) =>
    (state.selectedYear === "all" || String(row.year) === String(state.selectedYear)) &&
    (state.selectedAgeGroup === ALL_AGES || row.age_group === state.selectedAgeGroup);

  const totals = new Map();
  for (const row of (profile.cause_age_year || []).filter(matches)) {
    const category = CAUSE_SLOTS[row.cause_category] || row.cause_category === "All causes (aggregate only)"
      ? row.cause_category
      : OTHER_CAUSES;
    totals.set(category, (totals.get(category) || 0) + Number(row.deaths || 0));
  }
  const totalDeaths = (profile.age_year_totals || [])
    .filter(matches)
    .reduce((sum, row) => sum + Number(row.deaths || 0), 0);

  // Named chapters by size, "Other" always last.
  const rows = [...totals.entries()]
    .map(([cause_category, deaths]) => ({ cause_category, deaths }))
    .sort((a, b) =>
      a.cause_category === OTHER_CAUSES ? 1 : b.cause_category === OTHER_CAUSES ? -1 : b.deaths - a.deaths
    );
  return { rows, totalDeaths };
}

function allocateWaffleCells(rows, totalDeaths) {
  const assigned = rows.map((row) => {
    const exact = (row.deaths / totalDeaths) * 100;
    return { ...row, cells: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = 100 - assigned.reduce((sum, row) => sum + row.cells, 0);
  [...assigned]
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((row) => {
      if (remaining > 0) {
        row.cells += 1;
        remaining -= 1;
      }
    });
  return assigned;
}

function renderWaffleChart() {
  const subtitle = document.getElementById("waffle-subtitle");
  const chart = document.getElementById("waffle-chart");
  const legend = document.getElementById("waffle-legend");
  const ageLabel = state.selectedAgeGroup === ALL_AGES ? "All ages" : `Age ${state.selectedAgeGroup}`;
  const periodLabel = state.selectedYear === "all" ? "whole period" : String(state.selectedYear);
  const { rows, totalDeaths } = buildWaffleRows();

  subtitle.textContent = `${ageLabel} · ${formatNumber(totalDeaths)} deaths in ${state.country} (${periodLabel}).`;

  if (!rows.length || totalDeaths <= 0) {
    chart.innerHTML = `<p class="muted">No cause data available for this selection.</p>`;
    legend.innerHTML = "";
    return;
  }

  const allocated = allocateWaffleCells(rows, totalDeaths);
  const cells = [];
  const legendRows = [];
  for (const row of allocated) {
    const color = causeColor(row.cause_category);
    const share = (row.deaths / totalDeaths) * 100;
    const title = `${row.cause_category}: ${formatNumber(row.deaths)} deaths (${share.toFixed(1)}%)`;
    for (let i = 0; i < row.cells; i += 1) {
      cells.push(`<div class="waffle-cell" style="background:${color}" title="${escapeHtml(title)}"></div>`);
    }
    legendRows.push(`
      <div class="waffle-legend-item">
        <span class="waffle-swatch" style="background:${color}"></span>
        <span class="waffle-label">${escapeHtml(row.cause_category)}</span>
        <span class="waffle-value">${share.toFixed(1)}%</span>
      </div>`);
  }
  chart.innerHTML = cells.join("");
  legend.innerHTML = legendRows.join("");
}

// ----------------------------------------------------------------- render
function renderCharts() {
  const profile = getProfile(state.country);
  renderYearlyChart();
  renderSexChart();
  renderAvailabilityChart();
  renderHorizontalBar("region-chart", [...profile.top_regions].reverse(), (row) => row.region);
  renderHorizontalBar("cause-chart", [...profile.top_causes].reverse(), causeLabel);
  renderAgeChart();
  renderWaffleChart();
}

function render() {
  renderKpis();
  renderCharts();
  updateDownloadButton();
  updateCountrySource();
}

async function main() {
  setupTheme();
  document.getElementById("footer-year").textContent = new Date().getFullYear();
  const [data, sources, credits] = await Promise.all([
    fetchJson("./data/dashboard_data.json"),
    fetchJson("./content/sources.json", false),
    fetchJson("./content/credits.json", false),
  ]);
  Object.assign(state, { data, sources, credits });

  setupControls();
  renderHeroFacts();
  renderSourcesTable();
  renderCredits();
  render();
  document.getElementById("loading").hidden = true;

  window.LacAuth.onChange(updateDownloadButton);
  await window.LacAuth.init();
}

main().catch((error) => {
  console.error(error);
  const loading = document.getElementById("loading");
  loading.classList.add("error");
  loading.innerHTML = `<span>Dashboard data could not be loaded: ${escapeHtml(error.message)}<br />
    Locally, run <code>make dashboard-data</code> and reload.</span>`;
});
