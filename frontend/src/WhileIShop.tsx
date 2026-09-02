import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  createServiceRequest,
  fetchServiceCatalogue,
  fetchServiceRequests,
  fetchVehicleLocation,
  updateServiceRequestStatus,
  type ServiceCatalogueItem,
  type ServiceRequest,
  type ServiceRequestStatus,
  type VehicleLocation,
} from "./api";

interface WhileIShopProps {
  initialVehicleNumber: string;
}

const STATUS_STEPS: Array<{ status: ServiceRequestStatus; label: string }> = [
  { status: "REQUESTED", label: "Requested" },
  { status: "ACCEPTED", label: "Accepted" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "COMPLETED", label: "Completed" },
];

const STATUS_INDEX: Record<ServiceRequestStatus, number> = {
  REQUESTED: 0,
  ACCEPTED: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
  CANCELLED: -1,
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return fallback;
}

function formatPrice(price: number | null): string {
  return price === null ? "Availability request" : `₹${price}`;
}

function formatDuration(minutes: number | null): string {
  return minutes === null ? "Confirmed by provider" : `${minutes} min`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function ServiceStatusCard({
  request,
  definition,
  busy,
  parkingEnded,
  onCancel,
}: {
  request: ServiceRequest;
  definition?: ServiceCatalogueItem;
  busy: boolean;
  parkingEnded: boolean;
  onCancel: (request: ServiceRequest) => void;
}) {
  const currentIndex = STATUS_INDEX[request.status];
  const canCancel = request.status === "REQUESTED" || request.status === "ACCEPTED";

  return (
    <article className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-black text-gray-900">
            {definition?.name ?? request.service_type}
          </h3>
          <p className="mt-0.5 text-xs font-semibold text-gray-500">
            Requested at {formatTime(request.requested_at)} · {formatDuration(request.estimated_duration_minutes)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide ${
          request.status === "COMPLETED"
            ? "bg-green-100 text-green-700"
            : request.status === "CANCELLED"
              ? "bg-gray-100 text-gray-600"
              : request.status === "IN_PROGRESS"
                ? "bg-blue-100 text-blue-700"
                : "bg-orange-100 text-orange-700"
        }`}>
          {request.status.replace("_", " ")}
        </span>
      </div>

      {request.status === "CANCELLED" ? (
        <p className="mt-3 rounded-xl bg-gray-50 p-3 text-xs font-bold text-gray-600">
          This request was cancelled.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-4 gap-1" aria-label={`Service status ${request.status}`}>
          {STATUS_STEPS.map((step, index) => {
            const reached = index <= currentIndex;
            const current = index === currentIndex;
            return (
              <div key={step.status} className="min-w-0 text-center">
                <div className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
                  reached ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-400"
                }`}>
                  {reached && !current ? "✓" : current ? "●" : index + 1}
                </div>
                <div className={`mt-1 text-[9px] font-bold sm:text-[10px] ${reached ? "text-indigo-700" : "text-gray-400"}`}>
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {parkingEnded && request.status === "IN_PROGRESS" && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
          Parking session ended. The provider must complete this in-progress service explicitly.
        </p>
      )}

      {canCancel && (
        <button
          type="button"
          onClick={() => onCancel(request)}
          disabled={busy}
          className="mt-3 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-black text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Cancelling…" : "Cancel Service Request"}
        </button>
      )}
    </article>
  );
}

export default function WhileIShop({ initialVehicleNumber }: WhileIShopProps) {
  const [vehicleNumber, setVehicleNumber] = useState(initialVehicleNumber);
  const [location, setLocation] = useState<VehicleLocation | null>(null);
  const [catalogue, setCatalogue] = useState<ServiceCatalogueItem[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceCatalogueItem | null>(null);
  const [checking, setChecking] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parkingEnded, setParkingEnded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchServiceCatalogue()
      .then((services) => {
        if (!cancelled) setCatalogue(services);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(getErrorMessage(requestError, "Unable to load services."));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!location) return;
    let cancelled = false;

    const pollState = async () => {
      const [requestResult, locationResult] = await Promise.allSettled([
        fetchServiceRequests({ reservationId: location.reservation_id }),
        fetchVehicleLocation(location.vehicle_number),
      ]);
      if (cancelled) return;

      if (requestResult.status === "fulfilled") setRequests(requestResult.value);
      if (locationResult.status === "fulfilled") {
        setLocation(locationResult.value);
        setParkingEnded(false);
      } else if (
        locationResult.reason instanceof ApiError &&
        locationResult.reason.status === 404
      ) {
        setParkingEnded(true);
      }
    };

    void pollState();
    const intervalId = window.setInterval(() => void pollState(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [location?.reservation_id]);

  const catalogueByType = useMemo(
    () => new Map(catalogue.map((service) => [service.service_type, service])),
    [catalogue],
  );
  const categories = useMemo(
    () =>
      Array.from(new Set(catalogue.map((service) => service.category))).map(
        (category) => ({
          category,
          services: catalogue.filter((service) => service.category === category),
        }),
      ),
    [catalogue],
  );
  const isParked = location?.parking_status === "PARKED" && !parkingEnded;

  const checkParkingSession = async () => {
    if (!vehicleNumber.trim() || checking) return;
    setChecking(true);
    setError(null);
    setMessage(null);
    setParkingEnded(false);
    try {
      const nextLocation = await fetchVehicleLocation(vehicleNumber);
      setVehicleNumber(nextLocation.vehicle_number);
      setLocation(nextLocation);
      setRequests(
        await fetchServiceRequests({ reservationId: nextLocation.reservation_id }),
      );
    } catch (requestError) {
      setLocation(null);
      setRequests([]);
      if (requestError instanceof ApiError && requestError.status === 404) {
        setError("No current SmartPark session was found for this vehicle.");
      } else {
        setError(getErrorMessage(requestError, "Unable to check parking session."));
      }
    } finally {
      setChecking(false);
    }
  };

  const confirmService = async () => {
    if (!location || !selectedService || requestBusy) return;
    setRequestBusy(true);
    setError(null);
    try {
      const created = await createServiceRequest({
        reservation_id: location.reservation_id,
        service_type: selectedService.service_type,
      });
      setRequests((current) => [created, ...current]);
      setMessage(`${selectedService.name} requested successfully.`);
      setSelectedService(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to request this service."));
    } finally {
      setRequestBusy(false);
    }
  };

  const cancelRequest = async (request: ServiceRequest) => {
    if (actionId !== null) return;
    setActionId(request.id);
    setError(null);
    try {
      const updated = await updateServiceRequestStatus(request.id, "CANCELLED");
      setRequests((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setMessage(`${catalogueByType.get(request.service_type)?.name ?? "Service"} cancelled.`);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to cancel service request."));
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 py-6 sm:px-8 sm:py-8">
      <section className="rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-600 to-fuchsia-500 p-5 text-white shadow-xl sm:p-7">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-indigo-100">While I Shop</div>
        <h2 className="mt-2 text-2xl font-black" style={{ fontFamily: "'Outfit',sans-serif" }}>
          Make use of your parking time
        </h2>
        <p className="mt-2 max-w-2xl text-sm font-medium text-indigo-100">
          Privacy-conscious exterior and infrastructure services, connected to your confirmed SmartPark session.
        </p>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="text-sm font-bold text-gray-700" htmlFor="while-shop-vehicle">
          Vehicle registration number
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="while-shop-vehicle"
            value={vehicleNumber}
            onChange={(event) => setVehicleNumber(event.target.value.toUpperCase())}
            placeholder="KL07AB1234"
            maxLength={30}
            className="min-w-0 flex-1 rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 font-bold text-gray-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void checkParkingSession()}
            disabled={checking || !vehicleNumber.trim()}
            className="rounded-xl bg-indigo-600 px-5 py-3 font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check parking session"}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700" role="status">
          {message}
        </div>
      )}

      {!isParked && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-center sm:p-7">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-2xl">🔒</div>
          <h3 className="mt-3 text-lg font-black text-amber-900">Available once your vehicle is parked</h3>
          <p className="mx-auto mt-1 max-w-xl text-sm font-semibold text-amber-700">
            While I Shop becomes available once your vehicle is parked and SmartPark has detected the slot as occupied.
          </p>
          {location?.parking_status === "RESERVED_NOT_PARKED" && (
            <p className="mt-3 text-sm font-black text-amber-800">
              {location.vehicle_number} · Slot {location.slot_name} is reserved but not yet parked.
            </p>
          )}
          {parkingEnded && (
            <p className="mt-3 text-sm font-black text-amber-800">
              This parking session has ended. New service requests are disabled.
            </p>
          )}
        </section>
      )}

      {location && (
        <section className="grid grid-cols-2 gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 sm:grid-cols-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Vehicle</div>
            <div className="mt-1 break-all text-sm font-black text-indigo-900">{location.vehicle_number}</div>
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Parking Slot</div>
            <div className="mt-1 text-sm font-black text-indigo-900">{location.slot_name}</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[10px] font-black uppercase tracking-wider text-indigo-400">Parking Status</div>
            <div className="mt-1 text-sm font-black text-indigo-900">
              {parkingEnded ? "SESSION ENDED" : location.parking_status.replace(/_/g, " ")}
            </div>
          </div>
        </section>
      )}

      {requests.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-black text-gray-900">Your Service Requests</h2>
            <span className="text-xs font-bold text-gray-500">Updates every 2 seconds</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {requests.map((request) => (
              <ServiceStatusCard
                key={request.id}
                request={request}
                definition={catalogueByType.get(request.service_type)}
                busy={actionId === request.id}
                parkingEnded={parkingEnded}
                onCancel={(item) => void cancelRequest(item)}
              />
            ))}
          </div>
        </section>
      )}

      {isParked && (
        <section className="space-y-5">
          {categories.map(({ category, services }) => (
            <div key={category}>
              <h2 className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-gray-500">{category}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {services.map((service) => (
                  <article key={service.service_type} className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-black text-gray-900">{service.name}</h3>
                        <p className="mt-1 text-xs font-medium leading-5 text-gray-500">{service.description}</p>
                      </div>
                      <div className="flex-shrink-0 rounded-xl bg-indigo-50 px-2.5 py-2 text-right">
                        <div className="text-sm font-black text-indigo-700">{formatPrice(service.price)}</div>
                        {service.price !== null && <div className="text-[9px] font-bold text-indigo-400">Demo service price</div>}
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3 pt-3">
                      <span className="text-xs font-bold text-gray-500">{formatDuration(service.estimated_duration_minutes)}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedService(service)}
                        className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-700"
                      >
                        Request
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {selectedService && location && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="service-confirm-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-indigo-500">Confirm Service</div>
                <h2 id="service-confirm-title" className="mt-1 text-xl font-black text-gray-900">{selectedService.name}</h2>
              </div>
              <button type="button" onClick={() => setSelectedService(null)} className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-black text-gray-600">Close</button>
            </div>
            <dl className="mt-5 divide-y divide-gray-100 rounded-2xl border border-gray-200 px-4">
              {[
                ["Vehicle", location.vehicle_number],
                ["Parking Slot", location.slot_name],
                ["Estimated time", formatDuration(selectedService.estimated_duration_minutes)],
                ["Demo price", formatPrice(selectedService.price)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3">
                  <dt className="text-sm font-semibold text-gray-500">{label}</dt>
                  <dd className="text-right text-sm font-black text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs font-semibold text-gray-500">
              Vehicle and slot are automatically derived from your active SmartPark session.
            </p>
            <button
              type="button"
              onClick={() => void confirmService()}
              disabled={requestBusy}
              className="mt-5 w-full rounded-2xl bg-indigo-600 py-3.5 font-black text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {requestBusy ? "Requesting…" : "Confirm Request"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
