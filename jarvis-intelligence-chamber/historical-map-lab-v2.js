/* Χαρτογραφικό Εργαστήριο — χειρισμός σπασμένης εικόνας και κενής κατάστασης (χωρίς δικτυακά αιτήματα εγγραφής). */
(() => {
  const img = document.getElementById("historicalMapPreview");
  const panel = document.querySelector(".hm-map-panel");
  const count = document.getElementById("mapCount");
  const commons = "https://commons.wikimedia.org/wiki/File:1662_Portolan_chart_of_the_Aegean_Sea_and_the_Dardanelles_by_Fran%C3%A7ois_Ollive.jpg";
  const fail = () => {
    if (!img || img.dataset.failed) return;
    img.dataset.failed = "1";
    const box = document.createElement("div");
    box.className = "hm-img-fallback";
    box.setAttribute("role", "status");
    box.innerHTML = '<strong>Η εικόνα του πορτολάνου δεν είναι διαθέσιμη προσωρινά</strong><p>Το αρχείο προεπισκόπησης δεν φορτώθηκε. Μπορείς να δεις την πρωτότυπη εικόνα (δημόσιο αρχείο, Gallica/BnF) στο Wikimedia Commons· τα υπόλοιπα εργαλεία λειτουργούν κανονικά.</p>';
    const a = document.createElement("a");
    a.href = commons; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "Άνοιγμα πρωτότυπης εικόνας ↗";
    box.append(a);
    img.replaceWith(box);
  };
  if (img) {
    img.addEventListener("error", fail);
    if (img.complete && img.naturalWidth === 0) fail();
  }
  const sync = () => {
    if (!panel || !count) return;
    const n = parseInt((count.textContent.match(/\d+/) || ["0"])[0], 10) || 0;
    const empty = n === 0;
    if (panel.classList.contains("is-empty") !== empty) {
      panel.classList.toggle("is-empty", empty);
      window.dispatchEvent(new Event("resize"));
    }
  };
  if (count) new MutationObserver(sync).observe(count, { childList: true, characterData: true, subtree: true });
  sync();
})();
