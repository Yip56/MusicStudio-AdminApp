# StudioOS v7 — Design decisions, assumptions and open questions

This records *why* v7 (the enrolment-centred rebuild) works the way it does: what the studio owner decided, what was assumed, and what is still open. For *how* it works, see `CLAUDE.md`. For teacher instructions, see `user-guide-teacher.md`.

Status legend: **Decided** = the owner said so · **Assumed** = chosen by the developer, not confirmed · **Open** = needs an answer.

---

## 1. Scope and approach

| Topic | Decision | Source |
|---|---|---|
| Real data | The app now holds real data. All demo data was removed; the owner enters real data by hand. No import script. | Decided |
| Persistence | Students, enrolments, teachers, rooms, attendance and one-off sessions moved from memory to Firestore. | Decided |
| Tests | Vitest approved as the only new dependency. | Decided |
| Conflict checks | Done in app code, not Firestore rules. At under 50 students, two admins booking the same slot in the same second is negligible. Grade-style/deposit guarantees that matter are enforced in rules/transactions instead. | Decided |
| Build order | Foundation → rooms/enrolments/schedule → fees/terms/commission/discounts → deposits → Finalize Month/Archive → docs. | Agreed |

## 2. Enrolments, rooms, instruments

- **Enrolment is the central record** (student + instrument). Grade, schedule, fee, term, commission and deposit hang off it. *Decided.*
- **Instruments come only from the Grades & Fees page.** Every picker (teacher form, enrolment form, room types) follows it. This also fixes the old bug where Flute could still be chosen for a teacher. *Decided.*
- **Removing an instrument:** existing references become `null` (no fee, no duration). Deleting is blocked for everyone, sysadmin included, while any teacher or student is linked. Message: "Un-attach all students and teachers that are linked to this instrument before deleting." *Decided.*
- **Room types** equal the instrument list (no separate "theory" type). A room needs at least one type. *Assumed.*

## 3. Fees, terms, commission

- **Commission:** per enrolment; if the admin hasn't set one, the teacher's default applies. Snapshotted when a fee is collected. *Decided.*
- **Billing terms:** monthly or quarterly only. Quarterly = three months counted from the enrolment start, one fee collected once, with commission and payroll attributed to the month it was collected. *Decided.*
- **Fee changes** apply from an effective month forward; collected fees never change. *Decided (original brief).*
- **Quarterly attendance-based fees** are prorated across all three months. *Assumed.*

## 4. Registration deposit

Decided by the owner:
- Paid at registration **on top of** the first month's fee (e.g. RM 160 deposit + RM 160 fee = RM 320).
- **Not refundable.** Held until the enrolment stops, then used as the final month's fee. A RM 160 deposit against a RM 160 final fee means the student pays nothing; against RM 200 they pay RM 40. The system detects the stop and deducts it automatically.
- Excluded from profit while held.
- **Editable per student.** Default = the first month's fee **for the student's starting grade** (not everyone starts at Grade 1; some start at Grade 3 or 8).
- A deposit higher than the first month's fee shows a **warning**, not a block.
- "A deposit larger than the final fee won't happen." Warning only.

Assumed:
- Excess over the final fee (if it ever happens) is recorded as forfeited on the same deposit.
- Registration may be saved before the deposit is collected; it is flagged "Registration incomplete" rather than blocked.
- Stopping an enrolment means choosing the **last lesson month**. If that month's fee is already collected, the deposit is not applied; the admin un-collects first, then uses **Apply deposit**.
- When the deposit fully covers the final fee, the fee is marked collected automatically.
- For attendance-based students the deposit is applied against the full (unprorated) fee.
- The original brief's "refunded" status was dropped because deposits are non-refundable.

## 5. Grade changes (grade lock replaced)

The original brief asked for a read-only grade once a fee was collected. The owner replaced this: **Finalize Month does that job.** Instead there is a **warning** when an admin changes a grade or lesson length after the fee was collected. The collected fee keeps its amount; the change only affects future fees. *Decided.*
Assumed: approving a teacher's grade request from the bell shows only an informational note, not a tick-to-confirm.

## 6. Finalize Month and Archive

Decided by the owner:
- Button name: **Finalize Month** (suggested by the developer, accepted).
- Until pressed, nothing is official and fees can be un-collected freely.
- Pressing it saves an **uneditable** record in Firebase. A warning is shown for uncollected fees, but they do not block it.
- Mistakes are fixed on an **Archive page** that keeps the original and adds a revision.
- A revision that affects other months **highlights** them, especially deferrals; the originals are kept.
- The Archive page also holds a **notification archive** of read (approved/rejected) notifications.

Assumed:
- Only a **sysadmin** can revise; a reason is required.
- Revisions do not rewrite other months' ledgers; they only flag them. (Owner has since decided they should rewrite deferral targets after a warning — see §10 Q5; not yet implemented.)
- Teachers do not see revised figures (snapshot collections are admin-only).
- Revisable fields: collected, fee, discount amount, commission %, deferral month.

## 7. Discounts and the Payroll layout

Decided by the owner:
- A **Discounts page**: name, percentage (or RM amount), start month, duration. Users then apply one to a student with a button under FEE.
- Discount reduces the fee actually collected; commission is calculated on the discounted amount; admin flat fee is unchanged; deposits are not discounted.
- The original fee is struck through when a discount is live, and the discounted fee is shown larger.
- Discounts capped at the fee; optional note field. Admin and sysadmin only; teachers never see discounts.
- Payroll table is two rows per student. Top row: Grade, Duration, Type (attendance-based / full fee), Fee, Gross, Teacher, Admin, Collection. Bottom row: Discount button under Fee, defer-payout button under Collection. The merged column is named **Collection**; "Payout" refers to teachers.

Assumed: applying it is still per student per month. ~~"duration" is a window of months~~ — superseded: the owner confirmed duration means "lasts N months" once applied (see §10 Q2; not yet implemented).

## 8. Logging and records

Decided: save messages for notifications, payroll, fees, students in/out, fee revisions and anything else relevant. Implemented as an append-only **Activity Log** (admin), plus the Notification Archive. Every fee, term and commission change records old and new values. *Decided.*

## 9. Other changes the developer made

- Student creation was **removed from User Management**; students are registered on the Students page (name, instrument, teacher, time, deposit). User Management lists them read-only.
- Payroll was kept off the teacher menu, as it was before. Teachers therefore see no earnings or commission screens.
- Payout CSV and invoice gained columns/lines for instrument, term, discount, rate and deposit applied.
- The "today" date now uses local time (it was UTC, wrong after 4pm in Kuala Lumpur).
- An "Download full backup" button was added to the Archive page.

## 10. Open questions

Answered by the owner on 2026-10-31:

1. **Earnings for teachers:** **No.** Teachers get no earnings/commission screen. *Decided.* (The teacher guide must not describe one.)
2. **Discount duration:** **"Lasts N months"** once applied to a student, not a fixed calendar window. *Decided and implemented.* `startMonth` is now "available from"; the first month a discount is applied to an enrolment is stored as `enrolments/{id}.discountGrants[discountId]`, and `isDiscountActiveFor(d, ym, appliedFrom)` allows it for N months from there. Removing/switching the discount in that first month clears the grant so the window can restart.
3. **Payout CSV layout:** owner will check against the studio spreadsheet later. *Still open.*
4. **Grade approval warning:** owner asked what a grade request is. A **grade request** is a notification a teacher sends from Students asking the admin to change a student's grade; the admin approves or rejects it from the bell drawer. Question stands: should approving one after the fee was collected require a tick (as the admin edit form does)? *Still open — awaiting owner's answer.* Current behaviour: informational note only.
5. **Revisions and deferrals:** **Yes**, a revision should rewrite the deferral's target month automatically, **but the user must be informed and warned first** when changing a deferral during a revision. *Decided and implemented.* The Revise modal lists every deferral change and requires an "I understand" tick before saving; `saveRevision` then removes the amount from the old target month's ledger and adds it to the new one (`deferralChanges`). A target month that is already finalized is rule-locked, so it is not rewritten: the modal flags it in red, the user is told after saving, and the month stays highlighted so it can be revised too (my choice for the case you hadn't specified).
6. **Registration form (added later):** the owner asked for the "standard RM x" quote on the Monthly fee field and the deposit default to be removed completely. The deposit field now starts empty (an amount above zero is still required); billing still uses the Grades & Fees price unless a fee override is typed. This supersedes §4's "default amount = first month's fee" for the registration form (`defaultDepositAmount` still exists in the domain and in `useStudio`'s exported actions, but no view calls it now.)

## 11. Deployment checklist

1. `firebase deploy --only firestore:rules` — required; the new collections are rule-protected.
2. Manually test on a staging/real account (there is no Firestore emulator in the repo): register a student with two instruments; collect a fee; stop an enrolment and check the deposit is applied; finalize a month; revise it as sysadmin; confirm a teacher cannot see admin pages or data.
3. Optionally delete the old demo documents in `payroll_months` and `class_deferrals`.
4. `npm run build && firebase deploy --only hosting`.

## 12. Known limitations

- Firestore rules and the live transactions (stop enrolment, finalize) are not covered by automated tests.
- No browser testing was done; views are covered by server-render smoke tests only.
- Teachers' grade-request approval cannot check whether the fee was collected at that moment.
- The admin guide has not been written (`docs/README.md` lists it as pending).
