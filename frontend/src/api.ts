export type PhysicalStatus = "FREE" | "OCCUPIED";
export type ReservationStatus = "AVAILABLE" | "RESERVED";
export type DisplayStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED";
export type OccupancySource = "CAMERA" | "SENSOR";
export type ReservationLifecycleStatus =
  | "ACTIVE"
  | "IN_USE"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export interface ParkingSlot {
  id: number;
  name: string;
  physical_status: PhysicalStatus;
  reservation_status: ReservationStatus;
  display_status: DisplayStatus;
  configured_source: OccupancySource;
  occupancy_source: OccupancySource | null;
  updated_at: string;
}

export interface ParkingSlotsResponse {
  slots: ParkingSlot[];
}

export interface OccupancyUpdate {
  slot_id: number;
  physical_status: PhysicalStatus;
  source: OccupancySource;
}

export interface ReservationCreate {
  slot_id: number;
  phone_number: string;
  vehicle_number: string;
}

export interface Reservation {
  id: number;
  slot_id: number;
  phone_number: string;
  vehicle_number: string;
  status: ReservationLifecycleStatus;
  created_at: string;
  expires_at: string | null;
}

export interface ReservationsResponse {
  reservations: Reservation[];
}

export type VehicleParkingStatus = "PARKED" | "RESERVED_NOT_PARKED";

export interface VehicleLocation {
  vehicle_number: string;
  parking_status: VehicleParkingStatus;
  slot_id: number;
  slot_name: string;
  physical_status: PhysicalStatus;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

export async function fetchParkingSlots(
  signal?: AbortSignal,
): Promise<ParkingSlot[]> {
  const response = await fetch(`${API_BASE_URL}/api/slots`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Parking server returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as ParkingSlotsResponse;
  if (!Array.isArray(data.slots)) {
    throw new Error("Parking server returned an unexpected response");
  }

  return data.slots;
}

export async function updateOccupancy(
  update: OccupancyUpdate,
): Promise<ParkingSlot> {
  const response = await fetch(`${API_BASE_URL}/api/slots/occupancy`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    throw await parseApiError(response, "Unable to update slot occupancy");
  }

  return (await response.json()) as ParkingSlot;
}

async function parseApiError(
  response: Response,
  fallbackMessage: string,
): Promise<ApiError> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") {
      return new ApiError(response.status, body.detail);
    }
  } catch {
    // Use the safe fallback when the server does not return JSON.
  }

  return new ApiError(response.status, fallbackMessage);
}

export async function createReservation(
  reservation: ReservationCreate,
): Promise<Reservation> {
  const response = await fetch(`${API_BASE_URL}/api/reservations`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reservation),
  });

  if (!response.ok) {
    throw await parseApiError(response, "Unable to create reservation");
  }

  return (await response.json()) as Reservation;
}

export async function fetchReservations(): Promise<Reservation[]> {
  const response = await fetch(`${API_BASE_URL}/api/reservations`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw await parseApiError(response, "Unable to fetch reservations");
  }

  const data = (await response.json()) as ReservationsResponse;
  if (!Array.isArray(data.reservations)) {
    throw new Error("Parking server returned an unexpected response");
  }

  return data.reservations;
}

export async function cancelReservation(
  reservationId: number,
): Promise<Reservation> {
  const response = await fetch(
    `${API_BASE_URL}/api/reservations/${reservationId}`,
    {
      method: "DELETE",
      headers: { Accept: "application/json" },
    },
  );

  if (!response.ok) {
    throw await parseApiError(response, "Unable to cancel reservation");
  }

  return (await response.json()) as Reservation;
}

export async function fetchVehicleLocation(
  vehicleNumber: string,
): Promise<VehicleLocation> {
  const encodedVehicleNumber = encodeURIComponent(vehicleNumber);
  const response = await fetch(
    `${API_BASE_URL}/api/vehicles/${encodedVehicleNumber}/location`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw await parseApiError(response, "Unable to locate vehicle");
  }

  return (await response.json()) as VehicleLocation;
}
