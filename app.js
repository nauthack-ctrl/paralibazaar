// ParaliBazaar — one listings array in localStorage, every view renders
// from it. Read the array, rebuild the DOM, save the array.

// querySelector shorthand
const $ = (sel) => document.querySelector(sel);

// escape user text before innerHTML so "<" in a village name can't break markup
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// 7540000 -> "7.54M", 5068 -> "5.07k"
const compact = (n) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(2)}M`
    : n >= 1000
      ? `${(n / 1e3).toFixed(2)}k`
      : `${Math.round(n)}`;

const STORE_KEY = "paralibazaar.listings.v1";

// demo network totals before this phone's listings; new ones add on top
const BASE_IMPACT = { tonnes: 5068, paid: 7_540_000, co2: 6467, listings: 419 };

// { id, village, acres, tonnes, price, phone, bids: [] }
// "Open" vs "Bid received" is just bids.length — no status field to keep in sync
let listings = loadListings();

function loadListings() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupt storage -> reseed
  }
  return [
    {
      id: "seed-1",
      village: "Barnala",
      acres: "6",
      tonnes: "9",
      price: "2300",
      phone: "9876500111",
      bids: [{ buyer: "GreenFuel Punjab", offer: "2600", qty: "9" }],
    },
    {
      id: "seed-2",
      village: "Bathinda",
      acres: "10",
      tonnes: "15",
      price: "2500",
      phone: "9876502222",
      bids: [],
    },
    {
      id: "seed-3",
      village: "Ludhiana",
      acres: "4",
      tonnes: "6",
      price: "2200",
      phone: "9876503333",
      bids: [],
    },
    {
      id: "seed-4",
      village: "Sangrur",
      acres: "8",
      tonnes: "12",
      price: "2400",
      phone: "9876504444",
      bids: [{ buyer: "AgroBoilers Ltd", offer: "2700", qty: "12" }],
    },
  ];
}

function saveListings() {
  localStorage.setItem(STORE_KEY, JSON.stringify(listings));
}

/* theme: light wheat day scheme, dark earthen night scheme */

// flip + persist; the head script already set the initial value pre-paint
const setTheme = (t) => {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("paralibazaar.theme", t);
  $("#theme-icon").textContent = t === "dark" ? "light_mode" : "dark_mode";
};

$("#theme-btn").addEventListener("click", () =>
  setTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  ),
);

setTheme(document.documentElement.dataset.theme); // sync the icon with the head choice

// show one view, hide the rest, sync the nav pills
function switchView(name) {
  document
    .querySelectorAll(".view")
    .forEach((v) => (v.hidden = v.id !== `view-${name}`));
  document
    .querySelectorAll(".nav-item")
    .forEach((n) => n.classList.toggle("is-active", n.dataset.view === name));
  window.scrollTo({ top: 0 });
}

document
  .querySelectorAll(".nav-item")
  .forEach((btn) =>
    btn.addEventListener("click", () => switchView(btn.dataset.view)),
  );

/* farmer form */

const form = $("#list-form");

form.addEventListener("submit", (e) => {
  e.preventDefault(); // no page reload, we rerender ourselves

  // FormData -> plain object in one line
  const data = Object.fromEntries(new FormData(form));

  listings.unshift({ id: "l" + Date.now(), ...data, bids: [] }); // newest first
  saveListings();
  form.reset();
  renderFeed();
  updateImpact();
  switchView("market");
  snackbar("Listing posted! Buyers can see it now.");
});

/* voice input — Gemini */

// the AQ. key from aistudio.google.com goes here, sent as x-goog-api-key header
const GEMINI_KEY = "DUMMY_KEY_PASTE_YOURS";

let recorder = null;
let recording = false;
let recordTimer = null;

$("#mic-btn").addEventListener("click", async () => {
  const mic = $("#mic-btn");
  mic.classList.toggle("listening");
  recording = !recording;

  if (recording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => (recorder.chunks ??= []).push(e.data);
      recorder.onstop = () => voiceToForm(recorder.chunks);
      recorder.start();
      recordTimer = setTimeout(() => recorder.stop(), 8000); // auto-stop
      snackbar("Listening… speak your listing, then tap again (max 8s).");
    } catch {
      recording = false;
      mic.classList.remove("listening");
      snackbar("Mic blocked — allow microphone access, or type instead.");
    }
  } else {
    clearTimeout(recordTimer);
    if (recorder && recorder.state === "recording") recorder.stop();
  }
});

// audio blob -> Gemini -> JSON -> fills the form fields
async function voiceToForm(chunks) {
  recording = false;
  $("#mic-btn").classList.remove("listening");
  snackbar("Reading your voice note…");

  const blob = new Blob(chunks, { type: "audio/webm" });
  const dataUrl = await new Promise((res) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(blob);
  });

  const prompt =
    "This is a Punjabi/Hindi farmer describing a straw listing aloud. " +
    "From the audio extract: village, field size in acres, straw quantity in tonnes, " +
    "expected price per tonne in rupees, contact phone number. " +
    'Reply ONLY with JSON like {"village":"","acres":"","tonnes":"","price":"","phone":""} ' +
    "— empty string for anything not spoken.";

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/webm",
                    data: dataUrl.split(",")[1],
                  },
                },
                { text: prompt },
              ],
            },
          ],
        }),
      },
    );
    if (!res.ok) throw new Error("API error " + res.status);
    const data = await res.json();
    const reply = data.candidates[0].content.parts[0].text;

    // model sometimes wraps JSON in markdown fences
    const parsed = JSON.parse(reply.match(/\{[\s\S]*\}/)[0]);

    for (const key of ["village", "acres", "tonnes", "price", "phone"]) {
      if (parsed[key]) document.getElementById("f-" + key).value = parsed[key];
    }
    snackbar("Fields filled from your voice — check them, then post.");
  } catch (err) {
    snackbar("Voice didn\u2019t parse — type it instead. " + err.message);
  }
}

/* buyer feed */

const deck = $("#listing-deck");

function renderFeed() {
  $("#market-count").textContent =
    `${BASE_IMPACT.listings + listings.length} active listings across Punjab`;

  const empty = listings.length === 0;
  $("#market-empty").hidden = !empty;
  deck.innerHTML = empty
    ? ""
    : listings
        .map((l, i) => {
          const hasBid = l.bids.length > 0;
          const best = hasBid
            ? Math.max(...l.bids.map((b) => Number(b.offer) || 0))
            : null;

          return `
            <article class="listing card card--elevated" style="animation-delay:${Math.min(i * 45, 400)}ms">
              <div class="listing__head">
                <span class="listing__village">${esc(l.village)}</span>
                <span class="chip ${hasBid ? "chip--bid" : "chip--open"}">
                  ${hasBid ? `Bid received · ₹${compact(best)}` : "Open"}
                </span>
              </div>
              <div class="listing__facts">
                <span><strong>${esc(l.acres)}</strong> acres</span>
                <span><strong>${esc(l.tonnes)}</strong> t straw</span>
                <span>asking <strong>₹${Number(l.price).toLocaleString("en-IN")}</strong>/t</span>
              </div>
              <div class="listing__actions">
                <a class="link-chip" href="tel:${esc(l.phone)}"><span class="material-symbols-outlined">call</span>Call</a>
                <button class="btn btn--filled" data-bid="${l.id}">Make offer</button>
              </div>
            </article>`;
        })
        .join("");

  // offer buttons only exist after innerHTML above, wire them here
  deck
    .querySelectorAll("[data-bid]")
    .forEach((btn) =>
      btn.addEventListener("click", () => openBid(btn.dataset.bid)),
    );
}

/* bid modal */

const bidDialog = $("#bid-dialog");
const bidForm = $("#bid-form");
let bidTargetId = null;

function openBid(id) {
  const l = listings.find((x) => x.id === id);
  if (!l) return;
  bidTargetId = id;
  $("#bid-target").textContent =
    `${l.village} · ${l.tonnes} t · asking ₹${Number(l.price).toLocaleString("en-IN")}/t`;
  bidForm.reset();
  bidDialog.showModal();
}

$("#bid-cancel").addEventListener("click", closeBid);
// route Esc through the same animated close
bidDialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeBid();
});

// animate out first, then close for real
function closeBid() {
  if (!bidDialog.open || bidDialog.classList.contains("closing")) return;
  bidDialog.classList.add("closing");
  setTimeout(() => {
    bidDialog.close();
    bidDialog.classList.remove("closing");
  }, 200);
}

bidForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const offer = Object.fromEntries(new FormData(bidForm));
  const l = listings.find((x) => x.id === bidTargetId);
  if (!l) return;

  l.bids.push(offer);
  saveListings();
  closeBid();
  renderFeed();
  updateImpact();
  snackbar(`Offer sent — the farmer in ${l.village} will see it.`);
});

/* impact dashboard */

// count metrics up/down instead of snapping between values
function animateValue(el, to, fmt) {
  const from = Number(el.dataset.val || 0);
  el.dataset.val = to;
  if (from === to) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min((t - t0) / 500, 1);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
    el.textContent = fmt(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function updateImpact() {
  let tonnes = 0,
    paid = 0;
  for (const l of listings) {
    const t = Number(l.tonnes) || 0;
    // best bid counts as paid, else the asking price
    const price = l.bids.length
      ? Math.max(...l.bids.map((b) => Number(b.offer) || 0))
      : Number(l.price) || 0;
    tonnes += t;
    paid += t * price;
  }

  animateValue($("#m-tonnes"), BASE_IMPACT.tonnes + tonnes, compact);
  animateValue($("#m-paid"), BASE_IMPACT.paid + paid, (n) => "₹" + compact(n));
  // ~1.27 t CO2e avoided per t straw diverted (open burning baseline)
  animateValue($("#m-co2"), BASE_IMPACT.co2 + tonnes * 1.27, compact);
  animateValue($("#m-listings"), BASE_IMPACT.listings + listings.length, (n) =>
    String(Math.round(n)),
  );
}

/* snackbar */

let snackbarTimer;
function snackbar(msg) {
  const bar = $("#snackbar");
  bar.textContent = msg;
  bar.classList.add("show");
  clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => bar.classList.remove("show"), 3000);
}

/* boot */

switchView("sell"); // farmers first
renderFeed();
updateImpact();
