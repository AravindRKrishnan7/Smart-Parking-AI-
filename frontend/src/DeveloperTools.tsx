import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ApiError,
  cancelReservation,
  fetchParkingSlots,
  fetchReservations,
  fetchServiceCatalogue,
  fetchServiceRequests,
  updateOccupancy,
  updateServiceRequestStatus,
  type ParkingSlot,
  type PhysicalStatus,
  type Reservation,
  type ServiceCatalogueItem,
  type ServiceRequest,
  type ServiceRequestStatus,
} from "./api";

interface DeveloperToolsProps {
  slots: ParkingSlot[];
  slotsLoading: boolean;
  slotsError: string | null;
  refreshSlots: (force?: boolean) => Promise<void>;
}

interface Feedback {
  kind: "success" | "error";
  message: string;
}

const CURRENT_STATUSES = new Set(["ACTIVE", "IN_USE"]);
const CURRENT_SERVICE_STATUSES = new Set(["REQUESTED", "ACCEPTED", "IN_PROGRESS"]);
const STATUS_PRIORITY: Record<Reservation["status"], number> = {
  ACTIVE: 0,
  IN_USE: 1,
  COMPLETED: 2,
  CANCELLED: 3,
  EXPIRED: 4,
};

const SERVICE_STATUS_PRIORITY: Record<ServiceRequestStatus, number> = {
  REQUESTED: 0,
  ACCEPTED: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
  CANCELLED: 4,
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function ReservationCard({
  reservation,
  slotName,
  busy,
  onCancel,
}: {
  reservation: Reservation;
  slotName: string;
  busy: boolean;
  onCancel: (reservation: Reservation) => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-black text-slate-900">
            #{reservation.id} · {reservation.vehicle_number}
          </div>
          <div className="mt-0.5 text-xs font-semibold text-slate-500">
            {slotName} (ID {reservation.slot_id}) · {reservation.phone_number}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-black tracking-wide ${
            reservation.status === "ACTIVE"
              ? "bg-orange-100 text-orange-700"
              : reservation.status === "IN_USE"
                ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {reservation.status}
        </span>
      </div>
      <div className="mt-2 text-[11px] font-medium text-slate-400">
        Created {formatCreatedAt(reservation.created_at)}
      </div>
      {reservation.status === "ACTIVE" && (
        <button
          type="button"
          onClick={() => onCancel(reservation)}
          disabled={busy}
          className="mt-3 w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Cancelling…" : "Cancel Reservation"}
        </button>
      )}
      {reservation.status === "IN_USE" && (
        <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">
          Parking session in use — set occupancy FREE to complete session.
        </p>
      )}
    </article>
  );
}

function ServiceProviderCard({
  request,
  serviceName,
  slotName,
  busy,
  onUpdate,
}: {
  request: ServiceRequest;
  serviceName: string;
  slotName: string;
  busy: boolean;
  onUpdate: (request: ServiceRequest, status: ServiceRequestStatus) => void;
}) {
  return (
    <article className="rounded-xl border border-violet-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-black text-slate-900">
            #{request.id} · {serviceName}
          </div>
          <div className="mt-0.5 text-xs font-semibold text-slate-500">
            {request.vehicle_number} · {slotName}
          </div>
        </div>
        <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black tracking-wide text-violet-700">
          {request.status.replace(/_/g, " ")}
        </span>
      </div>

      {request.status === "REQUESTED" && (
        <button
          type="button"
          onClick={() => onUpdate(request, "ACCEPTED")}
          disabled={busy}
          className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Updating…" : "Accept"}
        </button>
      )}
      {request.status === "ACCEPTED" && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onUpdate(request, "IN_PROGRESS")}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Updating…" : "Start Service"}
          </button>
          <button
            type="button"
            onClick={() => onUpdate(request, "CANCELLED")}
            disabled={busy}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
      {request.status === "IN_PROGRESS" && (
        <button
          type="button"
          onClick={() => onUpdate(request, "COMPLETED")}
          disabled={busy}
          className="mt-3 w-full rounded-lg bg-green-600 px-3 py-2 text-xs font-black text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Updating…" : "Complete"}
        </button>
      )}
    </article>
  );
}

export default function DeveloperTools({
  slots,
  slotsLoading,
  slotsError,
  refreshSlots,
}: DeveloperToolsProps) {
  const [open, setOpen] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [serviceCatalogue, setServiceCatalogue] = useState<ServiceCatalogueItem[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [serviceHistoryOpen, setServiceHistoryOpen] = useState(false);

  const loadReservations = useCallback(async () => {
    setReservationsLoading(true);
    try {
      const nextReservations = await fetchReservations();
      setReservations(nextReservations);
      return nextReservations;
    } finally {
      setReservationsLoading(false);
    }
  }, []);

  const loadServices = useCallback(async () => {
    setServicesLoading(true);
    try {
      const [nextCatalogue, nextRequests] = await Promise.all([
        fetchServiceCatalogue(),
        fetchServiceRequests(),
      ]);
      setServiceCatalogue(nextCatalogue);
      setServiceRequests(nextRequests);
      return nextRequests;
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const refreshState = useCallback(async () => {
    setFeedback(null);
    try {
      await Promise.all([refreshSlots(true), loadReservations(), loadServices()]);
      setFeedback({ kind: "success", message: "Backend state refreshed." });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: `Refresh failed: ${errorMessage(error)}`,
      });
    }
  }, [loadReservations, loadServices, refreshSlots]);

  useEffect(() => {
    if (!open) return;
    void refreshState();
  }, [open, refreshState]);

  const sortedReservations = useMemo(
    () =>
      [...reservations].sort(
        (left, right) =>
          STATUS_PRIORITY[left.status] - STATUS_PRIORITY[right.status] ||
          right.id - left.id,
      ),
    [reservations],
  );
  const currentReservations = sortedReservations.filter((reservation) =>
    CURRENT_STATUSES.has(reservation.status),
  );
  const historicalReservations = sortedReservations.filter(
    (reservation) => !CURRENT_STATUSES.has(reservation.status),
  );
  const sortedServiceRequests = useMemo(
    () =>
      [...serviceRequests].sort(
        (left, right) =>
          SERVICE_STATUS_PRIORITY[left.status] - SERVICE_STATUS_PRIORITY[right.status] ||
          right.id - left.id,
      ),
    [serviceRequests],
  );
  const currentServiceRequests = sortedServiceRequests.filter((request) =>
    CURRENT_SERVICE_STATUSES.has(request.status),
  );
  const historicalServiceRequests = sortedServiceRequests.filter(
    (request) => !CURRENT_SERVICE_STATUSES.has(request.status),
  );
  const serviceNames = useMemo(
    () => new Map(serviceCatalogue.map((service) => [service.service_type, service.name])),
    [serviceCatalogue],
  );
  const slotNames = useMemo(
    () => new Map(slots.map((slot) => [slot.id, slot.name])),
    [slots],
  );

  const setSlotStatus = async (
    slot: ParkingSlot,
    physicalStatus: PhysicalStatus,
  ) => {
    const key = `slot-${slot.id}`;
    if (actionKey) return;
    setActionKey(key);
    setFeedback(null);
    try {
      await updateOccupancy({
        slot_id: slot.id,
        physical_status: physicalStatus,
        source: slot.configured_source,
      });
      await Promise.all([refreshSlots(true), loadReservations(), loadServices()]);
      setFeedback({
        kind: "success",
        message:
          physicalStatus === "OCCUPIED"
            ? `${slot.name} set to OCCUPIED.`
            : `${slot.name} returned to FREE.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setActionKey(null);
    }
  };

  const cancelActiveReservation = async (reservation: Reservation) => {
    const key = `reservation-${reservation.id}`;
    if (actionKey) return;
    setActionKey(key);
    setFeedback(null);
    try {
      await cancelReservation(reservation.id);
      await Promise.all([refreshSlots(true), loadReservations(), loadServices()]);
      setFeedback({
        kind: "success",
        message: `Reservation #${reservation.id} cancelled.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setActionKey(null);
    }
  };

  const updateProviderService = async (
    request: ServiceRequest,
    status: ServiceRequestStatus,
  ) => {
    const key = `service-${request.id}`;
    if (actionKey) return;
    setActionKey(key);
    setFeedback(null);
    try {
      await updateServiceRequestStatus(request.id, status);
      await loadServices();
      setFeedback({
        kind: "success",
        message: `Service #${request.id} moved to ${status.replace(/_/g, " ")}.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", message: errorMessage(error) });
    } finally {
      setActionKey(null);
    }
  };

  const resetDemoState = async () => {
    if (actionKey) return;
    const confirmed = window.confirm(
      "Reset the demo state? Active reservations will be cancelled and occupied slots will be set to FREE.",
    );
    if (!confirmed) return;

    setActionKey("reset");
    setFeedback(null);
    let step = "fetch current state";

    try {
      let resetServices = await fetchServiceRequests();
      for (const serviceRequest of resetServices.filter(
        (item) => item.status === "REQUESTED" || item.status === "ACCEPTED",
      )) {
        step = `cancel ${serviceRequest.status} service #${serviceRequest.id}`;
        await updateServiceRequestStatus(serviceRequest.id, "CANCELLED");
      }

      let resetReservations = await fetchReservations();
      let resetSlots = await fetchParkingSlots();
      let slotsById = new Map(resetSlots.map((slot) => [slot.id, slot]));

      for (const reservation of resetReservations.filter(
        (item) => item.status === "IN_USE",
      )) {
        const slot = slotsById.get(reservation.slot_id);
        if (slot?.physical_status !== "OCCUPIED") continue;
        step = `complete IN_USE reservation #${reservation.id} at ${slot.name}`;
        await updateOccupancy({
          slot_id: slot.id,
          physical_status: "FREE",
          source: slot.configured_source,
        });
      }

      resetReservations = await fetchReservations();
      for (const reservation of resetReservations.filter(
        (item) => item.status === "ACTIVE",
      )) {
        step = `cancel ACTIVE reservation #${reservation.id}`;
        await cancelReservation(reservation.id);
      }

      resetSlots = await fetchParkingSlots();
      for (const slot of resetSlots.filter(
        (item) => item.physical_status === "OCCUPIED",
      )) {
        step = `set remaining occupied slot ${slot.name} to FREE`;
        await updateOccupancy({
          slot_id: slot.id,
          physical_status: "FREE",
          source: slot.configured_source,
        });
      }

      step = "verify clean demo state";
      const [verifiedSlots, verifiedReservations, verifiedServices] = await Promise.all([
        fetchParkingSlots(),
        fetchReservations(),
        fetchServiceRequests(),
      ]);
      const remainingSessions = verifiedReservations.filter((item) =>
        CURRENT_STATUSES.has(item.status),
      );
      const nonFreeSlots = verifiedSlots.filter(
        (item) => item.physical_status !== "FREE",
      );
      const unavailableSlots = verifiedSlots.filter(
        (item) => item.display_status !== "AVAILABLE",
      );
      const cancellableServices = verifiedServices.filter(
        (item) => item.status === "REQUESTED" || item.status === "ACCEPTED",
      );

      if (
        remainingSessions.length > 0 ||
        nonFreeSlots.length > 0 ||
        unavailableSlots.length > 0 ||
        cancellableServices.length > 0
      ) {
        const details = [
          remainingSessions.length
            ? `${remainingSessions.length} current reservation(s)`
            : null,
          nonFreeSlots.length
            ? `${nonFreeSlots.length} occupied slot(s)`
            : null,
          unavailableSlots.length
            ? `${unavailableSlots.length} unavailable slot(s)`
            : null,
          cancellableServices.length
            ? `${cancellableServices.length} cancellable service(s)`
            : null,
        ]
          .filter(Boolean)
          .join(", ");
        throw new Error(`verification found ${details}`);
      }

      setReservations(verifiedReservations);
      setServiceRequests(verifiedServices);
      await refreshSlots(true);
      const inProgressServices = verifiedServices.filter(
        (item) => item.status === "IN_PROGRESS",
      );
      setFeedback({
        kind: "success",
        message: inProgressServices.length
          ? `Demo state reset; ${inProgressServices.length} in-progress service(s) remain for provider completion.`
          : "Demo state reset successfully.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: `Reset failed while trying to ${step}: ${errorMessage(error)}`,
      });
      try {
        await Promise.all([refreshSlots(true), loadReservations(), loadServices()]);
      } catch {
        // Keep the original reset error visible if refreshing also fails.
      }
    } finally {
      setActionKey(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 rounded-full border border-slate-500 bg-slate-900 px-4 py-3 text-xs font-black text-white shadow-2xl transition hover:bg-slate-800 sm:bottom-6 sm:right-6"
      >
        Developer Tools
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45" role="presentation">
          <button
            type="button"
            aria-label="Close developer tools"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="developer-tools-title"
            className="relative flex h-full w-full max-w-xl flex-col overflow-hidden bg-slate-100 shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 bg-slate-900 px-4 py-4 text-white sm:px-6">
              <div>
                <h2 id="developer-tools-title" className="text-lg font-black">
                  Development / Demo Controls
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-300">
                  Not part of the driver-facing application. Service controls show no phone data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm font-black hover:bg-white/20"
              >
                Close
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void refreshState()}
                  disabled={Boolean(actionKey) || reservationsLoading}
                  className="rounded-xl bg-blue-600 px-3 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reservationsLoading ? "Refreshing…" : "Refresh State"}
                </button>
                <button
                  type="button"
                  onClick={() => void resetDemoState()}
                  disabled={Boolean(actionKey)}
                  className="rounded-xl border-2 border-red-300 bg-red-50 px-3 py-3 text-sm font-black text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionKey === "reset" ? "Resetting…" : "Reset Demo State"}
                </button>
              </div>

              {feedback && (
                <div
                  role={feedback.kind === "error" ? "alert" : "status"}
                  className={`rounded-xl border p-3 text-sm font-bold ${
                    feedback.kind === "error"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-green-200 bg-green-50 text-green-700"
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-black text-slate-900">Live Slots</h3>
                  <span className="text-xs font-bold text-slate-500">
                    {slotsLoading ? "Loading…" : `${slots.length} slots`}
                  </span>
                </div>
                {slotsError && (
                  <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">
                    {slotsError}
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2">
                  {slots.map((slot) => {
                    const nextStatus =
                      slot.physical_status === "OCCUPIED" ? "FREE" : "OCCUPIED";
                    const busy = actionKey === `slot-${slot.id}`;
                    return (
                      <article key={slot.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-black text-slate-900">
                            {slot.name} <span className="text-xs text-slate-400">#{slot.id}</span>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
                            {slot.configured_source}
                          </span>
                        </div>
                        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
                          <dt className="font-semibold text-slate-400">Physical</dt>
                          <dd className="min-w-0 text-right font-black text-slate-700">{slot.physical_status}</dd>
                          <dt className="font-semibold text-slate-400">Reservation</dt>
                          <dd className="min-w-0 text-right font-black text-slate-700">{slot.reservation_status}</dd>
                          <dt className="font-semibold text-slate-400">Display</dt>
                          <dd className="min-w-0 text-right font-black text-slate-700">{slot.display_status}</dd>
                        </dl>
                        <button
                          type="button"
                          onClick={() => void setSlotStatus(slot, nextStatus)}
                          disabled={Boolean(actionKey)}
                          className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-black text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            nextStatus === "OCCUPIED"
                              ? "bg-red-600 hover:bg-red-700"
                              : "bg-green-600 hover:bg-green-700"
                          }`}
                        >
                          {busy
                            ? "Updating…"
                            : nextStatus === "OCCUPIED"
                              ? "Set Occupied"
                              : "Set Free"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-black text-slate-900">Current Reservations</h3>
                  <span className="text-xs font-bold text-slate-500">
                    {currentReservations.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {currentReservations.map((reservation) => (
                    <ReservationCard
                      key={reservation.id}
                      reservation={reservation}
                      slotName={slotNames.get(reservation.slot_id) ?? `Slot ${reservation.slot_id}`}
                      busy={actionKey === `reservation-${reservation.id}`}
                      onCancel={(item) => void cancelActiveReservation(item)}
                    />
                  ))}
                  {!reservationsLoading && currentReservations.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs font-bold text-slate-500">
                      No ACTIVE or IN_USE reservations.
                    </p>
                  )}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-black text-slate-900">Service Provider Controls</h3>
                  <span className="text-xs font-bold text-slate-500">
                    {servicesLoading ? "Loading…" : currentServiceRequests.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {currentServiceRequests.map((request) => (
                    <ServiceProviderCard
                      key={request.id}
                      request={request}
                      serviceName={serviceNames.get(request.service_type) ?? request.service_type}
                      slotName={slotNames.get(request.slot_id) ?? `Slot ${request.slot_id}`}
                      busy={actionKey === `service-${request.id}`}
                      onUpdate={(item, nextStatus) => void updateProviderService(item, nextStatus)}
                    />
                  ))}
                  {!servicesLoading && currentServiceRequests.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs font-bold text-slate-500">
                      No current service requests.
                    </p>
                  )}
                </div>
              </section>

              {historicalServiceRequests.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setServiceHistoryOpen((value) => !value)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700"
                    aria-expanded={serviceHistoryOpen}
                  >
                    Service History ({historicalServiceRequests.length})
                    <span aria-hidden="true">{serviceHistoryOpen ? "−" : "+"}</span>
                  </button>
                  {serviceHistoryOpen && (
                    <div className="mt-3 space-y-3">
                      {historicalServiceRequests.map((request) => (
                        <ServiceProviderCard
                          key={request.id}
                          request={request}
                          serviceName={serviceNames.get(request.service_type) ?? request.service_type}
                          slotName={slotNames.get(request.slot_id) ?? `Slot ${request.slot_id}`}
                          busy={false}
                          onUpdate={() => undefined}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {historicalReservations.length > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((value) => !value)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700"
                    aria-expanded={historyOpen}
                  >
                    History ({historicalReservations.length})
                    <span aria-hidden="true">{historyOpen ? "−" : "+"}</span>
                  </button>
                  {historyOpen && (
                    <div className="mt-3 space-y-3">
                      {historicalReservations.map((reservation) => (
                        <ReservationCard
                          key={reservation.id}
                          reservation={reservation}
                          slotName={slotNames.get(reservation.slot_id) ?? `Slot ${reservation.slot_id}`}
                          busy={false}
                          onCancel={() => undefined}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
