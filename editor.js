(function () {
  "use strict";

  var stickers = Array.isArray(window.STICKERS) ? window.STICKERS : [];
  var settings = window.SETTINGS || { bookCols: 2, bookRows: 3 };
  var viewer = null;
  var selectedId = stickers[0] ? stickers[0].id : null;

  var list = document.getElementById("sticker-list");
  var labelInput = document.getElementById("label-input");
  var urlInput = document.getElementById("url-input");
  var colsInput = document.getElementById("cols-input");
  var rowsInput = document.getElementById("rows-input");
  var empty = document.getElementById("empty-state");

  function selected() {
    return stickers.find(function (item) {
      return item.id === selectedId;
    }) || null;
  }

  function reindexRanks() {
    stickers.forEach(function (item, index) {
      item.rank = index + 1;
    });
  }

  function renderList() {
    list.replaceChildren();
    var ordered = stickers.slice().sort(Viewer.byRank);
    ordered.forEach(function (sticker) {
      var item = document.createElement("li");
      item.dataset.id = sticker.id;
      item.draggable = true;
      if (sticker.id === selectedId) item.classList.add("selected");
      var img = document.createElement("img");
      img.src = sticker.webp;
      img.alt = "";
      img.draggable = false;
      var meta = document.createElement("div");
      meta.className = "meta";
      var title = document.createElement("strong");
      title.textContent = sticker.label || ("Sticker " + sticker.id);
      var sub = document.createElement("span");
      sub.textContent = sticker.url || "No link yet";
      meta.append(title, sub);
      var rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = "#" + sticker.rank;
      item.append(img, meta, rank);
      list.append(item);
    });
  }

  function fillFields() {
    var sticker = selected();
    var enabled = !!sticker;
    labelInput.disabled = !enabled;
    urlInput.disabled = !enabled;
    if (!sticker) {
      labelInput.value = "";
      urlInput.value = "";
      return;
    }
    labelInput.value = sticker.label || "";
    urlInput.value = sticker.url || "";
  }

  function selectSticker(id) {
    selectedId = id;
    fillFields();
    renderList();
    if (viewer) viewer.select(id, true);
    var row = list.querySelector('[data-id="' + id + '"]');
    if (row) row.scrollIntoView({ block: "nearest" });
  }

  function refreshViewer(fit) {
    if (!viewer) return;
    viewer.refresh({ fit: !!fit });
  }

  function autoScatter() {
    var cols = Math.max(1, Math.ceil(Math.sqrt(stickers.length * 1.2)));
    var order = stickers.slice();
    for (var i = order.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    order.forEach(function (sticker, index) {
      var col = index % cols;
      var row = Math.floor(index / cols);
      sticker.canvas = {
        x: 80 + col * 230 + Math.random() * 48 - 24,
        y: 80 + row * 270 + Math.random() * 48 - 24,
        rot: Math.random() * 18 - 9,
        scale: (sticker.canvas && sticker.canvas.scale) || 1
      };
    });
    refreshViewer(true);
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function viewerHtml() {
    var data =
      "window.SETTINGS = " + JSON.stringify(settings, null, 2) + ";\n" +
      "window.STICKERS = " + JSON.stringify(stickers, null, 2) + ";";
    return [
      "<!DOCTYPE html>",
      '<html lang="en">',
      "<head>",
      '  <meta charset="UTF-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      "  <title>Fanfest Berlin 2026 Stickers</title>",
      '  <link rel="stylesheet" href="app.css">',
      "</head>",
      '<body class="viewer">',
      '  <div class="app">',
      '  <header class="topbar">',
      '    <div class="brand">',
      "      <h1>Fanfest Berlin 2026</h1>",
      "      <p>Sticker exchange</p>",
      "    </div>",
      '    <div class="topbar-spacer"></div>',
      '    <div class="mode-toggle" role="tablist">',
      '      <button type="button" data-mode="canvas" class="active">Canvas</button>',
      '      <button type="button" data-mode="book">Sticker book</button>',
      "    </div>",
      '    <div class="zoom-controls">',
      '      <button type="button" class="icon-btn" data-zoom="out" aria-label="Zoom out">&minus;</button>',
      '      <button type="button" class="icon-btn" data-zoom="fit">Fit</button>',
      '      <button type="button" class="icon-btn" data-zoom="in" aria-label="Zoom in">+</button>',
      "    </div>",
      "  </header>",
      '  <div id="stage" class="stage"></div>',
      "  </div>",
      '  <div id="lightbox" class="lightbox" hidden></div>',
      '  <div id="print-book" class="print-book"></div>',
      "  <script>",
      data,
      "  </script>",
      '  <script src="viewer.js"></script>',
      "  <script>",
      "    (function () {",
      "      var stage = document.getElementById('stage');",
      "      var app = Viewer.start({",
      "        stage: stage,",
      "        lightbox: document.getElementById('lightbox'),",
      "        printRoot: document.getElementById('print-book'),",
      "        stickers: window.STICKERS || [],",
      "        settings: window.SETTINGS || { bookCols: 2, bookRows: 3 },",
      "        editable: false",
      "      });",
      "      document.querySelectorAll('[data-mode]').forEach(function (button) {",
      "        button.addEventListener('click', function () {",
      "          document.querySelectorAll('[data-mode]').forEach(function (node) {",
      "            node.classList.toggle('active', node === button);",
      "          });",
      "          app.setMode(button.dataset.mode);",
      "        });",
      "      });",
      "      document.querySelector('[data-zoom=\"out\"]').addEventListener('click', function () { app.zoom(-1); });",
      "      document.querySelector('[data-zoom=\"in\"]').addEventListener('click', function () { app.zoom(1); });",
      "      document.querySelector('[data-zoom=\"fit\"]').addEventListener('click', function () { app.fit(); });",
      "    })();",
      "  </script>",
      "</body>",
      "</html>",
      ""
    ].join("\n");
  }

  function exportFiles() {
    stickers.forEach(function (sticker) {
      sticker.url = Viewer.normalizeUrl(sticker.url);
    });
    download("data.js", Viewer.serializeDataJs(settings, stickers));
    setTimeout(function () {
      download("index.html", viewerHtml());
    }, 250);
  }

  function bindModeAndZoom() {
    document.querySelectorAll("[data-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll("[data-mode]").forEach(function (node) {
          node.classList.toggle("active", node === button);
        });
        viewer.setMode(button.dataset.mode);
      });
    });
    document.querySelector('[data-zoom="out"]').addEventListener("click", function () {
      viewer.zoom(-1);
    });
    document.querySelector('[data-zoom="in"]').addEventListener("click", function () {
      viewer.zoom(1);
    });
    document.querySelector('[data-zoom="fit"]').addEventListener("click", function () {
      viewer.fit();
    });
  }

  if (!stickers.length) {
    empty.hidden = false;
    colsInput.disabled = true;
    rowsInput.disabled = true;
    labelInput.disabled = true;
    urlInput.disabled = true;
    return;
  }

  empty.hidden = true;
  empty.remove();
  colsInput.value = settings.bookCols || 2;
  rowsInput.value = settings.bookRows || 3;
  stickers.sort(Viewer.byRank);
  reindexRanks();

  viewer = Viewer.start({
    stage: document.getElementById("stage"),
    lightbox: document.getElementById("lightbox"),
    printRoot: document.getElementById("print-book"),
    stickers: stickers,
    settings: settings,
    editable: true,
    onSelect: function (sticker) {
      if (sticker) selectSticker(sticker.id);
    },
    onChange: function () {}
  });

  bindModeAndZoom();
  fillFields();
  renderList();
  if (selectedId) viewer.select(selectedId, true);

  labelInput.addEventListener("input", function () {
    var sticker = selected();
    if (!sticker) return;
    sticker.label = labelInput.value;
    renderList();
    refreshViewer(false);
  });

  urlInput.addEventListener("change", function () {
    var sticker = selected();
    if (!sticker) return;
    sticker.url = Viewer.normalizeUrl(urlInput.value);
    urlInput.value = sticker.url;
    renderList();
    refreshViewer(false);
  });

  colsInput.addEventListener("change", function () {
    settings.bookCols = Math.max(1, Math.min(4, Number(colsInput.value) || 2));
    colsInput.value = settings.bookCols;
    refreshViewer(true);
  });

  rowsInput.addEventListener("change", function () {
    settings.bookRows = Math.max(1, Math.min(5, Number(rowsInput.value) || 3));
    rowsInput.value = settings.bookRows;
    refreshViewer(true);
  });

  list.addEventListener("click", function (event) {
    var row = event.target.closest("li[data-id]");
    if (row) selectSticker(row.dataset.id);
  });

  var dragId = null;
  list.addEventListener("dragstart", function (event) {
    var row = event.target.closest("li[data-id]");
    if (!row) return;
    dragId = row.dataset.id;
    event.dataTransfer.effectAllowed = "move";
  });
  list.addEventListener("dragover", function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  list.addEventListener("drop", function (event) {
    event.preventDefault();
    var row = event.target.closest("li[data-id]");
    if (!dragId || !row || dragId === row.dataset.id) return;
    var from = stickers.findIndex(function (item) { return item.id === dragId; });
    var to = stickers.findIndex(function (item) { return item.id === row.dataset.id; });
    if (from < 0 || to < 0) return;
    var moved = stickers.splice(from, 1)[0];
    stickers.splice(to, 0, moved);
    reindexRanks();
    renderList();
    refreshViewer(false);
  });

  document.getElementById("scatter-btn").addEventListener("click", autoScatter);
  document.getElementById("export-btn").addEventListener("click", exportFiles);
})();
