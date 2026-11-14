# Product brief: "Will it fit?" delivery route checker

## Problem

Large, high-value furniture is delivered by two-person crews. Customers check the listed dimensions against their doorways, but not against the *turns*: a hallway corner, a stair landing, a door that opens onto a facing wall. The crew arrives, the item will not go round, and the delivery fails.

Each failed delivery costs a wasted crew visit, a return and restock, a delayed slot for other orders, possible damage to the item or the customer's home, and an unhappy customer who has already waited through a long lead time.

## Goal

Let a customer find out, before they buy, whether an item can be carried from their front door to its room, and show them exactly where it would get stuck if not.

## Decisions made

| Question | Decision |
| --- | --- |
| Platform | Web link, nothing to install |
| Who and when | The customer, before buying |
| What is checked | The full delivery route, front door to room |
| Close calls | A distinct "needs checking" verdict that sends the customer to the delivery team |
| Item handling | Checked as delivered: crews do not remove parts or lift over banisters |

## Users

- **Primary: the customer on a product page.** On their phone, at home, about to order.
- Later: sales staff and delivery planners (out of scope for v1).

## How it works

1. **Item.** Width, depth and height in cm, typed in. If the item is delivered in sections, the customer enters the largest section. A product page can prefill the item through the link (`?name=&w=&d=&h=&sections=1`), which is the hook for the catalogue.
2. **Route.** The customer adds each tight spot in order: doorway, hallway, corner turn, straight stairs, stairs with a quarter-turn landing, stairs with a half-turn landing, lift, and the room the item is going in. Each has a labelled picture showing where to measure.
3. **Verdict.** Every step gets one of three verdicts, and the overall verdict is the worst step, named:
   - **Fits**: there is a way to carry it through with room to spare.
   - **Needs checking**: too close to call. The customer is asked to contact the delivery team before ordering.
   - **Won't fit**: no way of carrying it gets through.

The tool is aimed at large rigid items (wardrobes, larders, cupboards). The item is checked exactly as delivered: a solid block, carried any way up, with nothing removed.

### What each check does

- **Doorway / hallway:** the item's cross-section against the clear opening, including on the diagonal.
- **Corner:** the item pivoted round a right-angle turn between two passage widths, tipped or stood on end if the ceiling allows.
- **Stairs:** a step-by-step simulation of the block being carried through the whole staircase: getting onto the stairs (straight on or from the side), up each flight under the ceiling, turning on a landing, and getting off at the top (straight on or with a turn). The search finds an actual collision-free sequence of positions and tilts, or reports the stage where the item gets stuck. An independent brute-force test confirms that every path it accepts is clear of walls, steps and ceilings.
- **Room:** whether a tall item carried in on its back can be tipped upright under the ceiling, and if not, whether the route lets it stay upright all the way.
- **Lift:** door opening, then the inside of the car.

### Guarding against wrong measurements

- **Measuring pictures.** Every step shows a labelled picture of exactly where to measure; the letters on the picture match the letters on the boxes underneath.
- **Sanity checks.** Numbers that look like the wrong unit (inches, millimetres, metres), swapped width and height, or an implausible size are flagged in amber, with a one-tap correction where the intended value is clear. Flags never block the verdict, but the verdict says which steps to re-check.

### Where the camera comes in

| Feature | Android (Chrome) | iPhone (Safari) |
| --- | --- | --- |
| True-size model of the item placed in the room, doorway or stairwell | Yes (WebXR) | Yes (AR Quick Look) |
| Camera tape measure: tap two points, measurement fills in | Yes (WebXR) | No; typed in from a tape measure or Apple's Measure app |
| Fit verdict | Yes | Yes |

iPhone browsers do not expose live AR measuring to websites, so the verdict is deliberately driven by measurements, not by the camera. This also makes it more trustworthy: phone AR is accurate to roughly 2-3 cm, and a tape measure is better for anything tight.

### What the fit check does

The item is treated as a solid block. For each step the engine tries every way two people could carry it (any face down, any end leading, rolled onto the diagonal of an opening, one end tipped up under the ceiling, stood on end) and keeps the most comfortable one.

- **Doorway / hallway:** the item's cross-section against the clear opening, including on the diagonal.
- **Corner / stair landing:** the item pivoted round a right-angle turn between two passage widths, limited by ceiling height when tipped or stood on end. This is the check customers cannot do with a tape measure.
- **Straight stairs:** cross-section against stair width and the headroom measured square to the slope.
- **Lift:** door opening, then the inside of the car, including corner-to-corner and leant back.

## Known limits of the prototype

- Results are only as good as the measurements typed in.
- Stairs are simplified: risers are assumed to be 20 cm, steps are treated as a ramp through their front edges, and newel posts, winder steps and curved stairs are not modelled. The "needs checking" band is wider on stairs for this reason.
- Only 90-degree turns.
- Not modelled, because crews do not do them: removing doors or parts, lifting over a banister.
- Centimetres only.
- The AR placement has been tried on one iPhone; the Android camera tape measure has not been tested on a physical phone.
- The "normal range" warnings and the size of the "needs checking" band are estimates, to be calibrated against real delivery outcomes.

## Success measures

- Failed deliveries due to access, per 1,000 large-item orders (primary).
- Share of large-item product page visitors who complete a check.
- Returns and damage claims attributed to access.
- Agreement between tool verdict and actual delivery outcome (needs crews to log it).

## Next steps

1. Device testing on a range of iPhones and Android phones.
2. Catalogue integration: a "Will it fit?" button on each product page that passes dimensions (packaged, and with legs removed where applicable).
3. Calibrate the "needs checking" band against real delivery outcomes.
4. Save and share a result, so it can be attached to an order and seen by the delivery crew.
5. Fix suggestions (remove legs, alternative route, smaller variant) and a specialist-delivery flag.
6. Inches, non-90-degree turns, winder stairs.
