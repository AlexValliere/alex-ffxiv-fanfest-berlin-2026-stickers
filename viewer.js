(function (global) {
  "use strict";

  var MIN_SCALE = 0.12;
  var MAX_SCALE = 5;
  var ZOOMED_OUT = 0.55;
  var PAGE_WIDTH = 520;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function byRank(a, b) {
    return (a.rank || 0) - (b.rank || 0) || String(a.id).localeCompare(String(b.id));
  }

  function stickerById(stickers, id) {
    for (var i = 0; i < stickers.length; i += 1) {
      if (stickers[i].id === id) return stickers[i];
    }
    return null;
  }

  function normalizeUrl(url) {
    var value = String(url || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return "https://" + value;
  }

  function ensureCanvas(sticker, index, total) {
    if (sticker.canvas && typeof sticker.canvas.x === "number") return sticker.canvas;
    var cols = Math.max(1, Math.ceil(Math.sqrt(total * 1.2)));
    var col = index % cols;
    var row = Math.floor(index / cols);
    var seed = 0;
    var id = String(sticker.id || index);
    for (var i = 0; i < id.length; i += 1) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
    sticker.canvas = {
      x: 80 + col * 230 + (seed % 41) - 20,
      y: 80 + row * 270 + ((seed >>> 8) % 41) - 20,
      rot: ((seed >>> 16) % 17) - 8,
      scale: 1
    };
    return sticker.canvas;
  }

  function canvasBounds(stickers) {
    var maxX = 900;
    var maxY = 700;
    for (var i = 0; i < stickers.length; i += 1) {
      var canvas = stickers[i].canvas || {};
      maxX = Math.max(maxX, (canvas.x || 0) + 230);
      maxY = Math.max(maxY, (canvas.y || 0) + 280);
    }
    return { w: maxX + 80, h: maxY + 80 };
  }

  function setCaption(node, sticker, placeholder) {
    node.replaceChildren();
    var text = String(sticker.label || "").trim();
    var url = normalizeUrl(sticker.url);
    if (!text && !url) {
      if (placeholder) {
        var hint = document.createElement("span");
        hint.className = "placeholder";
        hint.textContent = placeholder;
        node.append(hint);
      }
      return;
    }
    if (url) {
      var link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = text || url.replace(/^https?:\/\//i, "");
      link.addEventListener("pointerdown", function (event) {
        event.stopPropagation();
      });
      link.addEventListener("click", function (event) {
        event.stopPropagation();
      });
      node.append(link);
      return;
    }
    var span = document.createElement("span");
    span.textContent = text;
    node.append(span);
  }

  function serializeDataJs(settings, stickers) {
    return (
      "/* Generated sticker metadata. Re-run tools/build-webp.py to add new files. */\n" +
      "window.SETTINGS = " + JSON.stringify(settings, null, 2) + ";\n\n" +
      "window.STICKERS = " + JSON.stringify(stickers, null, 2) + ";\n"
    );
  }

  function start(options) {
    var stage = options.stage;
    var lightbox = options.lightbox;
    var stickers = options.stickers || [];
    var settings = options.settings || { bookCols: 2, bookRows: 3 };
    var editable = !!options.editable;
    var onSelect = options.onSelect || function () {};
    var onChange = options.onChange || function () {};

    settings.bookCols = settings.bookCols || 2;
    settings.bookRows = settings.bookRows || 3;

    var mode = "canvas";
    var selectedId = null;
    var pageIndex = 0;
    var panX = 0;
    var panY = 0;
    var scale = 1;
    var panning = false;
    var panStart = null;
    var drag = null;
    var spaceDown = false;
    var pointerStart = null;
    var didMove = false;
    var suppressClick = false;
    var fitRaf = 0;
    var PAN_THRESHOLD = 6;

    var world = document.createElement("div");
    world.className = "world";
    stage.append(world);

    var bookHud = document.createElement("div");
    bookHud.className = "book-hud";
    bookHud.hidden = true;
    var prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.textContent = "Prev";
    var pageLabel = document.createElement("span");
    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "Next";
    bookHud.append(prevBtn, pageLabel, nextBtn);
    stage.append(bookHud);

    var printRoot = options.printRoot || null;

    function cancelScheduledFit() {
      if (fitRaf) {
        cancelAnimationFrame(fitRaf);
        fitRaf = 0;
      }
    }

    function applyTransform() {
      world.style.transform = "translate(" + panX + "px, " + panY + "px) scale(" + scale + ")";
      stage.classList.toggle("zoomed-out", scale < ZOOMED_OUT);
    }

    function setScaleAt(clientX, clientY, nextScale) {
      cancelScheduledFit();
      var rect = stage.getBoundingClientRect();
      var cx = clientX - rect.left;
      var cy = clientY - rect.top;
      nextScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      var ratio = nextScale / scale;
      panX = cx - (cx - panX) * ratio;
      panY = cy - (cy - panY) * ratio;
      scale = nextScale;
      applyTransform();
    }

    function fit() {
      var rect = stage.getBoundingClientRect();
      var pad = 48;
      var worldW = world.offsetWidth || PAGE_WIDTH;
      var worldH = world.offsetHeight || Math.round(PAGE_WIDTH * 210 / 148);
      if (!worldW || !worldH || !rect.width || !rect.height) return;
      var next = Math.min((rect.width - pad) / worldW, (rect.height - pad) / worldH);
      next = clamp(next, MIN_SCALE, 1.15);
      scale = next;
      panX = (rect.width - worldW * scale) / 2;
      panY = (rect.height - worldH * scale) / 2;
      applyTransform();
    }

    function pageCount() {
      var per = (settings.bookCols || 2) * (settings.bookRows || 3);
      return Math.max(1, Math.ceil(stickers.length / per));
    }

    function markSelected() {
      stage.querySelectorAll(".selected").forEach(function (node) {
        node.classList.remove("selected");
      });
      if (!selectedId) return;
      stage.querySelectorAll('[data-id="' + selectedId + '"]').forEach(function (node) {
        node.classList.add("selected");
      });
    }

    function select(id, silent) {
      selectedId = id;
      markSelected();
      if (!silent) onSelect(stickerById(stickers, id));
    }

    function openLightbox(sticker) {
      if (!lightbox || !sticker) return;
      lightbox.replaceChildren();
      lightbox.hidden = false;
      var close = document.createElement("button");
      close.type = "button";
      close.className = "icon-btn lightbox-close";
      close.setAttribute("aria-label", "Close");
      close.textContent = "×";
      var img = document.createElement("img");
      img.src = sticker.webp;
      img.alt = sticker.label || ("Sticker " + sticker.id);
      var caption = document.createElement("p");
      setCaption(caption, sticker, "");
      lightbox.append(close, img, caption);
      close.addEventListener("click", closeLightbox);
      bookHud.hidden = true;
    }

    function closeLightbox() {
      if (!lightbox) return;
      lightbox.hidden = true;
      lightbox.replaceChildren();
      bookHud.hidden = mode !== "book";
    }

    function makeCanvasSticker(sticker, index) {
      var canvas = ensureCanvas(sticker, index, stickers.length);
      var node = document.createElement("article");
      node.className = "sticker canvas-sticker";
      node.dataset.id = sticker.id;
      node.style.left = canvas.x + "px";
      node.style.top = canvas.y + "px";
      node.style.transform =
        "rotate(" + (canvas.rot || 0) + "deg) scale(" + (canvas.scale || 1) + ")";
      var img = document.createElement("img");
      img.src = sticker.webp;
      img.alt = sticker.label || ("Sticker " + sticker.id);
      img.draggable = false;
      img.loading = "lazy";
      var caption = document.createElement("figcaption");
      setCaption(caption, sticker, editable ? "Add a label" : "");
      node.append(img, caption);
      return node;
    }

    function makeBookCell(sticker) {
      var cell = document.createElement("article");
      cell.className = "book-cell";
      if (!sticker) return cell;
      cell.dataset.id = sticker.id;
      var img = document.createElement("img");
      img.src = sticker.webp;
      img.alt = sticker.label || ("Sticker " + sticker.id);
      img.draggable = false;
      var caption = document.createElement("figcaption");
      setCaption(caption, sticker, editable ? "Add a label" : "");
      cell.append(img, caption);
      return cell;
    }

    function renderPrintBook() {
      if (!printRoot) return;
      printRoot.replaceChildren();
      var cols = settings.bookCols || 2;
      var rows = settings.bookRows || 3;
      var per = cols * rows;
      var sorted = stickers.slice().sort(byRank);
      var pages = Math.max(1, Math.ceil(sorted.length / per));
      for (var p = 0; p < pages; p += 1) {
        var page = document.createElement("div");
        page.className = "book-page print-page";
        page.style.setProperty("--cols", String(cols));
        page.style.setProperty("--rows", String(rows));
        var slice = sorted.slice(p * per, p * per + per);
        for (var i = 0; i < per; i += 1) page.append(makeBookCell(slice[i] || null));
        printRoot.append(page);
      }
    }

    function renderCanvas() {
      var bounds = canvasBounds(stickers);
      world.className = "world canvas-world";
      world.style.width = bounds.w + "px";
      world.style.height = bounds.h + "px";
      world.replaceChildren();
      for (var i = 0; i < stickers.length; i += 1) {
        world.append(makeCanvasSticker(stickers[i], i));
      }
    }

    function renderBook() {
      var cols = settings.bookCols || 2;
      var rows = settings.bookRows || 3;
      var per = cols * rows;
      var sorted = stickers.slice().sort(byRank);
      var pages = Math.max(1, Math.ceil(sorted.length / per));
      pageIndex = clamp(pageIndex, 0, pages - 1);
      var slice = sorted.slice(pageIndex * per, pageIndex * per + per);
      world.className = "world book-world";
      world.style.width = PAGE_WIDTH + "px";
      world.style.height = "";
      var page = document.createElement("div");
      page.className = "book-page";
      page.style.setProperty("--cols", String(cols));
      page.style.setProperty("--rows", String(rows));
      for (var i = 0; i < per; i += 1) page.append(makeBookCell(slice[i] || null));
      world.replaceChildren(page);
      pageLabel.textContent = "Page " + (pageIndex + 1) + " / " + pages;
    }

    function render(opts) {
      opts = opts || {};
      stage.dataset.view = mode;
      bookHud.hidden = mode !== "book";
      if (mode === "book") renderBook();
      else renderCanvas();
      markSelected();
      if (opts.fit) {
        cancelScheduledFit();
        fitRaf = requestAnimationFrame(function () {
          fitRaf = 0;
          fit();
        });
      }
    }

    if (printRoot) {
      window.addEventListener("beforeprint", renderPrintBook);
      window.addEventListener("afterprint", function () {
        printRoot.replaceChildren();
      });
    }

    function stickerFromEvent(event) {
      var node = event.target.closest("[data-id]");
      if (!node || !stage.contains(node)) return null;
      return stickerById(stickers, node.dataset.id);
    }

    function wantsPan(event, sticker) {
      if (event.button === 1 || spaceDown || event.altKey) return true;
      if (!editable) return true;
      if (mode !== "canvas") return true;
      return !sticker;
    }

    stage.addEventListener("wheel", function (event) {
      event.preventDefault();
      cancelScheduledFit();
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        panX -= event.deltaX;
        panY -= event.deltaY;
        applyTransform();
        return;
      }
      var factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      setScaleAt(event.clientX, event.clientY, scale * factor);
    }, { passive: false });

    stage.addEventListener("auxclick", function (event) {
      event.preventDefault();
    });

    stage.addEventListener("dragstart", function (event) {
      event.preventDefault();
    });

    function onPointerMove(event) {
      if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
      if (event.cancelable) event.preventDefault();
      cancelScheduledFit();
      var dx = event.clientX - pointerStart.x;
      var dy = event.clientY - pointerStart.y;
      if (dx * dx + dy * dy >= PAN_THRESHOLD * PAN_THRESHOLD) didMove = true;
      if (drag) {
        var sticker = stickerById(stickers, drag.id);
        if (!sticker) return;
        sticker.canvas.x = drag.startX + (event.clientX - drag.pointerX) / scale;
        sticker.canvas.y = drag.startY + (event.clientY - drag.pointerY) / scale;
        var node = world.querySelector('[data-id="' + drag.id + '"]');
        if (node) {
          node.style.left = sticker.canvas.x + "px";
          node.style.top = sticker.canvas.y + "px";
        }
        return;
      }
      if (!panning || !panStart) return;
      panX = event.clientX - panStart.x;
      panY = event.clientY - panStart.y;
      applyTransform();
    }

    function onPointerUp(event) {
      if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
      if (event.cancelable) event.preventDefault();
      var sticker = pointerStart.sticker;
      var wasDrag = !!drag;
      var moved = didMove;
      if (drag) {
        drag = null;
        onChange();
      }
      if (moved) {
        suppressClick = true;
        setTimeout(function () {
          suppressClick = false;
        }, 50);
      }
      panning = false;
      panStart = null;
      pointerStart = null;
      didMove = false;
      stage.classList.remove("is-panning");
      applyTransform();
      if (!moved && !wasDrag && sticker && !editable) openLightbox(sticker);
    }

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { passive: false });
    window.addEventListener("pointercancel", onPointerUp, { passive: false });

    document.addEventListener("click", function (event) {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }, true);

    stage.addEventListener("pointerdown", function (event) {
      if (event.button !== 0 && event.button !== 1) return;
      if (event.target.closest("a, button, input")) return;
      event.preventDefault();
      cancelScheduledFit();
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
      var sticker = stickerFromEvent(event);
      didMove = false;
      pointerStart = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        sticker: sticker
      };
      if (sticker && event.button === 0 && !spaceDown) select(sticker.id);
      if (wantsPan(event, sticker)) {
        panning = true;
        stage.classList.add("is-panning");
        panStart = { x: event.clientX - panX, y: event.clientY - panY };
      } else if (editable && mode === "canvas" && sticker) {
        ensureCanvas(sticker, 0, stickers.length);
        drag = {
          id: sticker.id,
          startX: sticker.canvas.x,
          startY: sticker.canvas.y,
          pointerX: event.clientX,
          pointerY: event.clientY
        };
      } else {
        panning = true;
        stage.classList.add("is-panning");
        panStart = { x: event.clientX - panX, y: event.clientY - panY };
      }
    });

    stage.addEventListener("dblclick", function (event) {
      if (event.target.closest("a, button")) return;
      var sticker = stickerFromEvent(event);
      if (sticker) openLightbox(sticker);
    });

    window.addEventListener("keydown", function (event) {
      if (event.code !== "Space") return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      event.preventDefault();
      spaceDown = true;
      stage.classList.add("is-panning");
    });
    window.addEventListener("keyup", function (event) {
      if (event.code !== "Space") return;
      spaceDown = false;
      if (!panning) stage.classList.remove("is-panning");
    });

    if (lightbox) {
      lightbox.hidden = true;
      lightbox.addEventListener("click", function (event) {
        if (event.target === lightbox) closeLightbox();
      });
    }

    prevBtn.addEventListener("click", function () {
      pageIndex -= 1;
      render({ fit: false });
    });
    nextBtn.addEventListener("click", function () {
      pageIndex += 1;
      render({ fit: false });
    });

    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeLightbox();
      if (mode !== "book") return;
      if (event.key === "ArrowLeft") {
        pageIndex -= 1;
        render({ fit: false });
      }
      if (event.key === "ArrowRight") {
        pageIndex += 1;
        render({ fit: false });
      }
    });

    render({ fit: true });

    return {
      setMode: function (next) {
        var resolved = next === "book" ? "book" : "canvas";
        if (resolved === mode) return;
        mode = resolved;
        render({ fit: true });
      },
      getMode: function () {
        return mode;
      },
      refresh: function (opts) {
        render(opts || {});
      },
      fit: fit,
      zoom: function (direction) {
        var rect = stage.getBoundingClientRect();
        var factor = direction < 0 ? 1 / 1.18 : 1.18;
        setScaleAt(rect.left + rect.width / 2, rect.top + rect.height / 2, scale * factor);
      },
      select: select,
      closeLightbox: closeLightbox,
      getSettings: function () {
        return settings;
      },
      getStickers: function () {
        return stickers;
      }
    };
  }

  global.Viewer = {
    start: start,
    serializeDataJs: serializeDataJs,
    normalizeUrl: normalizeUrl,
    byRank: byRank
  };
})(window);
