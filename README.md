# Will it fit?

A mobile web tool that checks whether a piece of furniture can be carried along a delivery route (doorways, hallways, corner turns, stairs, landings, lifts) and shows the item at true size in AR.

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
/?name=Three-seater%20sofa&w=220&d=95&h=85&upright=0
```

Dimensions are in cm.

## Layout

- `src/fit/engine.ts` — the fit calculations; no UI dependencies, so it can be reused server-side or in a native app.
- `src/app.tsx` — the interface.
- `src/ar/preview.ts` — true-size AR model (WebXR on Android, AR Quick Look on iPhone).
- `src/ar/measure.ts` — camera tape measure (WebXR browsers only).
