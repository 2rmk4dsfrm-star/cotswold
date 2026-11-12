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
| On "tight" or "won't fit" | Show the result and the problem spot; the customer decides |

## Users

- **Primary: the customer on a product page.** On their phone, at home, about to order.
- Later: sales staff and delivery planners (out of scope for v1).

## How it works

1. **Item.** Width, depth and height in cm. Typed in for now; a product page can prefill them through the link (`?name=&w=&d=&h=&upright=1`), which is the hook for the catalogue. A "must stay upright" switch covers items that cannot be turned over.
2. **Route.** The customer adds each tight spot in order: doorway, hallway, corner turn, straight stairs, stair turn / landing, lift. Each has two to five measurements and a one-line tip on how to measure it properly.
3. **Verdict.** Every step gets *Fits*, *Tight* (under 5 cm to spare) or *Won't fit*, the clearance in cm, how the item has to be carried to get through, and a small diagram of the item at the tightest point. The overall verdict is the worst step, named.

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

## Known limits of v1

- A block is slightly pessimistic for shaped items (sofa arms, legs), so some real fits will show as tight. That is the safe direction.
- Not modelled: removing legs, doors or banisters; lifting over an open banister; hooking a sofa through a doorway; curved or winder stairs; the top and bottom of a staircase (add a corner step for those).
- Only 90-degree turns.
- Centimetres only.
- The AR placement and camera tape measure have not yet been tested on physical phones.

## Success measures

- Failed deliveries due to access, per 1,000 large-item orders (primary).
- Share of large-item product page visitors who complete a check.
- Returns and damage claims attributed to access.
- Agreement between tool verdict and actual delivery outcome (needs crews to log it).

## Next steps

1. Device testing on a range of iPhones and Android phones.
2. Catalogue integration: a "Will it fit?" button on each product page that passes dimensions (packaged, and with legs removed where applicable).
3. Calibrate the 5 cm "tight" margin against real delivery outcomes.
4. Save and share a result, so it can be attached to an order and seen by the delivery crew.
5. Fix suggestions (remove legs, alternative route, smaller variant) and a specialist-delivery flag.
6. Inches, non-90-degree turns, winder stairs.
