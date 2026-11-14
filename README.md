# Will it fit?

A mobile web tool that checks whether a piece of furniture can be carried along a delivery route (doorways, hallways, corner turns, staircases, lifts, and standing it up in the room) and shows the item at true size in AR.

See [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md) for the product brief.

## Run

```
npm install
npm run dev      # local dev server
npm test         # fit engine tests
npm run build    # static site in dist/, host anywhere over HTTPS
```

Camera and AR features need HTTPS (or localhost) and a phone.

## Prefill from a product page

```
/?name=Double%20wardrobe&w=120&d=60&h=200
```

Dimensions are in cm.

## Layout

- `src/fit/engine.ts` — the fit calculations; no UI dependencies, so it can be reused server-side or in a native app.
- `src/fit/stairs.ts` — the staircase simulation (floor plan, heights, and the search for a collision-free carry).
- `src/fit/sanity.ts` — warnings for measurements that look wrong.
- `src/app.tsx` — the interface.
- `src/ar/preview.ts` — true-size AR model (WebXR on Android, AR Quick Look on iPhone).
- `src/ar/measure.ts` — camera tape measure (WebXR browsers only).
