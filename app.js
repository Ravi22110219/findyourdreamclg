(function () {
  "use strict";

  var state = {
    rows: [],
    results: [],
    source: {},
    facets: {},
  };

  var els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  function titleValue(value) {
    return value || "All";
  }

  function asRank(value) {
    var parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function option(label, value) {
    var node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    return node;
  }

  function fillSelect(select, values, allLabel, preferred) {
    select.innerHTML = "";
    if (allLabel) {
      select.appendChild(option(allLabel, "ALL"));
    }
    values.forEach(function (value) {
      select.appendChild(option(value, value));
    });
    if (preferred && values.indexOf(preferred) !== -1) {
      select.value = preferred;
    }
  }

  function formatDate(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function setupDataset() {
    var payload = window.JOSAA_DATA;
    if (!payload || !Array.isArray(payload.rows)) {
      els.datasetPill.textContent = "Dataset not found";
      els.rankNote.textContent = "Run scripts/fetch_josaa.py to generate data/josaa-2025-round-6.js.";
      els.rankNote.classList.add("error-text");
      return false;
    }

    state.rows = payload.rows;
    state.source = payload.source || {};
    state.facets = payload.facets || {};

    var source = state.source;
    els.datasetPill.textContent = [
      "JoSAA",
      source.year || "",
      "Round",
      source.round || "",
      state.rows.length.toLocaleString(),
      "rows",
    ].filter(Boolean).join(" ");

    els.rankNote.textContent = source.note || "";
    return true;
  }

  function setupControls() {
    fillSelect(els.seatTypeSelect, state.facets.seatTypes || [], "", "OPEN");
    fillSelect(els.quotaSelect, state.facets.quotas || [], "All quotas");
    fillSelect(els.instituteTypeSelect, state.facets.instituteTypes || [], "All types");
  }

  function parseQuickPaste() {
    var text = els.quickPaste.value;
    if (!text.trim()) return;

    var upper = text.toUpperCase();
    var rankMatch = upper.match(/\b\d{1,7}\b/);
    if (rankMatch) {
      els.rankInput.value = rankMatch[0];
    }

    var seatTypes = (state.facets.seatTypes || []).slice().sort(function (a, b) {
      return b.length - a.length;
    });
    var compact = upper.replace(/[\s_-]+/g, "");
    var foundSeat = seatTypes.find(function (seat) {
      var seatCompact = seat.toUpperCase().replace(/[\s_()-]+/g, "");
      if (compact.indexOf(seatCompact) !== -1) return true;
      if (seat === "OBC-NCL" && /OBC|OBCNCL/.test(compact) && compact.indexOf("PWD") === -1) return true;
      if (seat === "EWS" && compact.indexOf("EWS") !== -1 && compact.indexOf("PWD") === -1) return true;
      if (seat === "OPEN" && /OPEN|GENERAL|GEN/.test(compact) && compact.indexOf("PWD") === -1) return true;
      if (seat === "SC" && compact.indexOf("SC") !== -1 && compact.indexOf("PWD") === -1) return true;
      if (seat === "ST" && compact.indexOf("ST") !== -1 && compact.indexOf("PWD") === -1) return true;
      return false;
    });
    if (foundSeat) {
      els.seatTypeSelect.value = foundSeat;
    }

    if (/FEMALE|GIRL|WOMAN/.test(upper)) {
      els.genderSelect.value = "female";
    } else if (/ALL\s*GENDER|ALL\s*SEAT/.test(upper)) {
      els.genderSelect.value = "all";
    } else if (/MALE|BOY|GENDER\s*NEUTRAL/.test(upper)) {
      els.genderSelect.value = "neutral";
    }

    var quotas = state.facets.quotas || [];
    var foundQuota = quotas.find(function (quota) {
      return new RegExp("\\b" + quota.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(upper);
    });
    if (foundQuota) {
      els.quotaSelect.value = foundQuota;
    }
  }

  function genderMatches(rowGender, mode) {
    if (mode === "all") return true;
    if (mode === "female") {
      return rowGender.indexOf("Female-only") !== -1 || rowGender.indexOf("Gender-Neutral") !== -1;
    }
    return rowGender.indexOf("Gender-Neutral") !== -1;
  }

  function rowMatches(row, query) {
    if (row.closingRank == null) return false;
    if (!query.includePreparatory && row.isPreparatory) return false;
    if (row.closingRank < query.rank) return false;
    if (query.seatType !== "ALL" && row.seatType !== query.seatType) return false;
    if (query.quota !== "ALL" && row.quota !== query.quota) return false;
    if (query.instituteType !== "ALL" && row.instituteType !== query.instituteType) return false;
    if (!genderMatches(row.gender, query.genderMode)) return false;
    if (query.instituteSearch && normalize(row.institute).indexOf(query.instituteSearch) === -1) return false;
    if (query.programSearch && normalize(row.program).indexOf(query.programSearch) === -1) return false;
    return true;
  }

  function compareResults(sortMode, rank) {
    return function (a, b) {
      if (sortMode === "safe") {
        return (b.closingRank - rank) - (a.closingRank - rank);
      }
      if (sortMode === "institute") {
        return a.institute.localeCompare(b.institute) || a.program.localeCompare(b.program);
      }
      if (sortMode === "program") {
        return a.program.localeCompare(b.program) || a.institute.localeCompare(b.institute);
      }
      return a.closingRank - b.closingRank || a.openingRank - b.openingRank;
    };
  }

  function currentQuery() {
    return {
      rank: asRank(els.rankInput.value),
      seatType: els.seatTypeSelect.value || "ALL",
      genderMode: els.genderSelect.value,
      quota: els.quotaSelect.value || "ALL",
      instituteType: els.instituteTypeSelect.value || "ALL",
      instituteSearch: normalize(els.instituteSearch.value),
      programSearch: normalize(els.programSearch.value),
      sortMode: els.sortSelect.value,
      includePreparatory: els.prepCheckbox.checked,
    };
  }

  function clearTable(message) {
    els.resultsBody.innerHTML = "";
    var tr = document.createElement("tr");
    var td = document.createElement("td");
    td.colSpan = 9;
    td.className = "empty-state";
    td.textContent = message;
    tr.appendChild(td);
    els.resultsBody.appendChild(tr);
  }

  function rankText(raw, rank) {
    if (raw) return raw;
    if (rank == null) return "";
    return rank.toLocaleString();
  }

  function appendCell(row, text, className) {
    var td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = text;
    row.appendChild(td);
    return td;
  }

  function appendTagCell(row, text) {
    var td = document.createElement("td");
    var tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = text;
    td.appendChild(tag);
    row.appendChild(td);
  }

  function renderResults(query) {
    els.resultCount.textContent = state.results.length.toLocaleString();
    els.exportButton.disabled = state.results.length === 0;

    if (!query.rank) {
      els.resultSummary.textContent = "Enter a rank to start.";
      clearTable("No query yet.");
      return;
    }

    if (!state.results.length) {
      els.resultSummary.textContent = "No matching JoSAA rows for rank " + query.rank.toLocaleString() + ".";
      clearTable("No eligible rows under the current filters.");
      return;
    }

    els.resultSummary.textContent = [
      "Rank " + query.rank.toLocaleString(),
      titleValue(query.seatType),
      titleValue(query.quota),
      titleValue(query.instituteType),
    ].join(" / ");

    els.resultsBody.innerHTML = "";
    state.results.slice(0, 500).forEach(function (row) {
      var tr = document.createElement("tr");
      var margin = row.closingRank - query.rank;
      appendCell(tr, row.institute, "institute-cell");
      appendCell(tr, row.program, "branch-cell");
      appendTagCell(tr, row.instituteType);
      appendCell(tr, row.quota);
      appendCell(tr, row.seatType);
      appendCell(tr, row.gender);
      appendCell(tr, rankText(row.openingRankRaw, row.openingRank));
      appendCell(tr, rankText(row.closingRankRaw, row.closingRank));
      appendCell(
        tr,
        margin.toLocaleString(),
        margin <= 500 ? "margin-tight" : "margin-good"
      );
      els.resultsBody.appendChild(tr);
    });

    if (state.results.length > 500) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 9;
      td.className = "empty-state";
      td.textContent = "Showing first 500 matches. Use filters to narrow the list.";
      tr.appendChild(td);
      els.resultsBody.appendChild(tr);
    }
  }

  function runSearch(event) {
    if (event) event.preventDefault();
    var query = currentQuery();
    if (!query.rank) {
      state.results = [];
      renderResults(query);
      els.rankInput.focus();
      return;
    }

    state.results = state.rows
      .filter(function (row) {
        return rowMatches(row, query);
      })
      .sort(compareResults(query.sortMode, query.rank));

    renderResults(query);
  }

  function resetForm() {
    els.rankForm.reset();
    els.seatTypeSelect.value = (state.facets.seatTypes || []).indexOf("OPEN") !== -1 ? "OPEN" : els.seatTypeSelect.value;
    els.quotaSelect.value = "ALL";
    els.instituteTypeSelect.value = "ALL";
    state.results = [];
    renderResults(currentQuery());
  }

  function csvEscape(value) {
    var text = String(value == null ? "" : value);
    if (/[",\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function exportCsv() {
    if (!state.results.length) return;
    var headers = [
      "Institute",
      "Institute Type",
      "Program",
      "Quota",
      "Seat Type",
      "Gender",
      "Opening Rank",
      "Closing Rank",
      "Preparatory",
    ];
    var lines = [headers.map(csvEscape).join(",")];
    state.results.forEach(function (row) {
      lines.push([
        row.institute,
        row.instituteType,
        row.program,
        row.quota,
        row.seatType,
        row.gender,
        row.openingRankRaw,
        row.closingRankRaw,
        row.isPreparatory ? "yes" : "no",
      ].map(csvEscape).join(","));
    });

    var blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    var link = document.createElement("a");
    var source = state.source || {};
    link.href = URL.createObjectURL(blob);
    link.download = "josaa-matches-" + (source.year || "data") + "-round-" + (source.round || "x") + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function bind() {
    els.rankForm.addEventListener("submit", runSearch);
    els.resetButton.addEventListener("click", resetForm);
    els.exportButton.addEventListener("click", exportCsv);
    els.quickPaste.addEventListener("input", parseQuickPaste);
    [
      els.rankInput,
      els.seatTypeSelect,
      els.genderSelect,
      els.quotaSelect,
      els.instituteTypeSelect,
      els.instituteSearch,
      els.programSearch,
      els.sortSelect,
      els.prepCheckbox,
    ].forEach(function (control) {
      control.addEventListener("change", function () {
        if (asRank(els.rankInput.value)) runSearch();
      });
      control.addEventListener("input", function () {
        if (control.type === "search" && asRank(els.rankInput.value)) runSearch();
      });
    });
  }

  function boot() {
    els = {
      datasetPill: byId("datasetPill"),
      exportButton: byId("exportButton"),
      genderSelect: byId("genderSelect"),
      instituteSearch: byId("instituteSearch"),
      instituteTypeSelect: byId("instituteTypeSelect"),
      prepCheckbox: byId("prepCheckbox"),
      programSearch: byId("programSearch"),
      quickPaste: byId("quickPaste"),
      quotaSelect: byId("quotaSelect"),
      rankForm: byId("rankForm"),
      rankInput: byId("rankInput"),
      rankNote: byId("rankNote"),
      resetButton: byId("resetButton"),
      resultCount: byId("resultCount"),
      resultSummary: byId("resultSummary"),
      resultsBody: byId("resultsBody"),
      seatTypeSelect: byId("seatTypeSelect"),
      sortSelect: byId("sortSelect"),
    };

    if (!setupDataset()) return;
    setupControls();
    bind();
    renderResults(currentQuery());

    var source = state.source || {};
    if (source.fetchedAt) {
      els.rankNote.textContent = (source.note || "") + " Data fetched " + formatDate(source.fetchedAt) + ".";
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
}());
