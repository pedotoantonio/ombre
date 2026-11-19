// Il trascinamento progressivo del pianificatore (D60): vanilla, nessun fetch,
// nessuna libreria. Presa una postazione della griglia del disegno, il rilascio su
// una cella COMPILA il modulo di spostamento (fascia/fila/colonna) e lo INVIA come
// un POST normale a piena pagina: la via senza JavaScript resta identica e intera.
// Il drag parte solo dopo una soglia di movimento, così il click e la tastiera
// restano quelli di sempre; niente viene impedito a chi non trascina.
(function () {
  'use strict';
  var form = document.getElementById('modulo-sposta');
  if (!form) return;
  var spotField = document.getElementById('sposta-postazione');
  var zoneField = document.getElementById('sposta-zona');
  var rowField = document.getElementById('sposta-fila');
  var colField = document.getElementById('sposta-colonna');
  if (!spotField || !zoneField || !rowField || !colField) return;

  var THRESHOLD = 8; // pixel prima che il gesto diventi un trascinamento
  var sources = document.querySelectorAll('[data-pf-spot]');
  if (sources.length === 0) return;
  for (var i = 0; i < sources.length; i += 1) sources[i].classList.add('draw-cell--trascinabile');

  var picked = null; // la postazione presa
  var start = null; // punto di partenza del puntatore
  var dragging = false;
  var justDragged = false; // vero per un attimo dopo il rilascio: il click non scatta
  var target = null; // la cella mirata

  function cellAt(x, y) {
    var under = document.elementFromPoint(x, y);
    return under ? under.closest('[data-pf-cella]') : null;
  }

  function clearTarget() {
    if (target) target.classList.remove('draw-cell--mira');
    target = null;
  }

  function stop() {
    if (picked) picked.classList.remove('draw-cell--presa');
    clearTarget();
    picked = null;
    start = null;
    dragging = false;
  }

  document.addEventListener('pointerdown', function (event) {
    if (event.button !== 0) return;
    var source = event.target && event.target.closest ? event.target.closest('[data-pf-spot]') : null;
    if (!source) return;
    picked = source;
    start = { x: event.clientX, y: event.clientY };
  });

  document.addEventListener('pointermove', function (event) {
    if (!picked || !start) return;
    var dx = event.clientX - start.x;
    var dy = event.clientY - start.y;
    if (!dragging && dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
    if (!dragging) {
      dragging = true;
      picked.classList.add('draw-cell--presa');
    }
    // Con l'aggancio alla griglia: la cella sotto il puntatore si illumina.
    event.preventDefault();
    var cell = cellAt(event.clientX, event.clientY);
    if (cell !== target) {
      clearTarget();
      if (cell && cell !== picked) {
        target = cell;
        target.classList.add('draw-cell--mira');
      }
    }
  });

  document.addEventListener('pointerup', function (event) {
    if (!picked) return;
    if (!dragging) {
      stop();
      return;
    }
    justDragged = true;
    setTimeout(function () {
      justDragged = false;
    }, 0);
    var cell = cellAt(event.clientX, event.clientY);
    var spotId = picked.getAttribute('data-pf-spot');
    stop();
    if (!cell || !spotId) return;
    var cella = cell.getAttribute('data-pf-cella');
    var parts = cella ? cella.split('/') : null;
    if (!parts || parts.length !== 3) return;
    // Compila il modulo di spostamento e lo invia: lo stesso POST della via senza JavaScript.
    spotField.value = spotId;
    zoneField.value = parts[0];
    rowField.value = parts[1];
    colField.value = parts[2];
    if (spotField.value !== spotId) return; // postazione non in elenco: niente invio
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  });

  document.addEventListener('pointercancel', stop);

  // Un click nato da un trascinamento non deve scattare (per esempio col pennello attivo).
  document.addEventListener(
    'click',
    function (event) {
      if (!justDragged) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
})();
