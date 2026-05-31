/**
 * Global Sustainable Energy Dashboard — script.js
 * UC3DVS10 Data Visualisation · Assessment 3 · Task 2
 *
 * Architecture
 * ─────────────────────────────────────────────────────────────────
 * · CSV is loaded once via d3.csv(); all subsequent updates are in-memory.
 * · `state` is the single source of truth for filters and selection.
 * · `render(rows)` rebuilds every panel whenever state changes.
 * · selectCountry(name) updates state and calls render().
 * · All numeric coercions happen in coerce() immediately after load.
 *
 * CSV file expected: global-data-on-sustainable-energy.csv (in ./data/)
 */

"use strict";

let worldData = null;

/* ─────────────────────────────────────────────────────────────────
   CONSTANTS
   ───────────────────────────────────────────────────────────────── */

const CSV_FILE = "./data/global-data-on-sustainable-energy.csv";

/* Numeric columns to coerce from strings */
const NUM_COLS = [
  "Year",
  "Access to electricity (% of population)",
  "Access to clean fuels for cooking",
  "Renewable-electricity-generating-capacity-per-capita",
  "Financial flows to developing countries (US $)",
  "Renewable energy share in the total final energy consumption (%)",
  "Electricity from fossil fuels (TWh)",
  "Electricity from nuclear (TWh)",
  "Electricity from renewables (TWh)",
  "Low-carbon electricity (% electricity)",
  "Primary energy consumption per capita (kWh/person)",
  "Energy intensity level of primary energy (MJ/$2017 PPP GDP)",
  "Value_co2_emissions_kt_by_country",
  "Renewables (% equivalent primary energy)",
  "gdp_growth",
  "gdp_per_capita",
  "Land Area(Km2)",
  "Latitude",
  "Longitude"
];

/* Regional groupings for colour encoding in scatter chart */
const REGION_MAP = {
  "Africa": ["Algeria","Angola","Benin","Botswana","Burkina Faso","Burundi","Cabo Verde",
    "Cameroon","Central African Republic","Chad","Comoros","Congo","Cote d'Ivoire",
    "DR Congo","Djibouti","Egypt","Equatorial Guinea","Eritrea","Eswatini","Ethiopia",
    "Gabon","Gambia","Ghana","Guinea","Guinea-Bissau","Kenya","Lesotho","Liberia",
    "Libya","Madagascar","Malawi","Mali","Mauritania","Mauritius","Morocco","Mozambique",
    "Namibia","Niger","Nigeria","Rwanda","Sao Tome and Principe","Senegal","Sierra Leone",
    "Somalia","South Africa","South Sudan","Sudan","Tanzania","Togo","Tunisia","Uganda",
    "Zambia","Zimbabwe"],
  "Asia": ["Afghanistan","Armenia","Azerbaijan","Bahrain","Bangladesh","Bhutan","Brunei",
    "Cambodia","China","Cyprus","Georgia","India","Indonesia","Iran","Iraq","Israel",
    "Japan","Jordan","Kazakhstan","Kuwait","Kyrgyzstan","Laos","Lebanon","Malaysia",
    "Maldives","Mongolia","Myanmar","Nepal","North Korea","Oman","Pakistan","Palestine",
    "Philippines","Qatar","Saudi Arabia","Singapore","South Korea","Sri Lanka","Syria",
    "Taiwan","Tajikistan","Thailand","Timor-Leste","Turkmenistan","United Arab Emirates",
    "Uzbekistan","Vietnam","Yemen"],
  "Europe": ["Albania","Andorra","Austria","Belarus","Belgium","Bosnia and Herzegovina",
    "Bulgaria","Croatia","Czechia","Denmark","Estonia","Finland","France","Germany",
    "Greece","Hungary","Iceland","Ireland","Italy","Kosovo","Latvia","Lithuania",
    "Luxembourg","Malta","Moldova","Monaco","Montenegro","Netherlands","North Macedonia",
    "Norway","Poland","Portugal","Romania","Russia","Serbia","Slovakia","Slovenia",
    "Spain","Sweden","Switzerland","Turkey","Ukraine","United Kingdom"],
  "Americas": ["Antigua and Barbuda","Argentina","Bahamas","Barbados","Belize","Bolivia",
    "Brazil","Canada","Chile","Colombia","Costa Rica","Cuba","Dominican Republic",
    "Ecuador","El Salvador","Grenada","Guatemala","Guyana","Haiti","Honduras","Jamaica",
    "Mexico","Nicaragua","Panama","Paraguay","Peru","Saint Kitts and Nevis",
    "Saint Lucia","Saint Vincent and the Grenadines","Suriname","Trinidad and Tobago",
    "United States","Uruguay","Venezuela"],
  "Oceania": ["Australia","Fiji","Kiribati","Marshall Islands","Micronesia",
    "Nauru","New Zealand","Palau","Papua New Guinea","Samoa","Solomon Islands",
    "Tonga","Tuvalu","Vanuatu"]
};

/* Build reverse lookup: country -> region */
const COUNTRY_REGION = {};
Object.entries(REGION_MAP).forEach(([region, countries]) => {
  countries.forEach(c => { COUNTRY_REGION[c] = region; });
});

/* Region colours */
const REGION_COLOR = {
  "Africa":   "#34d399",
  "Asia":     "#38bdf8",
  "Europe":   "#a78bfa",
  "Americas": "#fbbf24",
  "Oceania":  "#f87171",
  "Other":    "#6b7591"
};

/* CSS variable colours (resolved at runtime) */
const C = {
  sky:     "#38bdf8",
  emerald: "#34d399",
  amber:   "#fbbf24",
  red:     "#f87171",
  violet:  "#a78bfa",
  blue:    "#60a5fa",
  muted:   "#5a6484",
  border:  "#232840",
  surface2:"#121620",
  text:    "#e2e8f4",
  textDim: "#98a4be"
};

/* ─────────────────────────────────────────────────────────────────
   GLOBAL STATE
   ───────────────────────────────────────────────────────────────── */
const state = {
  yearStart:       2000,
  yearEnd:         2020,
  mapMetric:       "Renewable energy share in the total final energy consumption (%)",
  selectedCountry: null,
  areaFocus:       null,
  tableSortCol:    "Entity",
  tableSortAsc:    true,
  countrySearch:   "",
  region: "all"
};

/* ─────────────────────────────────────────────────────────────────
   UTILITY HELPERS
   ───────────────────────────────────────────────────────────────── */

/**
 * Coerce numeric columns. Blank strings and non-numeric values become null.
 * @param {Object[]} rows - Raw d3.csv rows
 * @returns {Object[]} Mutated rows with proper types
 */
function coerce(rows) {
  rows.forEach(r => {
    NUM_COLS.forEach(col => {
      const v = r[col];
      r[col] = (v === "" || v === undefined || v === null) ? null : +v;
    });
  });
  return rows;
}

/**
 * Format a number for display: up to 4 sig-figs with locale commas.
 * @param {number|null} v
 * @param {number} [decimals=1]
 * @param {string} [suffix=""]
 */
function fmt(v, decimals = 1, suffix = "") {
  if (v == null || isNaN(v)) return "N/A";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }) + suffix;
}

/** Mean of array, ignoring nulls */
function mean(arr) {
  const valid = arr.filter(v => v != null && !isNaN(v));
  return valid.length ? d3.mean(valid) : null;
}

/** Get region label for a country name */
function region(name) {
  return COUNTRY_REGION[name] || "Other";
}

/** Return country-level rows filtered by state.yearStart / yearEnd */
function filteredRows(allRows) {

  return allRows.filter(r => {

    const yearMatch =
      r.Year >= state.yearStart &&
      r.Year <= state.yearEnd;

    const regionMatch =
      state.region === "all" ||
      region(r.Entity) === state.region;

    return yearMatch && regionMatch;
  });
}

/**
 * For each country, return the row from the latest year within the filtered set.
 */
function latestPerCountry(rows) {
  const byCountry = d3.group(rows, r => r.Entity);
  return Array.from(byCountry.values()).map(group => {
    return group.reduce((best, r) => (r.Year > best.Year ? r : best));
  });
}

/** Show/position tooltip */
function showTooltip(html, event) {
  const tt = document.getElementById("tooltip");
  tt.innerHTML = html;
  tt.style.display = "block";
  moveTooltip(event);
}

function moveTooltip(event) {
  const tt = document.getElementById("tooltip");
  const x = event.clientX + 14;
  const y = event.clientY - 28;
  const maxX = window.innerWidth  - tt.offsetWidth  - 10;
  const maxY = window.innerHeight - tt.offsetHeight - 10;
  tt.style.left = Math.min(x, maxX) + "px";
  tt.style.top  = Math.max(10, Math.min(y, maxY)) + "px";
}

function hideTooltip() {
  document.getElementById("tooltip").style.display = "none";
}

/** Select country and re-render */
function selectCountry(name) {
  state.selectedCountry = (state.selectedCountry === name) ? null : name;
  render(window.__allRows);
}

/* ─────────────────────────────────────────────────────────────────
   RENDER ORCHESTRATOR
   ───────────────────────────────────────────────────────────────── */
function render(allRows) {
  if (!allRows || !allRows.length) return;
  window.__allRows = allRows;

  const rows = filteredRows(allRows);

  updateKpis(rows);
  updateCountryList(rows);
  updateCountryCard(allRows);
  drawWorldMap(rows);
  drawLineChart(allRows);   // uses full dataset for complete trend line
  drawAreaChart(allRows);   // uses full dataset for complete trend
  drawScatterChart(rows);
  drawBarChart(rows);
  buildTable(rows);
}

/* ─────────────────────────────────────────────────────────────────
   KPI BAR
   ───────────────────────────────────────────────────────────────── */
function updateKpis(rows) {
  const latest = latestPerCountry(rows);

  const nCountries = new Set(rows.map(r => r.Entity)).size;
  const avgAccess  = mean(latest.map(r => r["Access to electricity (% of population)"]));
  const avgRen     = mean(latest.map(r => r["Renewable energy share in the total final energy consumption (%)"]));
  const avgCo2     = mean(latest.map(r => r["Value_co2_emissions_kt_by_country"]));
  const avgGdp     = mean(latest.map(r => r["gdp_per_capita"]));

  setText("kpiCountries", nCountries);
  setText("kpiAccess",    fmt(avgAccess, 1, "%"));
  setText("kpiRenewable", fmt(avgRen,    1, "%"));
  setText("kpiCo2",       avgCo2 != null ? fmt(avgCo2 / 1000, 0, "k kt") : "N/A");
  setText("kpiGdp",       avgGdp  != null ? "$" + fmt(avgGdp, 0) : "N/A");
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ─────────────────────────────────────────────────────────────────
   SIDEBAR: COUNTRY LIST
   ───────────────────────────────────────────────────────────────── */
function updateCountryList(rows) {
  const names = Array.from(new Set(rows.map(r => r.Entity))).sort();
  const q = state.countrySearch.toLowerCase();
  const filtered = q ? names.filter(n => n.toLowerCase().includes(q)) : names;

  const ul = document.getElementById("countryList");
  ul.innerHTML = "";
  // filtered.slice(0, 80).forEach(name => {
  filtered.forEach(name => {
    const li = document.createElement("li");
    li.className = "country-item" + (name === state.selectedCountry ? " active" : "");
    li.textContent = name;
    li.addEventListener("click", () => selectCountry(name));
    ul.appendChild(li);
  });
}

/* ─────────────────────────────────────────────────────────────────
   SIDEBAR: COUNTRY CARD (drill-down)
   ───────────────────────────────────────────────────────────────── */
function updateCountryCard(allRows) {
  const el = document.getElementById("countryCard");
  if (!state.selectedCountry) {
    el.innerHTML = '<p class="no-selection">Click a country on the map or in the list above to see its latest statistics.</p>';
    return;
  }

  const countryRows = allRows.filter(r => r.Entity === state.selectedCountry);
  if (!countryRows.length) {
    el.innerHTML = '<p class="no-selection">No data for selected country.</p>';
    return;
  }

  const latest = countryRows.reduce((b, r) => (r.Year > b.Year ? r : b));

  const stats = [
    { label: "Year (latest)",        val: latest.Year != null ? String(Math.round(latest.Year)) : null, col: "", suf: "", pre: true },
    { label: "Electricity access",   val: latest["Access to electricity (% of population)"],    col: "emerald", suf: "%" },
    { label: "Renewable share",      val: latest["Renewable energy share in the total final energy consumption (%)"], col: "sky", suf: "%" },
    { label: "Low-carbon elec.",     val: latest["Low-carbon electricity (% electricity)"],     col: "sky",     suf: "%" },
    { label: "Fossil fuels (TWh)",   val: latest["Electricity from fossil fuels (TWh)"],        col: "amber",   suf: " TWh" },
    { label: "Renewables (TWh)",     val: latest["Electricity from renewables (TWh)"],          col: "emerald", suf: " TWh" },
    { label: "Nuclear (TWh)",        val: latest["Electricity from nuclear (TWh)"],             col: "",        suf: " TWh" },
    { label: "CO2 emissions",        val: latest["Value_co2_emissions_kt_by_country"],          col: "red",     suf: " kt" },
    { label: "GDP per capita",       val: latest["gdp_per_capita"] != null ? "$" + fmt(latest["gdp_per_capita"], 0) : null, col: "violet", suf: "", pre: true },
    { label: "Energy/capita",        val: latest["Primary energy consumption per capita (kWh/person)"], col: "", suf: " kWh/p" }
  ];

  el.innerHTML = `
    <div class="country-card">
      <div>
        <div class="country-name">${state.selectedCountry}</div>
        <div class="country-year-note">Region: ${region(state.selectedCountry)}</div>
      </div>
      ${stats.map(s => {
        let display;
        if (s.pre) {
          display = s.val != null ? s.val : "N/A";
        } else {
          display = s.val != null ? fmt(+s.val, s.suf.includes("%") ? 1 : 1) + s.suf : "N/A";
        }
        return `<div class="stat-row">
          <span class="stat-label">${s.label}</span>
          <span class="stat-val ${s.col}">${display}</span>
        </div>`;
      }).join("")}
    </div>`;
}

/* ─────────────────────────────────────────────────────────────────
   CHART 1: WORLD MAP (Choropleth)
   ───────────────────────────────────────────────────────────────── */
function drawWorldMap(rows) {
  const container = document.getElementById("worldMap");
  const W = container.clientWidth || 900;
  const H = container.clientHeight || Math.max(400, W * 0.42);
  if (!worldData) return;

  /* Aggregate metric per country (average over year range) */
  const byCountry = d3.rollup(
    rows.filter(r => r[state.mapMetric] != null),
    v => d3.mean(v, r => r[state.mapMetric]),
    r => r.Entity
  );

  d3.select(container).select("svg").remove();

  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  // const projection = d3.geoNaturalEarth1()
  //   .scale(W / 6.2)
  //   .translate([W / 2, H / 2]);

  // const path = d3.geoPath().projection(projection);
  const projection = d3.geoNaturalEarth1();

  const countries = topojson.feature(
      worldData,
      worldData.objects.countries
  );

  projection.fitSize(
      [W - 20, H - 20],
      countries
  );

  const path = d3.geoPath().projection(projection);

  const vals = Array.from(byCountry.values());
  if (!vals.length) return;

  const colorScale = d3.scaleSequential()
    .domain([d3.quantile(vals.sort(d3.ascending), 0.05),
             d3.quantile(vals, 0.95)])
    .interpolator(d3.interpolateBlues)
    .clamp(true);

  const NAME_TO_ID = getNameToId();

  /* Zoomable layer — legend stays fixed on svg */
  const mapG = svg.append("g");

  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0, 0], [W, H]])
    .on("zoom", (event) => { mapG.attr("transform", event.transform); });

  svg.call(zoom).on("dblclick.zoom", null); // disable dblclick zoom-in (conflicts with country select)

  /* Reset zoom button */
  const resetG = svg.append("g")
    .attr("transform", `translate(10, 10)`)
    .style("cursor", "pointer")
    .on("click", () => svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity));
  resetG.append("rect")
    .attr("width", 66).attr("height", 20).attr("rx", 3)
    .attr("fill", C.surface2).attr("stroke", C.border).attr("stroke-width", 1);
  resetG.append("text")
    .attr("x", 33).attr("y", 14).attr("text-anchor", "middle")
    .attr("fill", C.textDim).attr("font-size", 10)
    .text("⟳ Reset zoom");

  /* Draw graticule */
  const graticule = d3.geoGraticule()();
  mapG.append("path").datum(graticule)
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", C.border)
    .attr("stroke-width", 0.3);

  /* Draw countries */
  mapG.selectAll(".country")
    .data(countries.features)
    .join("path")
    .attr("class", "country")
    .attr("d", path)
    .attr("fill", d => {
      const name = NAME_TO_ID[+d.id];
      const val  = name ? byCountry.get(name) : undefined;
      return val != null ? colorScale(val) : "#1a1f30";
    })
    .attr("stroke", C.border)
    .attr("stroke-width", 0.35)
    .style("cursor", "pointer")
    .on("mouseover", (event, d) => {
      const name = NAME_TO_ID[+d.id];
      const val  = name ? byCountry.get(name) : null;
      if (name) {
        showTooltip(`<strong>${name}</strong>${val != null
          ? "<br>" + metricLabel(state.mapMetric) + ": " + fmt(val, 2)
          : "<br>No data"}`, event);
      }
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => {
      const name = NAME_TO_ID[+d.id];
      if (name) selectCountry(name);
    })
    .attr("opacity", d => {
      const name = NAME_TO_ID[+d.id];
      if (!state.selectedCountry) return 1;
      return (name === state.selectedCountry) ? 1 : 0.65;
    });

  /* Colour legend */
  drawMapLegend(svg, colorScale, W, H);

  /* Update annotation */
  setText("mapAnnotation",
    `Metric: ${metricLabel(state.mapMetric)} · averaged ${state.yearStart}–${state.yearEnd} · ` +
    `${byCountry.size} countries with data · Grey = no data`);
  setText("mapBadge", `Avg ${state.yearStart}–${state.yearEnd}`);

  /* Zoom to selected country */
  if (state.selectedCountry) {
    const selectedNode = mapG.selectAll(".country")
      .filter(d => NAME_TO_ID[+d.id] === state.selectedCountry)
      .node();

    if (selectedNode) {
      const bbox = selectedNode.getBBox();
      const padding = 80;
      const scale = Math.min(
        (W - padding * 2) / Math.max(bbox.width, 1),
        (H - padding * 2) / Math.max(bbox.height, 1),
        8
      );
      const tx = W / 2 - scale * (bbox.x + bbox.width / 2);
      const ty = H / 2 - scale * (bbox.y + bbox.height / 2);
      svg.transition().duration(750)
        .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }
  }
}

function metricLabel(col) {
  const labels = {
    "Renewable energy share in the total final energy consumption (%)": "Renewable Share %",
    "Access to electricity (% of population)": "Electricity Access %",
    "Low-carbon electricity (% electricity)": "Low-carbon Elec. %",
    "Value_co2_emissions_kt_by_country": "CO2 Emissions (kt)",
    "gdp_per_capita": "GDP per Capita (USD)"
  };
  return labels[col] || col;
}

function drawMapLegend(svg, scale, W, H) {
  const lW = 140, lH = 10, lX = W - lW - 20, lY = H - 34;
  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "mapGrad");
  [0, 0.25, 0.5, 0.75, 1].forEach(t => {
    grad.append("stop").attr("offset", t).attr("stop-color", scale(
      scale.domain()[0] + t * (scale.domain()[1] - scale.domain()[0])
    ));
  });

  const lg = svg.append("g");
  lg.append("rect")
    .attr("x", lX).attr("y", lY)
    .attr("width", lW).attr("height", lH)
    .attr("rx", 2).attr("fill", "url(#mapGrad)");
  lg.append("text")
    .attr("x", lX).attr("y", lY - 4)
    .attr("fill", C.muted).attr("font-size", 9)
    .text(fmt(scale.domain()[0], 0));
  lg.append("text")
    .attr("x", lX + lW).attr("y", lY - 4)
    .attr("fill", C.muted).attr("font-size", 9)
    .attr("text-anchor", "end")
    .text(fmt(scale.domain()[1], 0));
}

/**
 * ISO 3166-1 numeric -> country name lookup for world-atlas 110m.
 * Only the most common entries are listed; unknown IDs map to undefined.
 */
function getNameToId() {
  return {
    4:"Afghanistan",8:"Albania",12:"Algeria",24:"Angola",32:"Argentina",
    36:"Australia",40:"Austria",50:"Bangladesh",56:"Belgium",64:"Bhutan",
    68:"Bolivia",76:"Brazil",100:"Bulgaria",116:"Cambodia",120:"Cameroon",
    124:"Canada",144:"Sri Lanka",152:"Chile",156:"China",170:"Colombia",
    180:"DR Congo",188:"Costa Rica",191:"Croatia",192:"Cuba",196:"Cyprus",
    203:"Czechia",208:"Denmark",214:"Dominican Republic",218:"Ecuador",
    818:"Egypt",222:"El Salvador",231:"Ethiopia",246:"Finland",250:"France",
    266:"Gabon",276:"Germany",288:"Ghana",300:"Greece",320:"Guatemala",
    332:"Haiti",340:"Honduras",348:"Hungary",356:"India",360:"Indonesia",
    364:"Iran",368:"Iraq",372:"Ireland",376:"Israel",380:"Italy",388:"Jamaica",
    392:"Japan",400:"Jordan",398:"Kazakhstan",404:"Kenya",408:"North Korea",
    410:"South Korea",414:"Kuwait",418:"Laos",422:"Lebanon",430:"Liberia",
    434:"Libya",442:"Luxembourg",450:"Madagascar",454:"Malawi",458:"Malaysia",
    466:"Mali",484:"Mexico",496:"Mongolia",504:"Morocco",508:"Mozambique",
    516:"Namibia",524:"Nepal",528:"Netherlands",554:"New Zealand",558:"Nicaragua",
    566:"Nigeria",578:"Norway",586:"Pakistan",591:"Panama",604:"Peru",
    608:"Philippines",616:"Poland",620:"Portugal",630:"Puerto Rico",
    634:"Qatar",642:"Romania",643:"Russia",682:"Saudi Arabia",686:"Senegal",
    694:"Sierra Leone",706:"Somalia",710:"South Africa",724:"Spain",
    729:"Sudan",752:"Sweden",756:"Switzerland",760:"Syria",764:"Thailand",
    788:"Tunisia",792:"Turkey",800:"Uganda",804:"Ukraine",784:"United Arab Emirates",
    826:"United Kingdom",840:"United States",858:"Uruguay",862:"Venezuela",
    704:"Vietnam",887:"Yemen",894:"Zambia",716:"Zimbabwe"
  };
}

/* ─────────────────────────────────────────────────────────────────
   CHART 2: LINE CHART — Global renewable share trend
   ───────────────────────────────────────────────────────────────── */
function drawLineChart(allRows) {
  const container = document.getElementById("lineChart");
  const W = container.clientWidth  || 440;
  const H = container.clientHeight || 460;
  const m = { top: 24, right: 110, bottom: 36, left: 50 };
  const iW = W - m.left - m.right;
  const iH = H - m.top  - m.bottom;

  /* Year-level average renewable share across all countries */
  const byYear = Array.from(
    d3.rollup(
      allRows.filter(r =>
        r["Renewable energy share in the total final energy consumption (%)"] != null &&
        r.Year >= state.yearStart && r.Year <= state.yearEnd
      ),
      v => d3.mean(v, r => r["Renewable energy share in the total final energy consumption (%)"]),
      r => r.Year
    ),
    ([year, val]) => ({ year, val })
  ).sort((a, b) => a.year - b.year);

  const renCol = "Renewable energy share in the total final energy consumption (%)";
  const countryByYear = state.selectedCountry
    ? allRows
        .filter(r => r.Entity === state.selectedCountry && r[renCol] != null &&
                     r.Year >= state.yearStart && r.Year <= state.yearEnd)
        .map(r => ({ year: r.Year, val: r[renCol] }))
        .sort((a, b) => a.year - b.year)
    : [];

  d3.select(container).select("svg").remove();
  if (!byYear.length) return;

  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const xScale = d3.scaleLinear().domain(d3.extent(byYear, d => d.year)).range([0, iW]);
  const allRenVals = [...byYear.map(d => d.val), ...countryByYear.map(d => d.val)];
  const yScale = d3.scaleLinear()
    .domain([d3.min(allRenVals) * 0.95, Math.min(100, d3.max(allRenVals) * 1.05)])
    .range([iH, 0]);

  /* Gridlines */
  g.append("g").attr("class", "grid")
    .call(d3.axisLeft(yScale).tickSize(-iW).tickFormat(""))
    .selectAll("line").attr("stroke", C.border).attr("stroke-dasharray", "3,3");
  g.select(".grid .domain").remove();

  /* Axes */
  g.append("g").attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format("d")).ticks(6))
    .selectAll("text").attr("fill", C.textDim).attr("font-size", 10);
  g.select(".domain").attr("stroke", C.border);

  g.append("g").call(d3.axisLeft(yScale).ticks(5).tickFormat(d => d + "%"))
    .selectAll("text").attr("fill", C.textDim).attr("font-size", 10);
  g.selectAll(".domain").attr("stroke", C.border);
  g.selectAll(".tick line").attr("stroke", C.border);

  /* Area fill */
  const area = d3.area()
    .x(d => xScale(d.year))
    .y0(iH)
    .y1(d => yScale(d.val))
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(byYear)
    .attr("d", area)
    .attr("fill", C.emerald)
    .attr("opacity", 0.12);

  /* Line */
  const line = d3.line()
    .x(d => xScale(d.year))
    .y(d => yScale(d.val))
    .curve(d3.curveMonotoneX);

  g.append("path")
    .datum(byYear)
    .attr("d", line)
    .attr("fill", "none")
    .attr("stroke", C.emerald)
    .attr("stroke-width", 2.2);

  /* Peak annotation — only when no country is selected (amber used for country line instead) */
  if (!state.selectedCountry) {
    let maxDelta = -Infinity, peakIdx = 1;
    for (let i = 1; i < byYear.length; i++) {
      const delta = byYear[i].val - byYear[i-1].val;
      if (delta > maxDelta) { maxDelta = delta; peakIdx = i; }
    }
    const peakPoint = byYear[peakIdx];
    if (peakPoint) {
      const px = xScale(peakPoint.year);
      const py = yScale(peakPoint.val);
      g.append("line")
        .attr("x1", px).attr("y1", py + 4)
        .attr("x2", px).attr("y2", py + 22)
        .attr("stroke", C.amber).attr("stroke-width", 1.2).attr("stroke-dasharray","3,2");
      g.append("text")
        .attr("x", px).attr("y", py + 32)
        .attr("text-anchor", "middle")
        .attr("fill", C.amber).attr("font-size", 9)
        .text(`${peakPoint.year}: biggest rise`);
    }
  }

  /* Country overlay line */
  if (countryByYear.length) {
    const countryLine = d3.line()
      .x(d => xScale(d.year))
      .y(d => yScale(d.val))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(countryByYear)
      .attr("d", countryLine)
      .attr("fill", "none")
      .attr("stroke", C.amber)
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "6,3");
  }

  /* Legend — always shown outside the plot to the right */
  const legG = g.append("g").attr("transform", `translate(${iW + 14}, 0)`);
  legG.append("line").attr("x1", 0).attr("y1", 9).attr("x2", 16).attr("y2", 9)
    .attr("stroke", C.emerald).attr("stroke-width", 2);
  legG.append("text").attr("x", 20).attr("y", 13)
    .attr("fill", C.textDim).attr("font-size", 9).text("Global avg");
  if (countryByYear.length) {
    legG.append("line").attr("x1", 0).attr("y1", 27).attr("x2", 16).attr("y2", 27)
      .attr("stroke", C.amber).attr("stroke-width", 2).attr("stroke-dasharray", "6,3");
    const shortName = state.selectedCountry.length > 13
      ? state.selectedCountry.slice(0, 13) + "…"
      : state.selectedCountry;
    legG.append("text").attr("x", 20).attr("y", 31)
      .attr("fill", C.amber).attr("font-size", 9).text(shortName);
  }

  /* Axis labels */
  g.append("text").attr("x", iW / 2).attr("y", iH + 32)
    .attr("text-anchor", "middle").attr("fill", C.muted).attr("font-size", 10)
    .text("Year");
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -iH / 2).attr("y", -40)
    .attr("text-anchor", "middle").attr("fill", C.muted).attr("font-size", 10)
    .text("Renewable Share (%)");

  /* Interactive hover line */
  const hoverLine = g.append("line")
    .attr("stroke", C.amber).attr("stroke-width", 1)
    .attr("stroke-dasharray", "4,3").attr("y1", 0).attr("y2", iH)
    .style("display", "none");

  g.append("rect")
    .attr("width", iW).attr("height", iH)
    .attr("fill", "transparent")
    .on("mousemove", function(event) {
      const [mx] = d3.pointer(event);
      const yr = Math.round(xScale.invert(mx));
      const d  = byYear.find(d => d.year === yr);
      if (d) {
        hoverLine.attr("x1", xScale(yr)).attr("x2", xScale(yr)).style("display", null);
        showTooltip(`<strong>${yr}</strong><br>Avg renewable share: ${fmt(d.val, 2)}%`, event);
      }
    })
    .on("mouseout", () => { hoverLine.style("display", "none"); hideTooltip(); });

  /* Update annotation */
  const start = byYear[0], end = byYear[byYear.length - 1];
  const change = end && start ? (end.val - start.val).toFixed(1) : "–";
  let lineAnnot = `Global avg: ${fmt(start?.val, 1)}% (${start?.year}) → ${fmt(end?.val, 1)}% (${end?.year}) · Change: ${+change >= 0 ? "+" : ""}${change} pp`;
  if (countryByYear.length) {
    const cs = countryByYear[0], ce = countryByYear[countryByYear.length - 1];
    const cc = (ce.val - cs.val).toFixed(1);
    lineAnnot += ` · ${state.selectedCountry}: ${fmt(cs.val, 1)}% → ${fmt(ce.val, 1)}% (${+cc >= 0 ? "+" : ""}${cc} pp)`;
  }
  setText("lineAnnotation", lineAnnot);
}

/* ─────────────────────────────────────────────────────────────────
   CHART 3: STACKED AREA — Electricity generation mix
   ───────────────────────────────────────────────────────────────── */
function drawAreaChart(allRows) {
  const container = document.getElementById("areaChart");
  const W = container.clientWidth  || 440;
  const H = container.clientHeight || 460;
  const m = { top: 24, right: 110, bottom: 36, left: 58 };
  const iW = W - m.left - m.right;
  const iH = H - m.top  - m.bottom;

  const keys   = ["Electricity from fossil fuels (TWh)", "Electricity from nuclear (TWh)", "Electricity from renewables (TWh)"];
  const labels  = ["Fossil Fuels", "Nuclear", "Renewables"];
  const colours = [C.amber, C.blue, C.emerald];

  const areaSource = (state.selectedCountry
    ? allRows.filter(r => r.Entity === state.selectedCountry)
    : allRows
  ).filter(r => r.Year >= state.yearStart && r.Year <= state.yearEnd);

  const byYear = Array.from(
    d3.rollup(
      areaSource,
      v => Object.fromEntries(keys.map(k => [k, d3.sum(v, r => r[k] ?? 0)])),
      r => r.Year
    ),
    ([year, sums]) => ({ year, ...sums })
  ).sort((a, b) => a.year - b.year);

  d3.select(container).select("svg").remove();
  if (!byYear.length) return;

  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const stack = d3.stack().keys(keys)(byYear);
  const xScale = d3.scaleLinear().domain(d3.extent(byYear, d => d.year)).range([0, iW]);
  const yScale = d3.scaleLinear()
    .domain([0, d3.max(stack, s => d3.max(s, d => d[1])) * 1.05])
    .range([iH, 0]);

  /* Gridlines */
  g.append("g").call(d3.axisLeft(yScale).tickSize(-iW).tickFormat(""))
    .selectAll("line").attr("stroke", C.border).attr("stroke-dasharray", "3,3");
  g.select(".domain").remove();

  /* Areas */
  const area = d3.area()
    .x(d => xScale(d.data.year))
    .y0(d => yScale(d[0]))
    .y1(d => yScale(d[1]))
    .curve(d3.curveMonotoneX);

  g.selectAll(".area-path")
    .data(stack)
    .join("path")
    .attr("class", "area-path")
    .attr("d", area)
    .attr("fill", (d, i) => colours[i])
    .attr("opacity", (d, i) => {
      if (!state.areaFocus) return 0.72;
      return keys[i] === state.areaFocus ? 0.9 : 0.15;
    });

  /* Axes */
  g.append("g").attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format("d")).ticks(6))
    .selectAll("text").attr("fill", C.textDim).attr("font-size", 10);
  g.append("g").call(d3.axisLeft(yScale).ticks(5).tickFormat(d => (d / 1000).toFixed(0) + "k"))
    .selectAll("text").attr("fill", C.textDim).attr("font-size", 10);
  g.selectAll(".domain").attr("stroke", C.border);
  g.selectAll(".tick line").attr("stroke", C.border);

  /* Legend (interactive) */
  labels.forEach((label, i) => {
    const isActive = state.areaFocus === keys[i];
    const ly = i * 20;
    const lg = g.append("g")
      .attr("transform", `translate(${iW + 12},${ly})`)
      .attr("cursor", "pointer")
      .on("click", () => {
        state.areaFocus = (state.areaFocus === keys[i]) ? null : keys[i];
        drawAreaChart(allRows);
      });
    lg.append("rect").attr("width", 90).attr("height", 16).attr("rx", 3)
      .attr("fill", isActive ? colours[i] : "transparent")
      .attr("opacity", isActive ? 0.18 : 0);
    lg.append("rect").attr("width", 10).attr("height", 10).attr("y", 3)
      .attr("rx", 2)
      .attr("fill", colours[i])
      .attr("opacity", (!state.areaFocus || isActive) ? 0.85 : 0.3);
    lg.append("text").attr("x", 14).attr("y", 11)
      .attr("fill", isActive ? colours[i] : (!state.areaFocus ? C.textDim : C.muted))
      .attr("font-size", 9)
      .attr("font-weight", isActive ? 600 : 400)
      .text(label);
    if (isActive) {
      lg.append("text").attr("x", 80).attr("y", 11)
        .attr("fill", colours[i]).attr("font-size", 8).attr("text-anchor", "end")
        .text("✕");
    }
  });

  /* Show all button — only when a layer is focused */
  if (state.areaFocus) {
    const showAllG = g.append("g")
      .attr("transform", `translate(${iW + 12},${labels.length * 20 + 6})`)
      .attr("cursor", "pointer")
      .on("click", () => { state.areaFocus = null; drawAreaChart(allRows); });
    showAllG.append("rect").attr("width", 90).attr("height", 14).attr("rx", 3)
      .attr("fill", C.surface2).attr("opacity", 0.9);
    showAllG.append("text").attr("x", 45).attr("y", 10)
      .attr("text-anchor", "middle").attr("fill", C.muted)
      .attr("font-size", 8).attr("font-weight", 600)
      .text("Show all");
  }

  /* Y label */
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -iH / 2).attr("y", -50)
    .attr("text-anchor", "middle").attr("fill", C.muted).attr("font-size", 10)
    .text("TWh");

  /* Hover overlay */
  g.append("rect").attr("width", iW).attr("height", iH).attr("fill", "transparent")
    .on("mousemove", function(event) {
      const [mx] = d3.pointer(event);
      const yr = Math.round(xScale.invert(mx));
      const row = byYear.find(d => d.year === yr);
      if (row) {
        showTooltip(
          `<strong>${yr}</strong>` +
          keys.map((k, i) => `<br>${labels[i]}: ${fmt(row[k] / 1000, 1)}k TWh`).join(""),
          event
        );
      }
    })
    .on("mouseout", hideTooltip);

  /* Annotation */
  const lastRow = byYear[byYear.length - 1];
  const firstRow = byYear[0];
  const renGrowth = lastRow && firstRow
    ? ((lastRow[keys[2]] - firstRow[keys[2]]) / firstRow[keys[2]] * 100).toFixed(0)
    : "–";
  const areaLabel = state.selectedCountry || "all reporting countries";
  setText("areaChartTitle", state.selectedCountry
    ? `Electricity Generation Mix — ${state.selectedCountry}`
    : "Global Electricity Generation Mix");
  setText("areaAnnotation",
    `Renewable TWh grew ~${renGrowth}% over the period · ` +
    `Fossil fuels remain the dominant source · TWh for ${areaLabel}`);
}

/* ─────────────────────────────────────────────────────────────────
   CHART 4: SCATTER — GDP per capita vs Renewable Share
   ───────────────────────────────────────────────────────────────── */
function drawScatterChart(rows) {
  const container = document.getElementById("scatterChart");
  const W = container.clientWidth  || 440;
  const H = container.clientHeight || 480;
  const m = { top: 24, right: 100, bottom: 44, left: 60 };
  const iW = W - m.left - m.right;
  const iH = H - m.top  - m.bottom;

  /* Use latest per country */
  const points = latestPerCountry(rows).filter(r =>
    r["gdp_per_capita"] != null &&
    r["Renewable energy share in the total final energy consumption (%)"] != null
  );

  d3.select(container).select("svg").remove();
  if (!points.length) return;

  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const xScale = d3.scaleLog()
    .domain(d3.extent(points, d => d["gdp_per_capita"]))
    .range([0, iW]).nice();
  const yScale = d3.scaleLinear()
    .domain([0, 100]).range([iH, 0]);

  /* Gridlines */
  g.append("g").call(d3.axisLeft(yScale).tickSize(-iW).tickFormat(""))
    .selectAll("line").attr("stroke", C.border).attr("stroke-dasharray", "3,3");
  g.select(".domain").remove();

  /* Axes */
  g.append("g").attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(xScale)
      .tickValues([500, 1000, 5000, 10000, 50000])
      .tickFormat(d => "$" + d3.format(".0s")(d)))
    .selectAll("text").attr("fill", C.textDim).attr("font-size", 10);
  g.append("g").call(d3.axisLeft(yScale).ticks(5).tickFormat(d => d + "%"))
    .selectAll("text").attr("fill", C.textDim).attr("font-size", 10);
  g.selectAll(".domain").attr("stroke", C.border);
  g.selectAll(".tick line").attr("stroke", C.border);

  /* Dots */
  g.selectAll(".dot")
    .data(points)
    .join("circle")
    .attr("class", "dot")
    .attr("cx", d => xScale(d["gdp_per_capita"]))
    .attr("cy", d => yScale(d["Renewable energy share in the total final energy consumption (%)"]))
    .attr("r", d => d.Entity === state.selectedCountry ? 6 : 4)
    .attr("fill", d => d.Entity === state.selectedCountry ? C.amber : REGION_COLOR[region(d.Entity)])
    .attr("opacity", d => d.Entity === state.selectedCountry ? 1 : 0.65)
    .attr("stroke", d => d.Entity === state.selectedCountry ? C.amber : "transparent")
    .attr("stroke-width", 1.5)
    .style("cursor", "pointer")
    .on("mouseover", (event, d) => {
      showTooltip(
        `<strong>${d.Entity}</strong><br>` +
        `GDP/capita: $${fmt(d["gdp_per_capita"], 0)}<br>` +
        `Renewable: ${fmt(d["Renewable energy share in the total final energy consumption (%)"], 1)}%<br>` +
        `Region: ${region(d.Entity)}`,
        event
      );
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => selectCountry(d.Entity));

  /* Axis labels */
  g.append("text").attr("x", iW / 2).attr("y", iH + 36)
    .attr("text-anchor", "middle").attr("fill", C.muted).attr("font-size", 10)
    .text("GDP per Capita (USD, log scale)");
  g.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -iH / 2).attr("y", -50)
    .attr("text-anchor", "middle").attr("fill", C.muted).attr("font-size", 10)
    .text("Renewable Share (%)");

  /* Selected country label */
  if (state.selectedCountry) {
    const sel = points.find(d => d.Entity === state.selectedCountry);
    if (sel) {
      const sx = xScale(sel["gdp_per_capita"]);
      const sy = yScale(sel["Renewable energy share in the total final energy consumption (%)"]);
      g.append("text")
        .attr("x", sx + 8).attr("y", sy - 6)
        .attr("fill", C.amber).attr("font-size", 9).attr("font-weight", 600)
        .text(state.selectedCountry);
    }
  }

  /* Region legend */
  const regions = Object.keys(REGION_COLOR);
  const legG = g.append("g").attr("transform", `translate(${iW + 12},0)`);
  regions.forEach((r, i) => {
    legG.append("circle").attr("cx", 5).attr("cy", i * 14 + 5).attr("r", 4)
      .attr("fill", REGION_COLOR[r]).attr("opacity", 0.85);
    legG.append("text").attr("x", 13).attr("y", i * 14 + 9)
      .attr("fill", C.textDim).attr("font-size", 8).text(r);
  });

  setText("scatterBadge", `${points.length} countries, latest year`);
  setText("scatterAnnotation",
    `Log x-axis reveals spread across low-to-high income · ` +
    `Many low-income nations show high renewable share (hydro-dominated) · ` +
    `Selected country highlighted in amber`);
}

/* ─────────────────────────────────────────────────────────────────
   CHART 5: BAR CHART — Top 10 CO2-emitting countries
   ───────────────────────────────────────────────────────────────── */
function drawBarChart(rows) {
  const container = document.getElementById("barChart");
  const W = container.clientWidth  || 440;
  const H = container.clientHeight || 540;
  const m = { top: 16, right: 30, bottom: 40, left: 130 };
  const iW = W - m.left - m.right;
  const iH = H - m.top  - m.bottom;

  /* Average CO2 per country over year range */
  const co2Ranked = Array.from(
    d3.rollup(
      rows.filter(r => r["Value_co2_emissions_kt_by_country"] != null),
      v => d3.mean(v, r => r["Value_co2_emissions_kt_by_country"]),
      r => r.Entity
    ),
    ([name, val]) => ({ name, val })
  ).sort((a, b) => b.val - a.val);

  const top10 = co2Ranked.slice(0, 10);
  const selInTop = state.selectedCountry && top10.some(d => d.name === state.selectedCountry);
  const selExtra = (!state.selectedCountry || selInTop)
    ? null
    : co2Ranked.find(d => d.name === state.selectedCountry) || null;
  const avgCo2 = selExtra ? [...top10, { ...selExtra, extra: true }] : top10;

  d3.select(container).select("svg").remove();
  if (!avgCo2.length) return;

  const svg = d3.select(container).append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("preserveAspectRatio", "xMidYMid meet");
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  const xScale = d3.scaleLinear().domain([0, avgCo2[0].val * 1.05]).range([0, iW]);
  const yScale = d3.scaleBand().domain(avgCo2.map(d => d.name)).range([0, iH]).padding(0.22);

  /* Gridlines */
  g.append("g").call(d3.axisTop(xScale).tickSize(iH).tickFormat(""))
    .selectAll("line").attr("stroke", C.border).attr("stroke-dasharray", "3,3")
    .attr("transform", `translate(0,${iH})`);

  /* Bars */
  g.selectAll(".bar")
    .data(avgCo2)
    .join("rect")
    .attr("class", "bar")
    .attr("x", 0)
    .attr("y", d => yScale(d.name))
    .attr("width", d => xScale(d.val))
    .attr("height", yScale.bandwidth())
    .attr("rx", 2)
    .attr("fill", d => d.name === state.selectedCountry ? C.amber : C.red)
    .attr("opacity", d => d.name === state.selectedCountry ? 1 : 0.75)
    .style("cursor", "pointer")
    .on("mouseover", (event, d) => {
      showTooltip(
        `<strong>${d.name}</strong><br>Avg CO2: ${fmt(d.val / 1000, 0)}k kt`,
        event
      );
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => selectCountry(d.name));

  /* Separator between top 10 and appended selected country */
  if (selExtra) {
    const sepY = yScale(selExtra.name) - 5;
    g.append("line")
      .attr("x1", 0).attr("x2", iW)
      .attr("y1", sepY).attr("y2", sepY)
      .attr("stroke", C.border2).attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,3");
    g.append("text")
      .attr("x", iW).attr("y", sepY - 2)
      .attr("text-anchor", "end")
      .attr("fill", C.muted).attr("font-size", 8)
      .text("▼ selected");
  }

  /* Value labels */
  g.selectAll(".bar-label")
    .data(avgCo2)
    .join("text")
    .attr("class", "bar-label")
    .attr("x", d => xScale(d.val) + 5)
    .attr("y", d => yScale(d.name) + yScale.bandwidth() / 2 + 4)
    .attr("fill", C.textDim).attr("font-size", 11).attr("font-family", "var(--font-mono)")
    .text(d => fmt(d.val / 1000, 0) + "k");

  /* Y axis (country names) */
  g.append("g").call(d3.axisLeft(yScale).tickSize(0))
    .selectAll("text")
    .attr("fill", d => d === state.selectedCountry ? C.amber : C.text)
    .attr("font-size", 12)
    .attr("font-weight", d => d === state.selectedCountry ? 700 : 400);
  g.select(".domain").attr("stroke", C.border);

  /* X axis */
  g.append("g").attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(xScale).ticks(4).tickFormat(d => (d / 1000000).toFixed(1) + "M"))
    .selectAll("text").attr("fill", C.textDim).attr("font-size", 11);

  g.append("text").attr("x", iW / 2).attr("y", iH + 34)
    .attr("text-anchor", "middle").attr("fill", C.muted).attr("font-size", 11)
    .text("CO2 Emissions (kt)");

  setText("barBadge", `Avg ${state.yearStart}–${state.yearEnd}`);
  const top1 = co2Ranked[0];
  const selRank = state.selectedCountry
    ? co2Ranked.findIndex(d => d.name === state.selectedCountry) + 1
    : 0;
  const rankNote = (selExtra && selRank > 0)
    ? ` · ${state.selectedCountry} ranked #${selRank} overall`
    : "";
  setText("barAnnotation",
    `${top1?.name} leads with ~${fmt(top1?.val / 1000, 0)}k kt on average · ` +
    `Selected country highlighted in amber · kt = kilotonnes${rankNote}`);
}

/* ─────────────────────────────────────────────────────────────────
   CHART 6: DATA TABLE
   ───────────────────────────────────────────────────────────────── */
const TABLE_COLS = [
  { key: "Entity",                                                 label: "Country",       num: false },
  { key: "Year",                                                   label: "Year",          num: true  },
  { key: "Access to electricity (% of population)",               label: "Elec. Access %",num: true  },
  { key: "Renewable energy share in the total final energy consumption (%)", label: "Renew. Share %", num: true },
  { key: "Low-carbon electricity (% electricity)",                 label: "Low-C Elec. %", num: true  },
  { key: "Value_co2_emissions_kt_by_country",                      label: "CO2 (kt)",      num: true  },
  { key: "gdp_per_capita",                                         label: "GDP/capita",    num: true  },
  { key: "Electricity from renewables (TWh)",                      label: "Renew. TWh",    num: true  }
];

function buildTable(rows) {
  const latest = latestPerCountry(rows);
  setText("tableCount", `${latest.length} countries`);

  /* Sort */
  const col = TABLE_COLS.find(c => c.key === state.tableSortCol) || TABLE_COLS[0];
  latest.sort((a, b) => {
    const av = a[col.key], bv = b[col.key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (col.num ? (av - bv) : String(av).localeCompare(String(bv))) * (state.tableSortAsc ? 1 : -1);
  });

  const wrap = document.getElementById("dataTable");
  wrap.innerHTML = "";

  const tbl = document.createElement("table");

  /* Header */
  const thead = tbl.createTHead();
  const hrow  = thead.insertRow();
  TABLE_COLS.forEach(c => {
    const th = document.createElement("th");
    th.textContent = c.label + (c.key === state.tableSortCol ? (state.tableSortAsc ? " ▲" : " ▼") : "");
    if (c.key === state.tableSortCol) th.classList.add("sorted");
    th.addEventListener("click", () => {
      if (state.tableSortCol === c.key) state.tableSortAsc = !state.tableSortAsc;
      else { state.tableSortCol = c.key; state.tableSortAsc = false; }
      buildTable(rows);
    });
    hrow.appendChild(th);
  });

  /* Body */
  const tbody = tbl.createTBody();
  latest.forEach(r => {
    const tr = tbody.insertRow();
    if (r.Entity === state.selectedCountry) tr.classList.add("selected");
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => selectCountry(r.Entity));

    TABLE_COLS.forEach(c => {
      const td = tr.insertCell();
      if (c.num) {
        td.className = "num";
        const v = r[c.key];
        td.textContent = v != null ? (c.key === "Year" ? String(Math.round(v)) : fmt(v, 1)) : "–";
      } else {
        td.textContent = r[c.key] ?? "–";
      }
    });
  });

  wrap.appendChild(tbl);

  /* Scroll selected row to the top of the visible area (below sticky header) */
  const selectedRow = wrap.querySelector("tr.selected");
  if (selectedRow) {
    const theadHeight = tbl.querySelector("thead")?.offsetHeight ?? 0;
    wrap.scrollTop = selectedRow.offsetTop - theadHeight;
  }
}

/* ─────────────────────────────────────────────────────────────────
   REGION FILTER POPULATION
   ───────────────────────────────────────────────────────────────── */
function populateRegionFilter(allRows) {
  const regions = ["All regions", ...Object.keys(REGION_MAP)];
  const sel = document.getElementById("regionFilter");
  regions.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r === "All regions" ? "all" : r;
    opt.textContent = r;
    sel.appendChild(opt);
  });
}

/* ─────────────────────────────────────────────────────────────────
   EVENT WIRING
   ───────────────────────────────────────────────────────────────── */
function wireControls(allRows) {
  document.getElementById("yearStart").addEventListener("change", function() {
    state.yearStart = Math.min(+this.value, state.yearEnd);
    this.value = state.yearStart;
    render(allRows);
  });
  document.getElementById("yearEnd").addEventListener("change", function() {
    state.yearEnd = Math.max(+this.value, state.yearStart);
    this.value = state.yearEnd;
    render(allRows);
  });
  document.getElementById("mapMetric").addEventListener("change", function() {
    state.mapMetric = this.value;
    drawWorldMap(filteredRows(allRows));
  });
  document.getElementById("regionFilter").addEventListener("change", function() {
    state.region = this.value;
    render(window.__allRows);
  });
  document.getElementById("resetBtn").addEventListener("click", function() {
    const defaultMetric = "Renewable energy share in the total final energy consumption (%)";
    state.yearStart       = 2000;
    state.yearEnd         = 2020;
    state.mapMetric       = defaultMetric;
    state.region          = "all";
    state.selectedCountry = null;
    state.areaFocus       = null;
    state.countrySearch   = "";
    document.getElementById("yearStart").value   = 2000;
    document.getElementById("yearEnd").value     = 2020;
    document.getElementById("mapMetric").value   = defaultMetric;
    document.getElementById("regionFilter").value = "all";
    document.getElementById("countrySearch").value = "";
    render(window.__allRows);
  });
  document.getElementById("countrySearch").addEventListener("input", function() {
    state.countrySearch = this.value;
    render(window.__allRows);
  });
}

/* ─────────────────────────────────────────────────────────────────
   ENTRY POINT
   ───────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  Promise.all([
    d3.csv(CSV_FILE),
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
  ])
  .then(([raw, world]) => {

    worldData = world;
    const allRows = coerce(raw);
    window.__allRows = allRows;
    populateRegionFilter(allRows);
    wireControls(allRows);
    render(allRows);

    /* Re-render charts on window resize */
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => render(window.__allRows), 180);
    });

  }).catch(err => {
    console.error("Failed to load CSV:", err);
    document.querySelector(".viz-area").innerHTML =
      `<div class="loading-msg" style="grid-column:1/-1">
         Could not load dataset. Ensure <code>${CSV_FILE}</code> is in the same folder as index.html
         and the page is served via a local web server (e.g. <code>python3 -m http.server</code>).
       </div>`;
  });
});
