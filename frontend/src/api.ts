export type PhysicalStatus = "FREE" | "OCCUPIED";
export type ReservationStatus = "AVAILABLE" | "RESERVED";
export type DisplayStatus = "AVAILABLE" | "RESERVED" | "OCCUPIED";
export type OccupancySource = "CAMERA" | "SENSOR";

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
