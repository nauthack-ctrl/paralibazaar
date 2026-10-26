# ParaliBazaar

**Straw, not smoke.**

Every harvest, Punjab burns millions of tonnes of paddy straw — the smog everyone breathes for weeks starts at the matchstick. ParaliBazaar is a mobile web marketplace where farmers can list their leftover straw in seconds (no login, no app download) and biomass / boiler buyers find it and make offers. Straw moves to boilers instead of to the sky.

Built for hackathon with the Material 3 design system — warm wheat `#855318`, forest green `#2E6B27`, soft earthen surfaces.

## What it does

- **Sell** — a frictionless listing form: village, field size, straw quantity, price expectation, phone. Punjabi labels on every field. Voice input powered by the Gemini API: a farmer speaks in Punjabi and the fields fill themselves.
- **Market** — a live deck of straw listings with status chips (Open / Bid received) and a tap-to-call button. Buyers can place offers through a dialog.
- **Impact** — the headline numbers: tonnes diverted from burning, rupees paid to farmers, tonnes of CO₂e avoided, active listings. Every new listing moves all four.

Everything persists in `localStorage`, so state survives refreshes without any backend. Light and dark themes both ship — same earthy palette, inverted for night, switcher in the top bar.

## Stack

Plain HTML5, vanilla CSS (M3 tokens written by hand as CSS variables), clean ES6. No framework, no build step. ~70KB total.

## Run it

Open `index.html` in Chrome. That's it.

Voice input needs Gemini API key from [aistudio.google.com](https://aistudio.google.com) pasted into the `GEMINI_KEY` constant at the top of `app.js`.

## How state works

One array, one JSON blob in `localStorage` (`paralibazaar.listings.v1`):

```js
{ id, village, acres, tonnes, price, phone, bids: [{ buyer, offer, qty }] }
```

A listing's status is never stored — "Bid received" simply means `bids.length > 0`. The dashboard is a sum over the array plus a demo baseline, so posting a listing or an offer ticks the numbers up live.

## Team

Made by **Innovex** · [nauthack@gmail.com](mailto:nauthack@gmail.com) · [github.com/nauthack-ctrl](https://github.com/nauthack-ctrl)
