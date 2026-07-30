# Batch/Pool Order System — Design Document

## Overview

PNUT MONSTER serves university campuses where individual delivery is expensive and inefficient. The batch/pool system solves this by collecting orders during a timed window, preparing them in bulk, and distributing via block representatives — eliminating per-order delivery costs for customers and reducing operational overhead for the outlet.

### The Problem

- Individual delivery to scattered university locations is costly.
- Small individual orders don't justify dedicated delivery runs.
- Kitchen efficiency drops when preparing one order at a time.
- Customers pay high delivery fees that discourage ordering.

### The Solution

Pool orders from an entire campus into a single batch window. When the window closes:
1. The kitchen gets one aggregated prep sheet (not 50 individual tickets).
2. Parcels are labeled, sorted by block, and handed to local representatives.
3. Reps deliver within their own building — zero logistics overhead.
4. Customers pay little or no delivery fee.

---

## System Architecture

### How It Fits Into the Existing Platform

The batch system operates as a **mode** on top of the existing outlet/order infrastructure:

- Batch orders use the same `orders` and `order_items` tables with a `batch_window_id` foreign key.
- The existing cart, menu, customization, payment (wallet/Razorpay/split), and checkout flows remain unchanged.
- The batch layer adds: window management, slot reservation, block selection at checkout, PDF generation, rep assignment, and rep delivery tracking.
- An outlet can operate in **normal mode** (immediate individual orders) and **batch mode** simultaneously — batch orders are distinguished by their window association.

### New Surfaces

| Surface | Users | Purpose |
|---------|-------|---------|
| Customer home (enhanced) | All customers | Live monster counter, batch window status |
| Customer checkout (enhanced) | Batch customers | Block/sub-location selection, batch delivery perk |
| Outlet manager panel (enhanced) | Outlet managers | Window creation, prep sheet, labels, rep management |
| Admin panel (enhanced) | Admins | Hub/block configuration, batch settings, analytics |
| **Representative panel (new)** | Block reps | Assigned orders, QR delivery scan, commission ledger |

---

## 1. Batch Window Configuration

### Window Properties

| Property | Description |
|----------|-------------|
| Outlet | Which outlet this window belongs to |
| Start time | When the window opens for orders |
| End time | When the window stops accepting orders |
| Max orders | Maximum number of orders before auto-close |
| Counter display mode | "exact" (shows numbers) or "urgency" (vague text) |
| Counter visual style | "animated" (monster changes) or "static" (icon + text) |
| Delivery fee | The reduced/zero delivery charge for batch orders |
| Hub | Which delivery hub/location this window serves |
| Status | scheduled → open → closed → processing → fulfilled |

### Rules

- **One active window per outlet**: An outlet cannot have two windows in `open` status simultaneously.
- **Concurrent across outlets**: Multiple outlets can each have their own active window at the same time.
- **Flexible creation**: Admin or outlet manager can create windows at any time.
- **No customer cancellation**: Once placed, a batch order is final. The slot cannot be freed.
- **Auto-close triggers**: Window closes when either `end_time` is reached OR `max_orders` cap is hit — whichever comes first.
- **Manual close**: Outlet manager or admin can force-close a window early (e.g., ingredient shortage).
- **Minimum orders**: Optional minimum threshold — if not met by end time, the outlet manager decides whether to proceed or cancel the batch (with full refunds).

### Window Lifecycle (State Machine)

```
scheduled ──[start_time reached]──→ open
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                  │
          [end_time reached]   [cap hit]        [manual close]
                    │                 │                  │
                    └─────────────────┼─────────────────┘
                                      │
                                      ▼
                                   closed
                                      │
                          [PDFs generated, orders
                           distributed to reps]
                                      │
                                      ▼
                                 processing
                                      │
                          [all orders delivered
                           by reps / manager marks done]
                                      │
                                      ▼
                                  fulfilled
```

### Who Can Do What

| Action | Admin | Outlet Manager |
|--------|-------|----------------|
| Create window for any outlet | Yes | No |
| Create window for own outlet | Yes | Yes |
| Edit window (before open) | Yes | Yes (own) |
| Manual close | Yes | Yes (own) |
| Cancel batch (refund all) | Yes | Yes (own) |
| View all windows | Yes | No |
| View own outlet windows | Yes | Yes |

---

## 2. Live "Monster" Counter (Customer-Facing)

### Purpose

Create urgency and social proof — "others are ordering, don't miss out." The counter is the batch system's primary customer-facing hook.

### Display Modes

**Exact numbers** (admin selects per window):
- "12 slots left — order now!"
- "Last 3 spots!"
- "1 slot remaining!"
- At cap: "Sold out! Come back tomorrow."

**Vague urgency** (admin selects per window):
- 0–30% full: "Window open — order now!"
- 30–60% full: "Filling up!"
- 60–85% full: "Almost full — hurry!"
- 85–99% full: "Last few spots!"
- At cap: "Sold out! Come back tomorrow."

### Visual Styles

**Animated monster**:
- The monster character visually changes as the batch fills.
- Could get fatter, change color (green → yellow → orange → red), show items piling up, etc.
- Specific animation states tied to fill percentage thresholds.

**Static icon + text**:
- Consistent monster icon/illustration.
- Only the accompanying text/number updates.
- Simpler to implement, less engaging.

### Placement & Visibility

- **Home page**: Prominent banner/card visible to all users when any batch window is active.
- Shows: outlet name, monster counter, time remaining (optional), and a CTA to order.
- If multiple outlets have active windows, show all of them (carousel or stacked cards).
- Tapping the banner navigates to that outlet's menu in batch context.

### Closed Window State

When no batch window is active for an outlet:
- The banner shows: "Window closed! Next batch: Tomorrow at 9:30 AM" (or whatever the next scheduled time is).
- If no next window is scheduled: "No upcoming batch — order individually anytime."
- Individual ordering remains available at all times with standard (higher) delivery charges.
- The higher delivery charge for individual orders is **not** framed as a penalty — it's simply the normal rate. The batch rate is framed as the **discount/perk**.

### Real-Time Updates

- Counter updates via **Supabase Realtime** subscription on the batch window's `current_order_count`.
- All connected clients see the counter move within ~1 second of a new order.
- No polling fallback needed for the counter (Realtime is reliable for single-row changes).

### Slot Reservation (Race Condition Prevention)

- When a customer completes checkout, the slot is claimed via an **atomic RPC** (`claim_batch_slot`).
- The RPC increments `current_order_count` and checks against `max_orders` in a single transaction.
- If the slot is already gone (cap hit between page load and checkout), the customer gets a clear error: "Sorry, this batch just filled up!" with an option to place an individual order instead.
- The order is only created if the slot claim succeeds.

---

## 3. Payment & Pricing

### Payment Flow

- **Identical to existing flow**: Cart → Checkout → Pay (wallet / Razorpay / split) → Confirmation.
- Payment happens **immediately** at order placement — no deferred/COD option for batch orders.
- Since there is no customer cancellation, payment is final once confirmed.

### Batch Delivery Perk

- Batch orders have **reduced or zero delivery charges** compared to individual orders.
- The delivery fee for the batch is configured per window (can be 0, or a small flat fee).
- This perk is shown **explicitly** to the customer during checkout:
  - "Batch delivery: FREE" or "Batch delivery: Rs 10" (vs. individual rate of Rs 50+).
  - Framed as a benefit of ordering in the batch window, not as individual orders being penalized.

### What Happens If Batch Gets Cancelled

- If the outlet manager cancels a batch (e.g., minimum orders not met, emergency):
  - All orders in the batch are refunded to the customer's **wallet** (instant).
  - Customers receive a notification: "Your batch order has been cancelled and refunded to your wallet."
  - No partial fulfillment — it's all or nothing per batch.

### Pricing Unchanged

- Menu item prices, customization charges, tax, packaging — all remain the same as individual orders.
- Only the delivery component changes.
- Coupons/loyalty/wallet — all existing payment features work on batch orders.

---

## 4. Kitchen Prep Sheet (Aggregated PDF)

### Purpose

Instead of the outlet receiving 47 individual order tickets, they get one consolidated prep sheet that tells them exactly what to make in bulk — like a factory production run.

### Component Mapping (Setup Required)

Before the prep sheet can work, the outlet manager must configure **item-to-component breakdowns**:

| Menu Item + Customization | Components |
|---------------------------|------------|
| Chipotle Maida Wrap | 1x maida bread, 1x chipotle sauce (15ml), 1x lettuce (30g), 1x paneer filling (80g) |
| Chipotle Multigrain Wrap | 1x multigrain bread, 1x chipotle sauce (15ml), 1x lettuce (30g), 1x paneer filling (80g) |
| Peanut Chicken Wrap (Maida) | 1x maida bread, 1x peanut sauce (20ml), 1x chicken filling (100g), 1x onion (20g) |

This mapping is done once per item in the restaurant/admin panel and only needs updating when the menu changes.

### Component Categories

Components are grouped into **prep categories** for logical kitchen workflow:

- **Base/Bread** — things to heat/toast
- **Sauce** — things to apply/spread
- **Filling** — proteins and main ingredients
- **Toppings** — garnishes, extras
- **Sides** — separate items (drinks, extras)
- **Packaging** — boxes, bags, containers needed

Categories are configurable by the outlet manager.

### Aggregation Logic

When a batch window closes:

1. Collect all `order_items` linked to this batch window.
2. For each order item, look up its component mapping (considering selected customizations).
3. Sum all components across all orders.
4. Group by prep category.
5. Sort within each category by quantity (highest first — prep the bulk items first).
6. Generate formatted instructions.

### Prep Sheet Output Example

```
┌─────────────────────────────────────────────────────────────────┐
│  PNUT MONSTER — BATCH PREP SHEET                                │
│  Window: 9:30 AM – 11:30 AM | 30 July 2026                     │
│  Outlet: University Hub                                          │
│  Total Orders: 47 | Total Items: 63                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ── BASE/BREAD ──────────────────────────────────────────────    │
│  • Heat 38 maida breads                                          │
│  • Heat 17 multigrain breads                                     │
│  • Toast 8 sourdough slices                                      │
│                                                                   │
│  ── SAUCE ────────────────────────────────────────────────────   │
│  • Chipotle sauce: 28 portions (apply to 20 maida, 8 multi)     │
│  • Peanut sauce: 19 portions (apply to 12 maida, 7 multi)       │
│  • Mayo: 9 portions (apply to 5 maida, 4 sourdough)             │
│                                                                   │
│  ── FILLING ──────────────────────────────────────────────────   │
│  • Paneer filling: 31 portions                                    │
│  • Chicken filling: 24 portions                                   │
│  • Egg filling: 8 portions                                        │
│                                                                   │
│  ── TOPPINGS ─────────────────────────────────────────────────   │
│  • Lettuce: 47 portions                                           │
│  • Onion rings: 32 portions                                       │
│  • Jalapenos: 14 portions                                         │
│                                                                   │
│  ── SIDES ────────────────────────────────────────────────────   │
│  • Cold coffee (regular): 12                                      │
│  • Lemonade: 8                                                    │
│  • Cookie: 5                                                      │
│                                                                   │
│  ── PACKAGING ────────────────────────────────────────────────   │
│  • Wrap boxes: 63                                                 │
│  • Drink cups (large): 12                                         │
│  • Drink cups (regular): 8                                        │
│  • Paper bags (medium): 47                                        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Instruction Templates (Configurable)

Outlet managers can define instruction templates per component category:

- Default: `"{action} {quantity} {component_name}"`
- Custom: `"Heat {quantity} {component_name} on tawa for 30 seconds each side"`

Templates support variables: `{quantity}`, `{component_name}`, `{unit}`, `{target_items}` (which menu items this goes into).

### Format & Access

- Generated as a **printable PDF** (clean, high-contrast, large text for kitchen readability).
- Available in the outlet manager's panel immediately after the window closes.
- Can be regenerated if needed (e.g., if component mappings were wrong).
- Option to download or print directly from the panel.

---

## 5. Parcel Labels (Mini Receipts)

### Purpose

Each order gets a physical label attached to its parcel for identification during sorting, handoff to reps, and final delivery to the customer.

### Label Content

```
┌──────────────────────────────────┐
│  PNUT MONSTER                    │
│  Batch: 30 Jul 9:30 AM          │
│  ─────────────────────────────── │
│  Order #PM-4721                  │
│  Rahul Sharma | 98765-43210     │
│  ─────────────────────────────── │
│  1x Chipotle Maida Wrap         │
│    + extra cheese                │
│  1x Cold Coffee (L)             │
│  ─────────────────────────────── │
│  Block: Engineering Building     │
│  Sub: Floor 2, Room 205         │
│  ─────────────────────────────── │
│  Notes: "No onions please"      │
│  ─────────────────────────────── │
│  Rep: Amit K. (#3 of 8)        │
│  ─────────────────────────────── │
│  [████ QR CODE ████]            │
│  [████          ████]            │
│  [████          ████]            │
│  [████████████████████]          │
└──────────────────────────────────┘
```

### Label Fields

| Field | Source |
|-------|--------|
| Order number | Generated order ID |
| Customer name | Profile full name |
| Phone number | Profile phone |
| Items list | Order items with customizations |
| Block/location | Selected at checkout |
| Sub-location | Optional, selected at checkout |
| Special notes | Order notes from cart |
| Rep name + order count | Auto-assigned rep, their position in sequence (e.g., "#3 of 8") |
| QR code | Encodes order ID — rep scans to confirm delivery |

### Format Options (admin configures per outlet)

**Thermal printer (80mm roll)**:
- One label per receipt.
- Optimized for standard 80mm POS thermal printers.
- Sequential printing — one after another on the roll.

**A4 sheet**:
- Multiple labels per page (2x4 grid = 8 labels per A4 sheet).
- Designed for cutting with scissors or using pre-cut label paper.
- More economical if thermal printer is not available.

### Generation & Sorting

- Generated as a **single PDF** after the batch window closes.
- Labels within the PDF are **sorted by block**, then by **rep assignment** within each block.
- This means: all labels for Block A / Rep 1 are together, then Block A / Rep 2, then Block B / Rep 1, etc.
- Outlet manager prints, cuts (if A4), and stacks by rep — ready for handoff.

### QR Code Content

- Encodes: `{ order_id, batch_window_id, rep_id }` as a signed token.
- Signed to prevent reps from fabricating delivery confirmations.
- Rep's app scans → validates signature → marks order as delivered.

---

## 6. University Block / Location System

### Hierarchy

```
Hub (University / Campus)
 └── Block (Building / Department)
      └── Sub-location (Floor / Room / Lab / Wing)
```

### Examples

```
Chandigarh University
 ├── Engineering Block
 │    ├── Floor 1
 │    ├── Floor 2
 │    └── Floor 3
 ├── Management Block
 │    ├── Wing A
 │    └── Wing B
 ├── Science Building
 │    ├── Chemistry Lab
 │    ├── Physics Lab
 │    └── Ground Floor Canteen Area
 ├── Library
 └── Hostel Block C
      ├── Floor 1
      ├── Floor 2
      └── Floor 3
```

### Configuration

| Action | Admin | Outlet Manager |
|--------|-------|----------------|
| Create/edit/delete hubs | Yes | No |
| Create/edit/delete blocks within any hub | Yes | No |
| Create/edit/delete blocks within own outlet's hub | Yes | Yes |
| Create/edit/delete sub-locations | Yes | Yes (own hub) |
| Assign hub to outlet | Yes | No |
| Activate/deactivate blocks | Yes | Yes (own) |
| Reorder blocks (display order) | Yes | Yes (own) |

### Hub-Outlet Relationship

- A hub is a **shared location entity** (e.g., "Chandigarh University").
- Multiple outlets can be linked to the same hub.
- All outlets sharing a hub use the same block/sub-location structure.
- Reps are assigned per block per outlet (not globally to the hub).

### Customer Checkout Integration

At checkout, when the order is part of a batch:

1. **Block dropdown** (required): Shows all active blocks for the outlet's hub.
2. **Sub-location dropdown/text** (optional): Shows sub-locations for the selected block, or free-text if none configured.
3. **Delivery address** (optional): Free-text field for any additional instructions ("Near the staircase on 2nd floor").

These fields replace the standard delivery address for batch orders (since delivery is to a known campus, not arbitrary locations).

---

## 7. Representative Panel

### Role Definition

A representative (rep) is a person assigned to a specific block who handles last-mile delivery within that block. They are typically students or staff who earn a commission for this work.

### Access & Authentication

- Reps get **pre-configured credentials** (email/password) created by the admin or outlet manager.
- Their account is linked to a specific **block** and **outlet**.
- On login, they land directly in their block's panel — no outlet/block selection needed.
- A rep cannot access other blocks or other outlets.

### How Orders Reach Reps

1. Batch window closes.
2. System collects all orders for each block.
3. Within each block, orders are **auto-distributed evenly** among active reps.
4. Distribution algorithm:
   - Sort orders by sub-location (cluster nearby deliveries).
   - Round-robin assign to reps, keeping sub-location clusters together when possible.
   - Result: each rep gets roughly equal count, with geographically logical grouping.
5. Outlet manager sees the assignment breakdown and packs accordingly.
6. Each rep's parcel group is physically bundled together at the outlet.

### Rep Panel Screens

**Dashboard (after login)**:
- Current/latest batch status
- Number of assigned orders
- Number delivered vs. pending
- Quick stats: today's earnings, total lifetime earnings

**Order List**:
- All assigned orders for the current batch
- Each order shows: customer name, items summary, sub-location, phone
- Status: pending delivery / delivered
- Tap to expand full details
- "Scan to deliver" button

**QR Scanner**:
- Opens device camera
- Scans parcel QR code
- Validates and marks order as delivered
- Shows confirmation with customer name and order number
- Cannot scan orders not assigned to this rep

**Wallet/Ledger**:
- Commission balance (cumulative, not withdrawable in-app)
- Transaction history: date, batch, orders delivered, amount earned
- Per-batch breakdown
- Monthly/weekly summary

**Delivery History**:
- Past batches: date, orders count, earnings
- Tap to expand individual orders within a past batch

### Rep Management (Admin/Outlet Manager Side)

- Create rep accounts (name, email, phone, assigned block, commission rate)
- Activate/deactivate reps
- Reassign rep to different block
- View rep performance (delivery rate, complaints, batches served)
- Adjust commission rate per rep or per block

### Commission Structure

Admin configures per outlet or per block:

| Model | Example | When to use |
|-------|---------|-------------|
| Flat per order | Rs 5 per order delivered | Simple, predictable |
| Percentage of order value | 3% of order total | Higher value orders = higher pay |
| Flat per batch | Rs 100 per batch regardless of count | Fixed cost, simple |

- Commission is **credited to the rep's ledger** after they scan-confirm delivery.
- Settlement happens **externally** — the ledger is a record for both parties to reference.
- Admin/outlet manager can view total payable per rep per period for settlement.

---

## Detailed Flow: Customer Journey

### When a Batch Window Is Active

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  1. DISCOVER                                                  │
│     • User opens app                                          │
│     • Home page shows monster counter banner:                 │
│       "University Hub batch open! 🟢 12 slots left"          │
│       [Order Now →]                                          │
│                                                               │
│  2. BROWSE                                                    │
│     • Taps banner → enters outlet's menu                     │
│     • Menu browsing is identical to normal flow               │
│     • Cart badge visible, items added normally                │
│     • Small indicator: "This is a batch order"               │
│                                                               │
│  3. CART                                                      │
│     • Reviews items (same as normal)                          │
│     • Sees delivery fee: "FREE (batch perk)" or reduced      │
│     • Coupon/notes work as usual                             │
│                                                               │
│  4. CHECKOUT                                                  │
│     • NEW: Block selection dropdown (required)                │
│     • NEW: Sub-location dropdown/text (optional)             │
│     • Payment summary shows batch delivery savings            │
│     • Pays via wallet/Razorpay/split                         │
│     • Slot is atomically reserved on payment success          │
│                                                               │
│  5. CONFIRMATION                                              │
│     • "Order placed! Your batch order will be delivered       │
│       to [Block Name] after the window closes."              │
│     • Shows estimated delivery window (after batch close)     │
│     • Monster counter updates globally for all users          │
│                                                               │
│  6. WAITING                                                   │
│     • Order appears in /orders with status "Batch Pending"    │
│     • No live tracking (unlike individual orders)             │
│     • Status updates: Batch Pending → Preparing → Out for    │
│       Delivery → Delivered                                    │
│                                                               │
│  7. DELIVERY                                                  │
│     • Rep delivers to block                                   │
│     • Customer may get notification: "Your order is being     │
│       delivered to [Block]!"                                  │
│     • Final notification when rep scans QR: "Delivered!"      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### When No Batch Window Is Active

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  • Home page shows: "Next batch: Tomorrow at 9:30 AM"        │
│    or "No upcoming batch — order individually anytime"        │
│  • User can still order from the outlet normally              │
│  • Normal checkout flow (no block selection)                  │
│  • Standard delivery charges apply (higher)                   │
│  • No monster counter visible                                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Edge Case: Slot Fills During Checkout

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  • User is on checkout page, clicks "Pay"                    │
│  • Slot claim RPC runs → FAILS (cap already hit)            │
│  • User sees: "Sorry, this batch just filled up!"            │
│  • Options presented:                                         │
│    [Place individual order (delivery: Rs 49)] [Go back]      │
│  • Cart is preserved — user doesn't lose their items         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Flow: Outlet Manager Journey

### Setting Up a Batch Window

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  1. Navigate to Batch Windows section in restaurant panel     │
│  2. Tap "Create New Window"                                   │
│  3. Configure:                                                │
│     • Date: [Today / Tomorrow / Pick date]                   │
│     • Start time: [9:30 AM]                                  │
│     • End time: [11:30 AM]                                   │
│     • Max orders: [50]                                       │
│     • Delivery fee: [Rs 0 / Rs 10 / custom]                 │
│     • Counter mode: [Exact numbers / Vague urgency]          │
│     • Counter style: [Animated / Static]                     │
│     • Min orders (optional): [10]                            │
│  4. Save → Window is in "scheduled" status                   │
│  5. Window auto-opens at start time                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### During Active Window

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  • Live dashboard showing:                                    │
│    - Current order count / max                               │
│    - Time remaining                                           │
│    - Revenue so far                                           │
│    - Orders by block breakdown                               │
│  • Can manually close early if needed                        │
│  • Cannot edit window settings while open                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### After Window Closes

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  1. WINDOW CLOSES (auto or manual)                           │
│     • Status moves to "closed"                               │
│     • No more orders accepted                                │
│                                                               │
│  2. SYSTEM GENERATES (automatic)                             │
│     • Kitchen prep sheet PDF                                  │
│     • Parcel labels PDF (sorted by block → rep)              │
│     • Rep order assignments                                   │
│                                                               │
│  3. MANAGER ACTIONS                                           │
│     • Downloads/prints prep sheet                            │
│     • Downloads/prints parcel labels                          │
│     • Views assignment breakdown:                            │
│       "Block A: 12 orders (Amit: 6, Priya: 6)"             │
│       "Block B: 8 orders (Raj: 4, Sneha: 4)"               │
│     • Starts bulk food preparation                           │
│     • Status moves to "processing"                           │
│                                                               │
│  4. PACKING                                                   │
│     • Prepares orders, attaches labels                       │
│     • Groups parcels by rep assignment                        │
│     • Each rep's bundle is clearly separated                 │
│                                                               │
│  5. HANDOFF                                                   │
│     • Reps arrive at outlet                                  │
│     • Each rep picks up their labeled bundle                 │
│     • Manager confirms handoff in panel                      │
│                                                               │
│  6. MONITORING                                                │
│     • Manager sees delivery progress:                        │
│       "Block A: 10/12 delivered"                             │
│       "Block B: 8/8 delivered ✓"                             │
│     • When all delivered → batch status: "fulfilled"         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Flow: Representative Journey

### Daily Flow

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  1. LOGIN                                                     │
│     • Rep opens app, logs in with their credentials          │
│     • Lands on their block's dashboard automatically          │
│                                                               │
│  2. WAIT FOR ASSIGNMENT                                       │
│     • Dashboard shows: "No active batch" or                  │
│       "Batch closing at 11:30 AM — assignments coming soon"  │
│     • Gets push notification when assignments are ready      │
│                                                               │
│  3. VIEW ASSIGNMENTS                                          │
│     • Sees: "You have 6 deliveries for today's batch"        │
│     • List of orders with:                                    │
│       - Customer name                                         │
│       - Items summary                                         │
│       - Sub-location (Floor 2, Room 205)                     │
│       - Phone number (tap to call)                           │
│                                                               │
│  4. PICKUP FROM OUTLET                                        │
│     • Goes to outlet                                         │
│     • Collects their labeled bundle                          │
│     • Verifies count matches their assignment                │
│                                                               │
│  5. DELIVER                                                   │
│     • Goes to their block                                    │
│     • For each delivery:                                      │
│       a. Find the customer (sub-location + phone)            │
│       b. Hand over parcel                                     │
│       c. Scan QR code on parcel label                        │
│       d. App confirms: "Delivered to Rahul ✓"               │
│     • Progress updates: "4/6 delivered"                      │
│                                                               │
│  6. COMPLETION                                                │
│     • All orders delivered                                    │
│     • Dashboard shows: "All done! Rs 30 earned today"        │
│     • Commission credited to ledger                          │
│                                                               │
│  7. EDGE CASE: Customer unreachable                          │
│     • Rep taps "Can't deliver" on an order                   │
│     • Options: "Customer not responding" / "Wrong location"  │
│     • Order flagged for outlet manager to resolve            │
│     • Rep continues with remaining deliveries                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Flow: Admin Journey

### System Configuration (One-Time Setup)

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  1. Create Hub: "Chandigarh University"                      │
│  2. Add Blocks:                                               │
│     • Engineering Block                                       │
│     • Management Block                                        │
│     • Science Building                                        │
│     • Library                                                 │
│     • Hostel Block C                                         │
│  3. Add Sub-locations per block:                             │
│     • Engineering Block → Floor 1, Floor 2, Floor 3          │
│  4. Link outlets to hub                                      │
│  5. Configure batch settings:                                │
│     • Default delivery fee for batch: Rs 0                   │
│     • Default max orders: 50                                 │
│     • Commission model: Rs 5 per order                       │
│     • Label format: Thermal                                  │
│  6. Create rep accounts per block                            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Ongoing Operations

- View all active/past batch windows across outlets
- Monitor fill rates, revenue, delivery completion rates
- Manage reps: create, deactivate, adjust commissions
- Handle escalations (undelivered orders, customer complaints)
- Settle rep commissions externally using ledger data

---

## Batch Order Statuses (Customer-Facing)

| Status | Meaning | When |
|--------|---------|------|
| Batch Pending | Order placed, waiting for window to close | After payment, before window closes |
| Preparing | Kitchen is making the batch | After window closes, outlet starts prep |
| Out for Delivery | Parcel handed to rep | After outlet hands off to rep |
| Delivered | Rep scanned QR, confirmed delivery | Rep marks delivered |

These map to the existing `orders` status field but with batch-specific labels in the UI.

---

## Notifications

### Customer Receives

| Event | Notification |
|-------|--------------|
| Order placed in batch | "Order confirmed! Your batch delivery will arrive after the window closes." |
| Batch window closes | "Your batch is being prepared! Estimated delivery: 12:30 PM" |
| Out for delivery | "Your order is on its way to [Block Name]!" |
| Delivered | "Your order has been delivered! Enjoy your meal." |
| Batch cancelled (rare) | "Your batch order has been cancelled. Full refund added to your wallet." |

### Rep Receives

| Event | Notification |
|-------|--------------|
| Assignments ready | "You have 6 deliveries for today's batch. Pick up from [Outlet]." |
| Customer unreachable resolved | "Order #4721 resolved — [action taken by manager]." |

### Outlet Manager Receives

| Event | Notification |
|-------|--------------|
| Window opened | "Batch window is now live." |
| Cap hit / window closed | "Batch window closed. 47 orders received. Prep sheet ready." |
| All deliveries complete | "All orders in batch delivered successfully." |
| Undeliverable order flagged | "Rep [Name] flagged order #4721 as undeliverable." |

---

## Data Model (New Tables)

### `delivery_hubs`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Hub name (e.g., "Chandigarh University") |
| address | text | Full address |
| is_active | boolean | Whether hub is accepting batches |
| created_at | timestamptz | Creation timestamp |

### `delivery_blocks`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| hub_id | uuid | FK → delivery_hubs |
| name | text | Block name (e.g., "Engineering Building") |
| display_order | int | Sort order in dropdown |
| is_active | boolean | Whether block is shown to customers |
| created_at | timestamptz | Creation timestamp |

### `delivery_sub_locations`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| block_id | uuid | FK → delivery_blocks |
| name | text | Sub-location name (e.g., "Floor 2") |
| display_order | int | Sort order |
| is_active | boolean | Active status |

### `batch_windows`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| outlet_id | uuid | FK → outlets |
| hub_id | uuid | FK → delivery_hubs |
| start_time | timestamptz | When window opens |
| end_time | timestamptz | When window auto-closes |
| max_orders | int | Order cap |
| current_order_count | int | Live counter (atomically updated) |
| min_orders | int | Optional minimum threshold |
| delivery_fee | numeric | Batch delivery charge |
| counter_display_mode | text | 'exact' or 'urgency' |
| counter_visual_style | text | 'animated' or 'static' |
| status | text | scheduled / open / closed / processing / fulfilled / cancelled |
| closed_at | timestamptz | Actual close time |
| created_by | uuid | FK → profiles (admin or outlet manager) |
| created_at | timestamptz | Creation timestamp |

### `batch_orders`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| batch_window_id | uuid | FK → batch_windows |
| order_id | uuid | FK → orders |
| block_id | uuid | FK → delivery_blocks |
| sub_location_id | uuid | FK → delivery_sub_locations (nullable) |
| sub_location_text | text | Free-text sub-location (nullable) |
| rep_id | uuid | FK → representatives (assigned after window close) |
| delivery_status | text | pending / out_for_delivery / delivered / undeliverable |
| delivered_at | timestamptz | When rep scanned QR |
| created_at | timestamptz | When order was placed |

### `representatives`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK → auth.users |
| outlet_id | uuid | FK → outlets |
| block_id | uuid | FK → delivery_blocks |
| name | text | Display name |
| phone | text | Contact phone |
| commission_type | text | 'flat_per_order' / 'percentage' / 'flat_per_batch' |
| commission_value | numeric | Amount or percentage |
| is_active | boolean | Whether rep is accepting assignments |
| created_at | timestamptz | Creation timestamp |

### `rep_commission_ledger`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| rep_id | uuid | FK → representatives |
| batch_window_id | uuid | FK → batch_windows |
| orders_delivered | int | Count of orders delivered in this batch |
| amount_earned | numeric | Calculated commission for this batch |
| settled | boolean | Whether externally settled |
| settled_at | timestamptz | When settlement was recorded |
| created_at | timestamptz | When commission was credited |

### `item_components`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| menu_item_id | uuid | FK → menu_items |
| customization_option_id | uuid | FK → customization_options (nullable — null means base item) |
| component_name | text | Raw ingredient name (e.g., "maida bread") |
| component_category | text | Prep category (e.g., "base", "sauce", "filling") |
| quantity | numeric | Amount per single order item |
| unit | text | Unit of measure (e.g., "piece", "ml", "g") |
| prep_instruction_template | text | Optional custom instruction template |
| display_order | int | Sort order within category |

### `outlet_hub_links`
| Column | Type | Description |
|--------|------|-------------|
| outlet_id | uuid | FK → outlets |
| hub_id | uuid | FK → delivery_hubs |
| PRIMARY KEY | (outlet_id, hub_id) | Composite |

---

## Key RPCs (New Functions)

| RPC | Purpose | Who calls |
|-----|---------|-----------|
| `claim_batch_slot` | Atomically increment counter, fail if at cap, create batch_order | Customer checkout |
| `close_batch_window` | Transition window to closed, trigger assignment | System/manager |
| `distribute_batch_orders` | Auto-assign orders to reps within each block | System (on close) |
| `generate_prep_sheet_data` | Aggregate item components for PDF generation | Outlet manager panel |
| `confirm_batch_delivery` | Rep scans QR → mark delivered, credit commission | Rep panel |
| `cancel_batch_window` | Cancel window, refund all orders to wallets | Admin/manager |
| `flag_undeliverable` | Rep marks order as undeliverable with reason | Rep panel |

---

## PDF Generation

### Technology

- Server-side PDF generation via API route.
- Libraries: `@react-pdf/renderer` or `pdfkit` for Node.js PDF creation.
- QR codes: `qrcode` library to generate QR as data URL, embedded in label PDF.

### Endpoints

| Route | Purpose |
|-------|---------|
| `GET /api/batch/[windowId]/prep-sheet` | Generate and return prep sheet PDF |
| `GET /api/batch/[windowId]/labels` | Generate and return labels PDF |
| `GET /api/batch/[windowId]/labels?format=thermal` | Thermal format labels |
| `GET /api/batch/[windowId]/labels?format=a4` | A4 grid format labels |

### Security

- Only accessible by the outlet manager of that outlet or admin.
- Validates that the batch window is in `closed` or later status.
- QR tokens are signed with a server secret to prevent forgery.

---

## Integration with Existing Systems

### Orders Table

- Existing `orders` table gains an optional `batch_window_id` column.
- Batch orders flow through the same `place_order_with_wallet` RPC with the batch context.
- Order status transitions are adapted for batch flow (no immediate "preparing" — waits for window close).

### Wallet/Payment

- Payment at order time — no changes to wallet/Razorpay flow.
- Batch cancellation refunds use existing `wallet_transactions` with a new type: `batch_refund`.

### Loyalty/Coupons

- All loyalty points, coupon discounts, and nth-order logic works on batch orders identically.
- Points are awarded at order placement (not delivery).

### Realtime

- Monster counter: Realtime subscription on `batch_windows.current_order_count`.
- Rep panel: Realtime subscription on `batch_orders` for delivery progress.
- Manager panel: Realtime on batch window + batch_orders for live monitoring.

### Notifications

- Uses existing `notifications` table and push infrastructure.
- New notification types: `batch_preparing`, `batch_out_for_delivery`, `batch_delivered`, `batch_cancelled`.

---

## Suggested Implementation Phases

### Phase 1 — Core Batch Flow (MVP)

**Goal**: Customers can order in batch windows, outlet gets prep sheet and labels.

- `delivery_hubs`, `delivery_blocks`, `delivery_sub_locations` tables + admin CRUD
- `batch_windows` table + outlet manager create/close flow
- `batch_orders` table + `claim_batch_slot` RPC
- Monster counter on customer home page (static style, exact numbers only)
- Block selection in checkout
- Basic prep sheet PDF (item-level aggregation, not component-level)
- Basic parcel label PDF (thermal format only)
- Batch order status flow in customer /orders

### Phase 2 — Representatives

**Goal**: Reps can log in, see assignments, and confirm deliveries.

- `representatives` table + admin/manager CRUD
- `rep_commission_ledger` table
- `distribute_batch_orders` RPC (auto-assignment on window close)
- Rep panel: login, dashboard, order list, QR scanner, delivery confirmation
- Manager view: rep assignment breakdown, delivery progress monitoring
- Customer notifications for delivery status

### Phase 3 — Advanced Kitchen & Counter

**Goal**: Full component-level prep instructions and animated counter.

- `item_components` table + outlet manager mapping UI
- Component-level aggregation in prep sheet
- Configurable instruction templates
- Animated monster visual states
- Urgency mode for counter
- A4 label format option
- Batch analytics dashboard (fill rates, delivery times, revenue per batch)

### Phase 4 — Polish & Scale

**Goal**: Production hardening and operational tools.

- Rep performance tracking and ratings
- Recurring batch window schedules (auto-create daily windows)
- Minimum order threshold handling (proceed/cancel decision flow)
- Multi-hub support (outlet serves multiple campuses)
- Batch history and reporting for admin
- Export tools (CSV of batch data, commission reports)
- Push notifications for reps (assignment ready, escalation) PNUT MONSTER Batch/Pool Order System

Addendum Document

Operational Improvements & Production Enhancements (Version 2)

⸻

Purpose

This document extends the original Batch/Pool Order System Design by introducing operational improvements, production controls, scalability enhancements, failure handling, analytics, and optimization layers.

Nothing in this document replaces the original specification.

Instead, these additions make the platform production-ready for operating hundreds of batches across multiple universities and campuses.

⸻

1. Production Run Layer

Why It Exists

A batch window is responsible for collecting orders.

A Production Run is responsible for executing them.

Once a window closes, the system should create an immutable Production Run.

This prevents modifications from changing kitchen instructions after cooking has begun.

⸻

Lifecycle

Batch Window
↓
Window Closed
↓
Production Run Created
↓
Kitchen Preparation
↓
Packaging
↓
Representative Pickup
↓
Delivery
↓
Completed

⸻

Production Run Object

Field	Description
Run ID	Unique production identifier
Batch Window	Source window
Outlet	Linked outlet
Created At	Time generated
Locked Orders	Number of frozen orders
Locked Revenue	Revenue snapshot
Prep Status	Pending / Preparing / Packed
Packaging Status	Pending / Complete
Delivery Status	Pending / Active / Completed

⸻

Benefits

* Immutable production snapshot
* Stable PDFs
* Consistent analytics
* Easier audits
* No accidental kitchen changes

⸻

2. Operational Status Expansion

Customer-facing statuses remain simple.

Operations require more detail.

⸻

Internal Workflow

Scheduled
↓
Open
↓
Locked
↓
Production Started
↓
Preparation Complete
↓
Packaging Started
↓
Packaging Complete
↓
Awaiting Representative Pickup
↓
Picked Up
↓
Partially Delivered
↓
Completed
↓
Archived

⸻

Customer Status Mapping

Internal	Customer
Open	Batch Pending
Locked	Batch Pending
Production Started	Preparing
Packaging Complete	Preparing
Picked Up	Out for Delivery
Completed	Delivered

⸻

3. Inventory Validation

Before the kitchen starts preparing food, the system performs a complete ingredient validation.

⸻

Process

Orders Locked
↓
Calculate Required Components
↓
Compare With Inventory
↓
Generate Shortage Report
↓
Manager Decision
Proceed
or
Restock
or
Cancel Batch

⸻

Example

Required
Paneer
4.2kg
Available
3.5kg
Shortage
700g

⸻

Benefits

* Prevents failed batches
* Better inventory planning
* Reduced food waste

⸻

4. Kitchen Production Stages

The prep sheet should follow the actual kitchen workflow.

⸻

Stage 1

Base Preparation

* Heat breads
* Toast buns
* Warm tortillas

⸻

Stage 2

Protein Preparation

* Chicken
* Paneer
* Egg
* Mushroom

⸻

Stage 3

Sauces

* Chipotle
* Mayo
* Peanut
* Mint

⸻

Stage 4

Vegetables

* Onion
* Lettuce
* Jalapeños

⸻

Stage 5

Assembly

* Assemble wraps
* Assemble bowls
* Prepare drinks

⸻

Stage 6

Packaging

* Box items
* Attach labels
* Sort by representative

⸻

5. Inventory Forecast

Every completed batch contributes to demand forecasting.

Example

Monday Lunch
Average
72 Wraps
18 Coffees
12 Lemonades

The system predicts inventory requirements for future batches.

⸻

6. Representative Bundle Management

Current design tracks parcel delivery.

This enhancement tracks parcel ownership.

⸻

Bundle Lifecycle

Kitchen
↓
Packed
↓
Bundle Created
↓
Representative Pickup
↓
Representative In Transit
↓
Delivered

⸻

Bundle QR

Every representative receives one bundle QR.

Scanning confirms:

* Bundle collected
* Time collected
* Representative identity
* Number of parcels

⸻

Parcel QR

Still used for final customer delivery.

⸻

7. Delivery Cluster Optimization

Instead of balancing only order counts, deliveries should be optimized geographically.

⸻

Algorithm

Orders
↓
Group by Block
↓
Group by Floor
↓
Group by Nearby Rooms
↓
Estimate Walking Time
↓
Assign to Representatives

⸻

Example

Representative A

Room 201
Room 202
Room 203
Room 204

Representative B

Floor 3
Room 318
Room 322
Room 330

This minimizes walking distance.

⸻

8. Estimated Delivery Time Engine

Every customer receives a dynamic ETA.

⸻

Formula

Window Close
+
Average Kitchen Time
+
Packing Time
+
Representative Travel
=
Estimated Delivery Time

⸻

Example

Window Closes
11:30
Kitchen
25 mins
Packing
12 mins
Delivery
15 mins
ETA
12:22 PM

⸻

9. Batch Dashboard Enhancements

Outlet dashboard gains operational metrics.

⸻

Live Metrics

Current Orders

Revenue

Average Order Value

Items to Prepare

Preparation Progress

Packaging Progress

Representative Pickup Status

Delivered Orders

Remaining Orders

Completion %

⸻

Visual Indicators

Green

On Schedule

Yellow

Running Late

Red

Critical Delay

⸻

10. Shelf & Packing Zones

Large batches require physical organization.

⸻

Shelf Assignment

Shelf A
Engineering Block
Shelf B
Management Block
Shelf C
Library
Shelf D
Hostel

Labels display

Shelf B

Representatives immediately know where to collect parcels.

⸻

11. Enhanced Parcel Labels

Additional fields

* Shelf Number
* Packaging Sequence
* Bundle Number
* Production Run ID
* Estimated Delivery Time

Example

Bundle
2 / 5
Shelf
A
Run
#PR-107

⸻

12. Failure Management

The platform should support operational exceptions.

⸻

Representative Absent

Rep Offline
↓
Auto Notify Manager
↓
Reassign Orders
↓
Generate New Bundle

⸻

Kitchen Delay

Prep Running Late
↓
ETA Updated
↓
Customers Notified

⸻

Customer Unreachable

Representative selects

* Phone unreachable
* Incorrect location
* Customer unavailable

Manager receives alert.

⸻

Weather Delay

Manager can mark

Delivery Delayed
Reason
Weather

Customers automatically receive ETA updates.

⸻

13. Exception Queue

Managers get a dedicated queue.

Contains

* Undeliverable orders
* Missing parcels
* Inventory shortages
* Failed QR scans
* Representative reassignment
* Customer complaints

⸻

14. Security Improvements

Every QR validation should verify

* Representative
* Assigned order
* Batch
* Production Run
* Timestamp
* Signature
* Expiration

Additional metadata

* GPS
* Device ID
* Scan time

⸻

15. Batch Analytics

Every batch generates detailed analytics.

⸻

Operational

* Fill Rate
* Orders
* Revenue
* Average Order Value
* Preparation Time
* Packaging Time
* Pickup Delay
* Delivery Duration
* Completion Rate

⸻

Kitchen

* Components Used
* Packaging Used
* Inventory Shortages
* Food Waste

⸻

Representative

* Orders Delivered
* Average Delivery Time
* Delivery Success Rate
* Customer Complaints
* Earnings

⸻

Customer

* Repeat Orders
* Average Spend
* Preferred Batch
* Popular Time Slot
* Preferred Block

⸻

16. AI Optimization Layer

Future AI models can optimize operations automatically.

⸻

Demand Prediction

Predicts

* Expected orders
* Expected revenue
* Inventory requirements

⸻

Kitchen Optimization

Suggests

* Preparation order
* Ingredient batching
* Staffing requirements

⸻

Representative Optimization

Suggests

* Number of representatives
* Delivery routes
* Cluster improvements

⸻

Batch Timing Optimization

Analyzes historical data to recommend

* Better start times
* Better end times
* Better capacity

⸻

17. Multi-Campus Scalability

Instead of university-specific assumptions, the system should use a generic Delivery Hub architecture.

Example

Delivery Hub
↓
Institution
↓
Office Park
↓
Tech Campus
↓
Hospital
↓
Industrial Area

This allows the same infrastructure to serve universities, corporate campuses, hospitals, and business parks.

⸻

18. Operational Audit Trail

Every important action is logged.

Examples

* Window created
* Window closed
* Production Run generated
* Representative assigned
* Bundle collected
* Parcel delivered
* Refund processed
* Batch cancelled

Each record contains

* User
* Timestamp
* Previous value
* New value
* Device
* IP (where applicable)

⸻

19. Business Intelligence Dashboard

Management dashboards should include:

Revenue

* Revenue by outlet
* Revenue by hub
* Revenue by batch
* Revenue by representative

Operational

* Average batch completion time
* Average kitchen delay
* Delivery SLA
* Batch profitability

Customer

* Retention
* Repeat purchases
* Most active blocks
* Peak ordering windows

Representative

* Top performers
* Average earnings
* Settlement reports
* Delivery quality

⸻

20. Future Automation

The platform can gradually automate operations.

Examples include:

* Automatically create recurring batch windows
* Auto-close batches when capacity is reached
* Automatically generate Production Runs
* Automatically generate kitchen PDFs and parcel labels
* Automatically assign representatives
* Automatically notify customers and representatives
* Automatically predict inventory shortages
* Automatically recommend staffing levels
* Automatically archive completed batches

⸻

Summary

These enhancements transform the Batch/Pool Ordering System from a scheduling feature into a comprehensive production and operations platform.

The additions focus on:

* Immutable Production Runs
* Operational state management
* Inventory validation
* Delivery clustering
* Bundle tracking
* Shelf management
* Dynamic ETA calculation
* Exception handling
* Advanced analytics
* AI-assisted optimization
* Enterprise scalability
* Operational auditability

Together with the original design, these improvements provide a production-ready architecture capable of supporting high-volume batch operations across multiple campuses and delivery hubs while maintaining operational efficiency, reliability, and scalability.
