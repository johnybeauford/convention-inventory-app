import React, { useMemo, useState } from "react";
import { S } from "../styles";
import { EditOrderModal } from "./EditOrderModal";
import { Lightbox } from "./Lightbox";
import { getItemImages } from "../imageUtils";

// currentVolunteerName is who's actually logged in right now — used to
// make sure only a designated Reviewer can click "Mark as Reviewed"
// for themselves, not just anyone with Orders access. Up to 4
// reviewers can be configured; any 2 of them reviewing an order is
// enough to advance it — see REQUIRED_REVIEWS below. Cancelling an
// order (submitted or still in-progress) uses the same reviewer check:
// any one designated Reviewer, or a full admin (volunteer-management
// access), can do it.
const REQUIRED_REVIEWS = 1;

// Groups an order's line items by category (same grouping used for
// check-in and the item-picking screens), sorted by category name, so
// staff can see at a glance what's been requested from each
// department — Stage, Audio, etc. — instead of one flat list.
function groupByCategory(lineItems) {
  const byCategory = new Map();
  for (const li of lineItems) {
    const cat = li.category || "Uncategorized";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(li);
  }
  return Array.from(byCategory.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, catItems]) => ({ category, items: catItems }));
}

const missingActionBtnStyle = {
  background: "#fff",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 10px",
  cursor: "pointer",
};

export function OrdersPage({
  orders,
  drafts,
  items,
  onMarkReady,
  onAssignFillers,
  onResendFillerNotice,
  onResendReadyEmail,
  onResendSubmittedEmail,
  onCancelOrder,
  onArchiveOrder,
  onMoveBackToPicking,
  onCancelDraft,
  onUpdateDraftItems,
  onUpdateOrderItems,
  volunteers,
  reviewerIds,
  currentVolunteerName,
  isCurrentVolunteerAdmin,
  onUpdateOrder,
  onResolveMissingItem,
}) {
  const [search, setSearch] = useState("");
  const [editingOrder, setEditingOrder] = useState(null);
  const [editingDraft, setEditingDraft] = useState(null);

  const reviewerVolunteers = (reviewerIds || []).map((id) => volunteers.find((v) => v.id === id)).filter(Boolean);
  const reviewerNames = reviewerVolunteers.map((v) => v.name);
  const volunteerNames = volunteers.map((v) => v.name);
  const isReviewer = reviewerNames.includes(currentVolunteerName);
  const canCancel = isReviewer || Boolean(isCurrentVolunteerAdmin);

  // For each order, look up the *current* out-count for every item it listed
  // (matched by name). An order stays here while it's still active (anything
  // still checked out); once fully checked back in it disappears from this
  // page entirely and shows up in Admin > History instead.
  const allOrders = useMemo(() => {
    return orders.map((order) => {
      const lineItems = (order.items || []).map((li) => {
        const liveItem = items.find((i) => i.name === li.name);
        const stillOut = liveItem ? Math.min(li.qty, liveItem.out || 0) : 0;
        const thumbnail = liveItem ? getItemImages(liveItem)[0] || null : null;
        return {
          ...li,
          stillOut,
          exists: Boolean(liveItem),
          category: liveItem ? liveItem.category : "Uncategorized",
          thumbnail,
        };
      });
      const isActive =
        order.status !== "cancelled" && order.status !== "archived" && lineItems.some((li) => li.stillOut > 0);
      const status = order.status || "submitted";
      const reviewedBy = Array.isArray(order.reviewedBy) ? order.reviewedBy : [];
      const assignedFillers = Array.isArray(order.assignedFillers) ? order.assignedFillers : [];
      return { ...order, lineItems, isActive, status, reviewedBy, assignedFillers };
    });
  }, [orders, items]);

  const activeOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allOrders.filter((o) => {
      if (!o.isActive) return false;
      if (!q) return true;
      return (
        (o.requesterName || "").toLowerCase().includes(q) ||
        (o.lineItems || []).some((li) => li.name.toLowerCase().includes(q))
      );
    });
  }, [allOrders, search]);

  const needsReviewCount = activeOrders.filter((o) => o.status === "submitted").length;

  return (
    <div>
      {needsReviewCount > 0 && (
        <div style={needsReviewBannerStyle}>
          {needsReviewCount === 1
            ? "1 request needs review"
            : `${needsReviewCount} requests need review`}
          {reviewerNames.length > 0
            ? ` — ${reviewerNames.join(" / ")}, take a look below.`
            : " — set at least 2 reviewers under the Volunteers tab."}
        </div>
      )}

      <div style={S.card}>
        <h2 style={S.cardTitle}>Orders</h2>
        <div style={S.tinyMuted}>
          Every request moves through review, assignment, and fulfillment here. Once everything's checked
          back in, it moves to the History tab automatically.
        </div>
      </div>

      <div style={S.toolbar}>
        <div style={S.searchWrap}>
          <input
            style={S.searchInput}
            placeholder="Search by requester or item name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <h3 style={{ ...S.cardTitle, marginTop: 18 }}>Active ({activeOrders.length})</h3>
      {activeOrders.length === 0 && (
        <div style={S.card}>
          <div style={S.tinyMuted}>Nothing currently active.</div>
        </div>
      )}
      {activeOrders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          volunteerNames={volunteerNames}
          reviewerNames={reviewerNames}
          currentVolunteerName={currentVolunteerName}
          canCancel={canCancel}
          isCurrentVolunteerAdmin={isCurrentVolunteerAdmin}
          onMarkReady={onMarkReady}
          onAssignFillers={onAssignFillers}
          onResendFillerNotice={onResendFillerNotice}
          onResendReadyEmail={onResendReadyEmail}
          onResendSubmittedEmail={onResendSubmittedEmail}
          onCancelOrder={onCancelOrder}
          onArchiveOrder={onArchiveOrder}
          onMoveBackToPicking={onMoveBackToPicking}
          onUpdateOrder={onUpdateOrder}
          onResolveMissingItem={onResolveMissingItem}
          onEditOrder={() => setEditingOrder(order)}
          volunteers={volunteers}
        />
      ))}

      {drafts && drafts.length > 0 && (
        <>
          <h3 style={{ ...S.cardTitle, marginTop: 18 }}>In-Progress, Not Yet Submitted ({drafts.length})</h3>
          <div style={{ ...S.tinyMuted, marginBottom: 10 }}>
            A requester saved these but hasn't submitted yet — nothing here has reserved any inventory. They
            can resume and finish on any device using "Already submitted an order?" with their phone number.
          </div>
          {drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              canCancel={canCancel}
              onCancel={onCancelDraft}
              onEditDraft={setEditingDraft}
            />
          ))}
        </>
      )}

      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          items={items}
          onSave={(newItems, newDetails) => onUpdateOrderItems(editingOrder, newItems, newDetails)}
          onClose={() => setEditingOrder(null)}
        />
      )}

      {editingDraft && (
        <EditOrderModal
          order={editingDraft}
          items={items}
          title={`Edit Draft — ${editingDraft.requesterName || "Requester"}`}
          hint="Adjust quantities, remove items, or add ones the requester hasn't picked yet. Nothing here touches live inventory — a draft doesn't reserve any stock until it's actually submitted."
          onSave={(newItems, newDetails) => onUpdateDraftItems(editingDraft, newItems, newDetails)}
          onClose={() => setEditingDraft(null)}
        />
      )}

    </div>
  );
}

function OrderCard({ order, volunteerNames, volunteers, reviewerNames, currentVolunteerName, canCancel, isCurrentVolunteerAdmin, onMarkReady, onAssignFillers, onResendFillerNotice, onResendReadyEmail, onResendSubmittedEmail, onCancelOrder, onArchiveOrder, onMoveBackToPicking, onUpdateOrder, onResolveMissingItem, onEditOrder }) {
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [resendingReady, setResendingReady] = useState(false);
  const [resendReadyFlash, setResendReadyFlash] = useState(null); // { text, tone: "ok" | "error" } | null
  const [checklistLightbox, setChecklistLightbox] = useState(null); // { src, name } | null

  // Opens a standalone printable copy of just this order in a new tab,
  // instead of the old same-page "scoped print" trick. That trick relied
  // on window.print() firing inside this page itself, which iOS Safari
  // silently refuses to do at all when the app is running as an
  // installed/home-screen app (no error, print() just does nothing) —
  // this sidesteps that entirely by handing off to a plain browser tab,
  // where printing and "Save as PDF" / sharing always work normally.
  function handlePrintOrder() {
    const html = buildOrderPrintHtml(order);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (!win) {
      window.alert(
        "Your browser blocked opening the printable order in a new tab. Please allow pop-ups for this site and try again."
      );
    }
    // Give the new tab a little time to actually load the blob before
    // releasing it — it's only ever referenced once, right at open.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  const [submittedResendOpen, setSubmittedResendOpen] = useState(false);
  const [includeRequester, setIncludeRequester] = useState(Boolean(order.requesterEmail));
  const [includeReturner, setIncludeReturner] = useState(Boolean(order.hasReturner && order.returnerEmail));
  const [extraEmails, setExtraEmails] = useState("");
  const [sendingSubmitted, setSendingSubmitted] = useState(false);
  const [submittedFlash, setSubmittedFlash] = useState(null); // { text, tone: "ok" | "error" } | null
  const [pickedFillers, setPickedFillers] = useState(order.assignedFillers || []);
  const [pointOfContactId, setPointOfContactId] = useState("");

  const reviewersConfigured = (reviewerNames || []).length > 0;
  const isReviewer = (reviewerNames || []).includes(currentVolunteerName);
  const reviewedBy = order.reviewedBy || [];
  const alreadyReviewedByMe = reviewedBy.includes(currentVolunteerName);
  const reviewsStillNeeded = Math.max(REQUIRED_REVIEWS - reviewedBy.length, 0);

  // Digital gathering checklist (see the "assigned" status block below)
  // — stored directly on the order as a simple name → checked map, so
  // it's shared live across everyone viewing this order and survives
  // a refresh or a different device, same as reviewedBy/assignedFillers.
  // Only the volunteer(s) this order was actually assigned to — or a
  // full admin — can check items off; anyone else with Orders access
  // can still see the checklist and its progress, just not toggle it.
  const pickingChecklist = order.pickingChecklist || {};
  const gatheredCount = order.lineItems.filter((li) => pickingChecklist[li.name]).length;
  const totalCount = order.lineItems.length;
  const canToggleGathered =
    (order.assignedFillers || []).includes(currentVolunteerName) || Boolean(isCurrentVolunteerAdmin);

  // "Can't Find" reports — saved on the order itself (missingItems,
  // keyed by item name) same as pickingChecklist, so they're shared
  // live across everyone viewing this order. A filler reports one with
  // a required reason; it then shows up for whoever reviewed this
  // order (or any admin) to resolve as either a substitution or a
  // "not available" notice — either way the requester gets an email
  // once it's resolved. Checking an item's box always means it was
  // found, so that clears any open "can't find" report for it.
  const missingItems = order.missingItems || {};
  const unresolvedMissing = order.lineItems.filter((li) => missingItems[li.name] && !missingItems[li.name].resolved);
  // An order with no line items at all (shouldn't normally happen, but
  // isn't something to get stuck on) counts as fully gathered so Mark
  // Ready isn't permanently blocked for it. An item that's been
  // resolved (substituted, or confirmed unavailable) no longer needs
  // its box checked to count as handled.
  const allGathered =
    totalCount === 0 ||
    order.lineItems.every((li) => pickingChecklist[li.name] || missingItems[li.name]?.resolved);

  function toggleGathered(name) {
    if (!canToggleGathered) return;
    const nextChecked = !pickingChecklist[name];
    const nextMissing = { ...missingItems };
    if (nextChecked) delete nextMissing[name];
    onUpdateOrder(order.id, {
      pickingChecklist: { ...pickingChecklist, [name]: nextChecked },
      missingItems: nextMissing,
    });
  }

  function reportMissing(name) {
    if (!canToggleGathered) return;
    const reason = window.prompt(`Why can't you find "${name}"? This note goes to whoever reviewed this order.`);
    if (reason === null) return; // cancelled
    onUpdateOrder(order.id, {
      pickingChecklist: { ...pickingChecklist, [name]: false },
      missingItems: {
        ...missingItems,
        [name]: {
          reason: reason.trim() || "No reason given",
          reportedBy: currentVolunteerName,
          reportedAtMs: Date.now(),
          resolved: false,
        },
      },
    });
  }

  const canResolveMissing = (reviewerNames || []).includes(currentVolunteerName) || Boolean(isCurrentVolunteerAdmin);

  // Either the filler who could toggle the checkbox, or a reviewer/admin
  // resolving it, can undo a mistaken "can't find" report.
  function undoMissing(name) {
    if (!canToggleGathered && !canResolveMissing) return;
    const nextMissing = { ...missingItems };
    delete nextMissing[name];
    onUpdateOrder(order.id, { missingItems: nextMissing });
  }

  const [resolvingName, setResolvingName] = useState(null);

  async function handleSubstitute(name) {
    const substituteName = window.prompt(`What are you substituting for "${name}"?`);
    if (substituteName === null || !substituteName.trim()) return;
    setResolvingName(name);
    try {
      await onResolveMissingItem(order, name, { type: "substitute", substituteName: substituteName.trim() }, currentVolunteerName);
    } finally {
      setResolvingName(null);
    }
  }

  async function handleUnavailable(name) {
    if (!window.confirm(`Let ${order.requesterName || "the requester"} know "${name}" isn't available? This will email them.`)) return;
    setResolvingName(name);
    try {
      await onResolveMissingItem(order, name, { type: "unavailable" }, currentVolunteerName);
    } finally {
      setResolvingName(null);
    }
  }

  const [movingBack, setMovingBack] = useState(false);
  async function handleMoveBack() {
    setMovingBack(true);
    try {
      await onMoveBackToPicking(order);
    } finally {
      setMovingBack(false);
    }
  }
  // Until it's been gathered and the requester told it's ready.
  const canMoveBack = ["submitted", "reviewed", "assigned"].includes(order.status);

  async function handleCancel() {
    setCancelling(true);
    try {
      await onCancelOrder(order);
    } finally {
      setCancelling(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await onArchiveOrder(order);
    } finally {
      setArchiving(false);
    }
  }

  function handleMarkReviewed() {
    const updated = alreadyReviewedByMe ? reviewedBy : [...reviewedBy, currentVolunteerName];
    const patch = { reviewedBy: updated };
    if (updated.length >= REQUIRED_REVIEWS) {
      patch.status = "reviewed";
    }
    onUpdateOrder(order.id, patch);
  }

  const [assigning, setAssigning] = useState(false);
  const [resendVolunteerId, setResendVolunteerId] = useState("");
  const [resending, setResending] = useState(false);

  function toggleFiller(name) {
    setPickedFillers((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  async function handleAssign() {
    if (pickedFillers.length === 0) return;
    setAssigning(true);
    try {
      await onAssignFillers(order, pickedFillers);
    } finally {
      setAssigning(false);
    }
  }

  async function handleResend() {
    if (!resendVolunteerId) return;
    const volunteer = volunteers.find((v) => v.id === resendVolunteerId);
    if (!volunteer) return;
    setResending(true);
    try {
      await onResendFillerNotice(order, volunteer);
      setResendVolunteerId("");
    } finally {
      setResending(false);
    }
  }

  // Shown wherever fillers have already been assigned — lets staff
  // pick any volunteer (already assigned or a swap-in) and resend the
  // exact same order details to them, for a swap or a missed email.
  function renderResendBlock() {
    return (
      <div style={{ marginTop: 10 }}>
        <label style={S.fieldLabel}>
          Resend to a volunteer (swap, or if they didn't receive it)
          <select style={S.fieldInput} value={resendVolunteerId} onChange={(e) => setResendVolunteerId(e.target.value)}>
            <option value="">Select a volunteer…</option>
            {volunteers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <button style={S.secondaryBtn} disabled={!resendVolunteerId || resending} onClick={handleResend}>
          {resending ? "Sending…" : "Resend Order Details"}
        </button>
      </div>
    );
  }

  async function handleMarkReady() {
    setSending(true);
    try {
      const pointOfContact = volunteers.find((v) => v.id === pointOfContactId) || null;
      await onMarkReady(order, pointOfContact);
    } finally {
      setSending(false);
    }
  }

  // For when a requester says they never got the "ready for pickup"
  // email, or staff just want to double check — resends the exact same
  // notice using the point of contact already on file for this order.
  async function handleResendReady() {
    setResendingReady(true);
    setResendReadyFlash(null);
    try {
      const result = await onResendReadyEmail(order);
      if (!result?.ok) {
        setResendReadyFlash({ text: "Couldn't send — try again.", tone: "error" });
      } else if (result.skipped === "no-email") {
        setResendReadyFlash({ text: "No email on file for this requester.", tone: "error" });
      } else {
        setResendReadyFlash({ text: "Sent!", tone: "ok" });
      }
    } finally {
      setResendingReady(false);
    }
  }

  // Resends the original "request submitted" confirmation — to the
  // requester, the returner, or both (whichever checkboxes are on),
  // plus anyone typed into the extra-recipients field.
  async function handleResendSubmitted() {
    const trimmedExtra = extraEmails.trim();
    if (!includeRequester && !includeReturner && !trimmedExtra) return;
    setSendingSubmitted(true);
    setSubmittedFlash(null);
    try {
      const result = await onResendSubmittedEmail(order, {
        includeRequester,
        includeReturner,
        extraEmails: trimmedExtra,
      });
      if (!result?.ok) {
        setSubmittedFlash({ text: "Couldn't send — try again.", tone: "error" });
      } else if (result.skipped === "no-email") {
        setSubmittedFlash({ text: "No recipients — nothing on file and no extra email entered.", tone: "error" });
      } else {
        setSubmittedFlash({ text: "Sent!", tone: "ok" });
      }
    } finally {
      setSendingSubmitted(false);
    }
  }

  return (
    <div style={S.card}>
      <div style={S.cardHeaderRow}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a2e" }}>
              {order.requesterName || "Unnamed requester"}
            </span>
            <StatusTag status={order.status} />
            {order.reactivatedFromLabel && <span style={reactivatedTagStyle}>Reactivated</span>}
          </div>
        </div>
        <div style={{ ...S.tinyMuted, textAlign: "right" }}>Submitted {order.createdAtLabel || "—"}</div>
      </div>

      <div style={orderDetailTextStyle}>
        {order.requesterPhone || "—"}
        {order.requesterEmail ? ` · ${order.requesterEmail}` : ""}
        <br />
        {order.circuit || "—"} · {order.eventType || "—"} · Event {order.eventDate || "—"} · Pickup{" "}
        {order.pickupDate || "—"} · Return {order.returnDate || "—"}
      </div>
      {order.reactivatedFromLabel && (
        <div style={{ ...S.tinyMuted, marginTop: 4 }}>
          Reactivated from an order originally submitted {order.reactivatedFromLabel}.
        </div>
      )}

      {order.hasReturner && (
        <div style={{ ...orderDetailTextStyle, marginTop: 6 }}>
          <strong>Returning:</strong> {order.returnerName || "—"}
          {order.returnerPhone ? ` · ${order.returnerPhone}` : ""}
          {order.returnerEmail ? ` · ${order.returnerEmail}` : ""}
          {order.returnerCircuit ? ` · ${order.returnerCircuit}` : ""}
        </div>
      )}

      <div style={{ ...S.summaryListWrap, marginTop: 10 }}>
        {groupByCategory(order.lineItems).map((group) => (
          <div key={group.category}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#888", margin: "8px 0 2px" }}>
              {group.category}
            </div>
            {group.items.map((li, idx) => (
              <div key={idx} style={S.summaryRow}>
                <span>
                  {li.name}
                  {!li.exists && <span style={{ color: "#c0392b", fontSize: 11 }}> (item no longer in catalog)</span>}
                </span>
                <span style={{ ...S.summaryQty, textAlign: "right" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", color: "#999", fontWeight: 700 }}>Requested</div>
                  <div style={{ fontWeight: 700, color: "#1a1a2e" }}>{li.qty}</div>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {order.notes && (
        <div style={{ ...S.tinyMuted, marginTop: 8 }}>
          <strong>Notes:</strong> {order.notes}
        </div>
      )}

      {/* Resends the original "request submitted" confirmation — available
          at any stage, not tied to a particular phase, since someone can
          say they never got it whenever they happen to notice. */}
      <div style={{ marginTop: 10 }}>
        {!submittedResendOpen ? (
          <button style={editLinkStyle} onClick={() => setSubmittedResendOpen(true)}>
            Resend Confirmation Email
          </button>
        ) : (
          <div style={{ background: "#f7f8fa", borderRadius: 8, padding: "10px 12px", marginTop: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 8 }}>
              Resend "Request Submitted" Confirmation
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={includeRequester}
                disabled={!order.requesterEmail}
                onChange={(e) => setIncludeRequester(e.target.checked)}
              />
              Requester{order.requesterEmail ? ` (${order.requesterEmail})` : " (no email on file)"}
            </label>
            {order.hasReturner && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={includeReturner}
                  disabled={!order.returnerEmail}
                  onChange={(e) => setIncludeReturner(e.target.checked)}
                />
                Returner{order.returnerEmail ? ` (${order.returnerEmail})` : " (no email on file)"}
              </label>
            )}
            <label style={S.fieldLabel}>
              Other recipients (optional, comma-separated)
              <input
                style={S.fieldInput}
                value={extraEmails}
                onChange={(e) => setExtraEmails(e.target.value)}
                placeholder="name@example.com, another@example.com"
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ ...S.primaryBtn, marginTop: 0 }}
                disabled={sendingSubmitted || (!includeRequester && !includeReturner && !extraEmails.trim())}
                onClick={handleResendSubmitted}
              >
                {sendingSubmitted ? "Sending…" : "Send"}
              </button>
              <button
                style={{ ...S.secondaryBtn, marginTop: 0 }}
                onClick={() => {
                  setSubmittedResendOpen(false);
                  setSubmittedFlash(null);
                }}
              >
                Cancel
              </button>
            </div>
            {submittedFlash && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  marginTop: 8,
                  color: submittedFlash.tone === "error" ? "#c0392b" : "#1e8449",
                }}
              >
                {submittedFlash.text}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Phase 2, step 1: review — any 2 of the up-to-4 designated reviewers signing off advances the order */}
      {order.status === "submitted" && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
          {!reviewersConfigured ? (
            <p style={S.tinyMuted}>Set at least 2 reviewers under the Volunteers tab to continue.</p>
          ) : isReviewer ? (
            alreadyReviewedByMe ? (
              <p style={S.tinyMuted}>
                You've reviewed this ({reviewedBy.length} of {REQUIRED_REVIEWS} required
                {reviewerNames.length > REQUIRED_REVIEWS ? `, ${reviewerNames.length} eligible` : ""}) — waiting on{" "}
                {reviewsStillNeeded} more.
              </p>
            ) : (
              <button style={S.primaryBtn} onClick={handleMarkReviewed}>
                Mark as Reviewed ({currentVolunteerName})
              </button>
            )
          ) : (
            <p style={S.tinyMuted}>
              {reviewedBy.length > 0
                ? `Reviewed by ${reviewedBy.join(", ")} (${reviewedBy.length} of ${REQUIRED_REVIEWS} required) — waiting on ${reviewsStillNeeded} more.`
                : `Waiting on ${reviewerNames.join(" / ")} to review this.`}
            </p>
          )}
        </div>
      )}

      {/* Phase 2, step 2: assign fillers */}
      {order.status === "reviewed" && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6 }}>
            Reviewed by {order.reviewedBy.join(", ")} — assign who will fill this order
          </div>
          {volunteerNames.length === 0 ? (
            <p style={S.tinyMuted}>Add volunteers under the Volunteers tab to assign someone.</p>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
                {volunteerNames.map((v) => (
                  <label key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={pickedFillers.includes(v)} onChange={() => toggleFiller(v)} />
                    {v}
                  </label>
                ))}
              </div>
              <button style={S.primaryBtn} disabled={pickedFillers.length === 0 || assigning} onClick={handleAssign}>
                {assigning ? "Assigning…" : "Assign to Fill"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Phase 2, step 3: fill + notify */}
      {order.status === "assigned" && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
          <div style={S.tinyMuted}>
            Assigned to: <strong>{order.assignedFillers.join(", ")}</strong>
          </div>
          {renderResendBlock()}

          {/* "Can't Find" reports needing a decision — shown to whoever
              reviewed this order, or any admin, so they can resolve it
              (substitute, or tell the requester it's unavailable)
              before Mark Ready can be used. */}
          {unresolvedMissing.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#c0392b", marginBottom: 4 }}>
                Items Needing Attention ({unresolvedMissing.length})
              </div>
              {!canResolveMissing && (
                <div style={{ ...S.tinyMuted, fontSize: 11, marginBottom: 4 }}>
                  Waiting on {reviewerNames.length ? reviewerNames.join(" or ") : "a reviewer"} (or an admin) to resolve
                  {unresolvedMissing.length === 1 ? " this." : " these."}
                </div>
              )}
              {unresolvedMissing.map((li) => {
                const missing = missingItems[li.name];
                const resolving = resolvingName === li.name;
                return (
                  <div
                    key={li.name}
                    style={{ background: "#fdecea", border: "1px solid #f5c6c0", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a2e" }}>
                      {li.name} <span style={{ fontWeight: 400, color: "#777" }}>× {li.qty}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                      Reported by {missing.reportedBy || "a volunteer"}: "{missing.reason}"
                    </div>
                    {canResolveMissing && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <button
                          style={{ ...missingActionBtnStyle, color: "#1a1a2e", borderColor: "#d8dde3" }}
                          disabled={resolving}
                          onClick={() => handleSubstitute(li.name)}
                        >
                          {resolving ? "Working…" : "Substitute Item"}
                        </button>
                        <button
                          style={{ ...missingActionBtnStyle, color: "#c0392b", borderColor: "#f5c6c0" }}
                          disabled={resolving}
                          onClick={() => handleUnavailable(li.name)}
                        >
                          {resolving ? "Working…" : "Not Available — Notify Requester"}
                        </button>
                        <button
                          style={{ ...missingActionBtnStyle, color: "#777", borderColor: "#d8dde3" }}
                          disabled={resolving}
                          onClick={() => undoMissing(li.name)}
                        >
                          Undo Report
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Digital gathering checklist — only the volunteer(s) this
              order is assigned to, or a full admin, can check items off
              as they're physically gathered, or report one as a
              "can't find" (see canToggleGathered above); anyone else
              with Orders access can still see it and its progress,
              read-only. Saved on the order itself (pickingChecklist +
              missingItems, both keyed by item name) so progress is
              shared live across everyone looking at this order, same
              as the review/assignment steps above, and survives a
              page refresh or switching devices. Gates Mark Ready: every
              item must be either checked off or have its "can't find"
              report resolved. */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#888" }}>
                Gathering Checklist
              </div>
              <div style={S.tinyMuted}>
                {gatheredCount} of {totalCount} gathered
              </div>
            </div>
            {!canToggleGathered && (
              <div style={{ ...S.tinyMuted, fontSize: 11, marginBottom: 2 }}>
                Only {order.assignedFillers.join(" or ")} (or an admin) can check these off.
              </div>
            )}
            <div style={{ ...S.summaryListWrap, marginTop: 4 }}>
              {groupByCategory(order.lineItems).map((group) => (
                <div key={group.category}>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "#888", margin: "8px 0 2px" }}>
                    {group.category}
                  </div>
                  {group.items.map((li, idx) => {
                    const checked = Boolean(pickingChecklist[li.name]);
                    const missing = missingItems[li.name];
                    return (
                      <div key={idx} style={{ ...S.summaryRow, alignItems: "center", gap: 8 }}>
                        {li.thumbnail ? (
                          <img
                            src={li.thumbnail}
                            alt={li.name}
                            onClick={() => setChecklistLightbox({ src: li.thumbnail, name: li.name })}
                            style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", cursor: "zoom-in", flexShrink: 0 }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              background: "#f0f0f0",
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 9,
                              color: "#bbb",
                              textAlign: "center",
                              lineHeight: 1.1,
                            }}
                          >
                            No photo
                          </div>
                        )}
                        {missing ? (
                          // Once a "can't find" has been reported, the
                          // checkbox itself is hidden rather than just
                          // left checkable — checking it would silently
                          // wipe out the report and its notes (see
                          // toggleGathered), so there's nothing here
                          // that can clear it by an accidental tap.
                          // Undoing a report is a deliberate action,
                          // done from the "Undo Report" button in Items
                          // Needing Attention above, not this checkbox.
                          <span style={{ flex: 1, color: "#999" }}>{li.name}</span>
                        ) : (
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flex: 1,
                              cursor: canToggleGathered ? "pointer" : "default",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!canToggleGathered}
                              onChange={() => toggleGathered(li.name)}
                              style={{ width: 16, height: 16, flexShrink: 0 }}
                            />
                            <span style={{ flex: 1, textDecoration: checked ? "line-through" : "none", color: checked ? "#999" : "inherit" }}>
                              {li.name}
                            </span>
                          </label>
                        )}
                        {!checked &&
                          (missing ? (
                            missing.resolved ? (
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#2471a3", whiteSpace: "nowrap" }}>
                                {missing.resolution === "substitute" ? `Substituted: ${missing.substituteName}` : "Marked Unavailable"}
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#c0392b", whiteSpace: "nowrap" }}>Can't Find Reported</span>
                            )
                          ) : (
                            canToggleGathered && (
                              <button
                                type="button"
                                onClick={() => reportMissing(li.name)}
                                style={{
                                  background: "none",
                                  border: "1px solid #e0a39c",
                                  color: "#c0392b",
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: "3px 8px",
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Can't Find
                              </button>
                            )
                          ))}
                        <span style={S.summaryQty}>×{li.qty}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <label style={{ ...S.fieldLabel, marginTop: 10 }}>
            Point of Contact (for pickup/drop-off — included in the ready email)
            <select style={S.fieldInput} value={pointOfContactId} onChange={(e) => setPointOfContactId(e.target.value)}>
              <option value="">Select a volunteer…</option>
              {volunteers.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <button
            style={{ ...S.primaryBtn, marginTop: 10, ...(sending || !pointOfContactId || !allGathered ? S.btnDisabled : {}) }}
            disabled={sending || !pointOfContactId || !allGathered}
            onClick={handleMarkReady}
          >
            {sending ? "Marking Ready…" : "Mark Ready & Notify Requester"}
          </button>
          {!allGathered && (
            <div style={{ ...S.tinyMuted, fontSize: 11, marginTop: 6 }}>
              {unresolvedMissing.length > 0
                ? "Resolve the item(s) needing attention above before marking this order ready."
                : "Check off every item on the Gathering Checklist above before marking this order ready."}
            </div>
          )}
        </div>
      )}

      {/* Fulfilled: waiting on the requester to check items back in */}
      {order.status === "fulfilled" && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
          <div style={S.tinyMuted}>
            Reviewed by {order.reviewedBy.join(", ") || "—"} · Filled by {order.assignedFillers.join(", ") || "—"}
          </div>
          {order.pointOfContactName && (
            <div style={S.tinyMuted}>
              Point of Contact: {order.pointOfContactName}
              {order.pointOfContactPhone ? ` · ${order.pointOfContactPhone}` : ""}
            </div>
          )}
          <div style={{ ...S.tinyMuted, marginTop: 4 }}>Ready for pickup — waiting on the requester to check items back in.</div>
          <button style={{ ...S.secondaryBtn, marginTop: 10 }} disabled={resendingReady} onClick={handleResendReady}>
            {resendingReady ? "Sending…" : "Resend Ready Email to Requester"}
          </button>
          {resendReadyFlash && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                marginTop: 6,
                color: resendReadyFlash.tone === "error" ? "#c0392b" : "#1e8449",
              }}
            >
              {resendReadyFlash.text}
            </div>
          )}
          {renderResendBlock()}
        </div>
      )}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <button style={editLinkStyle} onClick={onEditOrder}>
            Edit Items
          </button>
          <button style={editLinkStyle} onClick={handlePrintOrder}>
            Print / Download Order
          </button>
        </div>
        {canCancel ? (
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            {canMoveBack && (
              <button style={editLinkStyle} disabled={movingBack} onClick={handleMoveBack}>
                {movingBack ? "Moving…" : "Move Back to Picking"}
              </button>
            )}
            <button style={editLinkStyle} disabled={archiving} onClick={handleArchive}>
              {archiving ? "Archiving…" : "Archive Order"}
            </button>
            <button style={cancelLinkStyle} disabled={cancelling} onClick={handleCancel}>
              {cancelling ? "Cancelling…" : "Cancel Order"}
            </button>
          </div>
        ) : (
          <span style={{ ...S.tinyMuted, fontSize: 11 }}>
            Only the reviewer or an admin can cancel or archive this order.
          </span>
        )}
      </div>

      {checklistLightbox && (
        <Lightbox
          images={[checklistLightbox.src]}
          alt={checklistLightbox.name}
          onClose={() => setChecklistLightbox(null)}
        />
      )}
    </div>
  );
}

function DraftCard({ draft, canCancel, onCancel, onEditDraft }) {
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      await onCancel(draft);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div style={S.card}>
      <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a2e" }}>
        {draft.requesterName || "Unnamed requester"}
      </div>
      <div style={orderDetailTextStyle}>
        {draft.requesterPhone || "—"}
        {draft.requesterEmail ? ` · ${draft.requesterEmail}` : ""}
        <br />
        {draft.circuit || "—"} · {draft.eventType || "—"} · Event {draft.eventDate || "—"} · Pickup{" "}
        {draft.pickupDate || "—"} · Return {draft.returnDate || "—"}
      </div>
      {draft.hasReturner && (
        <div style={{ ...orderDetailTextStyle, marginTop: 6 }}>
          <strong>Returning:</strong> {draft.returnerName || "—"}
          {draft.returnerPhone ? ` · ${draft.returnerPhone}` : ""}
          {draft.returnerEmail ? ` · ${draft.returnerEmail}` : ""}
          {draft.returnerCircuit ? ` · ${draft.returnerCircuit}` : ""}
        </div>
      )}
      {draft.notes && (
        <div style={{ ...S.tinyMuted, marginTop: 8 }}>
          <strong>Notes:</strong> {draft.notes}
        </div>
      )}

      <div style={{ ...S.summaryListWrap, marginTop: 10 }}>
        {(!draft.items || draft.items.length === 0) && (
          <div style={S.tinyMuted}>No items picked yet.</div>
        )}
        {(draft.items || []).map((li, idx) => (
          <div key={idx} style={S.summaryRow}>
            <span>{li.name}</span>
            <span style={S.summaryQty}>×{li.qty}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button style={editLinkStyle} onClick={() => onEditDraft(draft)}>
          Edit Items
        </button>
        {canCancel ? (
          <button style={cancelLinkStyle} disabled={cancelling} onClick={handleCancel}>
            {cancelling ? "Cancelling…" : "Cancel This Draft"}
          </button>
        ) : (
          <span style={{ ...S.tinyMuted, fontSize: 11 }}>Only the reviewer or an admin can cancel this.</span>
        )}
      </div>
    </div>
  );
}

function StatusTag({ status }) {
  const map = {
    submitted: { label: "Needs Review", style: { background: "#fdecea", color: "#c0392b" } },
    reviewed: { label: "Needs Assignment", style: { background: "#fff4e5", color: "#8a5a00" } },
    assigned: { label: "Being Filled", style: { background: "#eaf3fc", color: "#2471a3" } },
    fulfilled: { label: "Ready for Pickup", style: { background: "#e9f9ef", color: "#1e8449" } },
  };
  const cfg = map[status] || map.submitted;
  return (
    <span
      style={{
        ...cfg.style,
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 20,
        padding: "2px 10px",
        textTransform: "uppercase",
        letterSpacing: 0.3,
      }}
    >
      {cfg.label}
    </span>
  );
}

const reactivatedTagStyle = {
  background: "#f0e6fb",
  color: "#6c3483",
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 12,
  padding: "1px 8px",
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const needsReviewBannerStyle = {
  background: "#fdecea",
  border: "1px solid #f5b7b1",
  color: "#c0392b",
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 14,
};

const orderDetailTextStyle = {
  fontSize: 14,
  color: "#333",
  lineHeight: 1.6,
  marginTop: 4,
};

const editLinkStyle = {
  background: "none",
  border: "none",
  color: "#0072CE",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  padding: 0,
};

const cancelLinkStyle = {
  background: "none",
  border: "none",
  color: "#c0392b",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  padding: 0,
};

// Basic HTML-escaping for the standalone printable page below — a
// requester name, note, or item containing &, <, or > should never
// break that page's markup.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

// Builds a complete, self-contained printable page for one order —
// opened in its own browser tab by handlePrintOrder above. Kept as
// plain HTML/CSS (not React) since it's a wholly separate document.
// Each category (Stage, Audio, Signage, etc.) gets its own sheet of
// paper — a hard page break after every category except the last —
// with the requester/event header repeated at the top of every sheet,
// so if a department's page gets handed off or separated from the
// rest, whoever's holding it can still tell whose order it is and
// what it's for. Has its own visible "Print / Save as PDF" button
// plus an attempt to open the print dialog automatically as soon as
// the tab finishes loading.
function buildOrderPrintHtml(order) {
  const groups = groupByCategory(order.lineItems);

  const headerHtml = `
  <h2>${escapeHtml(order.requesterName || "Unnamed requester")}</h2>
  <p class="meta">
    ${escapeHtml(order.requesterPhone || "—")}${order.requesterEmail ? ` · ${escapeHtml(order.requesterEmail)}` : ""}<br/>
    ${escapeHtml(order.circuit || "—")} · ${escapeHtml(order.eventType || "—")} · Event ${escapeHtml(
    order.eventDate || "—"
  )} · Pickup ${escapeHtml(order.pickupDate || "—")} · Return ${escapeHtml(order.returnDate || "—")}
  </p>
  ${
    order.hasReturner
      ? `<p class="meta"><strong>Returning:</strong> ${escapeHtml(order.returnerName || "—")}${
          order.returnerPhone ? ` · ${escapeHtml(order.returnerPhone)}` : ""
        }${order.returnerEmail ? ` · ${escapeHtml(order.returnerEmail)}` : ""}${
          order.returnerCircuit ? ` · ${escapeHtml(order.returnerCircuit)}` : ""
        }</p>`
      : ""
  }
  ${order.notes ? `<p class="meta"><strong>Notes:</strong> ${escapeHtml(order.notes)}</p>` : ""}`;

  const pageGroups = groups.length > 0 ? groups : [{ category: "Items", items: [] }];

  const sheetsHtml = pageGroups
    .map((group, idx) => {
      const itemRows =
        group.items
          .map(
            (li) => `
          <tr>
            <td>${escapeHtml(li.name)}${!li.exists ? " (item no longer in catalog)" : ""}</td>
            <td class="qty">${escapeHtml(li.qty)}</td>
          </tr>`
          )
          .join("") || `<tr><td colspan="2">(none)</td></tr>`;
      const isLast = idx === pageGroups.length - 1;
      return `
  <div class="sheet${isLast ? "" : " page-break"}">
    ${headerHtml}
    <div class="dept">${escapeHtml(group.category)}</div>
    <table>
      <thead><tr><th>Item</th><th class="qty">Requested</th></tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Order — ${escapeHtml(order.requesterName || "Unnamed requester")}</title>
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a2e; padding: 24px; max-width: 700px; margin: 0 auto; }
  h2 { margin-bottom: 4px; }
  .meta { font-size: 12px; color: #666; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; font-size: 13px; }
  td.qty { text-align: center; font-weight: 700; width: 90px; }
  .dept { font-weight: 800; text-transform: uppercase; font-size: 13px; color: #0072CE; margin-top: 18px; }
  .printbar { margin-bottom: 16px; }
  .printbar button { font-size: 14px; font-weight: 700; padding: 10px 18px; border-radius: 8px; border: none; background: #0072CE; color: #fff; cursor: pointer; }
  .page-break { page-break-after: always; break-after: page; }
  @media print { .printbar { display: none; } }
</style>
</head>
<body>
  <div class="printbar"><button onclick="window.print()">Print / Save as PDF</button></div>
  ${sheetsHtml}
  <script>
    window.addEventListener("load", function () {
      try { window.print(); } catch (e) {}
    });
  </script>
</body>
</html>`;
}
