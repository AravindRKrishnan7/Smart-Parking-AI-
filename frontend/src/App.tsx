import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ApiError,
  cancelReservation,
  createReservation,
  fetchParkingSlots,
  fetchVehicleLocation,
  type DisplayStatus,
  type ParkingSlot,
  type Reservation,
  type VehicleLocation,
} from "./api";
import DeveloperTools from "./DeveloperTools";

const DEV_TOOLS_ENABLED =
  String(import.meta.env.VITE_ENABLE_DEV_TOOLS).toLowerCase() === "true";

// ─── Types ────────────────────────────────────────────────────────────────────
type Screen =
  | "home"
  | "phone"
  | "otp"
  | "vehicle"
  | "availability"
  | "select-slot"
  | "confirm"
  | "success"
  | "find-car"
  | "car-located";

type UiSlotStatus = Lowercase<DisplayStatus>;

interface ActiveReservation {
  data: Reservation;
  slotName: string;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  car: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M5 17H3a2 2 0 01-2-2v-4l2-5h14l2 5v4a2 2 0 01-2 2h-2" />
      <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
    </svg>
  ),
  locate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
      <path d="M17 7l-1.4 1.4M7 17l-1.4 1.4M17 17l-1.4-1.4M7 7l-1.4-1.4" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.06 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  arrowLeft: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  navigation: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  ),
  parking: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 17V7h4a3 3 0 010 6H9" />
    </svg>
  ),
};

// ─── Shared Components ────────────────────────────────────────────────────────
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-app-shell px-0 py-0 sm:px-5 sm:py-6 lg:px-8 lg:py-10">
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:min-h-[calc(100vh-3rem)] sm:rounded-[2rem] lg:min-h-[calc(100vh-5rem)]">
        <div className="flex flex-1 flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}

function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="bg-blue-600 px-4 py-4 sm:px-8 flex items-center gap-3">
      {onBack && (
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors">
          {Icon.arrowLeft}
        </button>
      )}
      <h1 className="text-white font-bold text-lg sm:text-xl" style={{ fontFamily: "'Outfit',sans-serif" }}>{title}</h1>
    </header>
  );
}

function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold text-base tracking-wide shadow-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ fontFamily: "'Outfit',sans-serif" }}
    >
      {children}
    </button>
  );
}

function InputField({ label, value, onChange, placeholder, type = "text", maxLength }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; maxLength?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-gray-600">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 text-gray-800 font-semibold text-base focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-300 bg-gray-50 focus:bg-white"
      />
    </div>
  );
}

function phoneValidationMessage(phone: string): string | null {
  const trimmed = phone.trim();
  const hasLeadingPlus = trimmed.startsWith("+");
  const normalized = trimmed.replace(/[\s\-()]/g, "");
  const digits = hasLeadingPlus ? normalized.slice(1) : normalized;

  if (!/^\d{8,15}$/.test(digits)) {
    return "Enter a valid phone number with 8 to 15 digits.";
  }

  return null;
}

function vehicleValidationMessage(vehicle: string): string | null {
  const normalized = vehicle.toUpperCase().replace(/\s/g, "");
  if (!normalized) return "Enter your vehicle registration number.";
  if (normalized.length > 20) {
    return "Vehicle registration must be 20 characters or fewer.";
  }
  return null;
}

function toUiSlotStatus(displayStatus: DisplayStatus): UiSlotStatus {
  return displayStatus.toLowerCase() as UiSlotStatus;
}

function SlotBadge({ slot, selected, onClick }: { slot: ParkingSlot; selected?: boolean; onClick?: () => void }) {
  const status = toUiSlotStatus(slot.display_status);
  const isSelectable = status === "available" && Boolean(onClick);
  const cls = selected ? "slot-selected" : `slot-${status}`;
  const label = status === "available" ? "Free" : status === "occupied" ? "Busy" : "Held";
  return (
    <button
      type="button"
      onClick={isSelectable ? onClick : undefined}
      disabled={!isSelectable}
      aria-label={`${slot.name}: ${slot.display_status.toLowerCase()}`}
      className={`${cls} min-h-24 rounded-2xl p-3 flex flex-col items-center justify-center gap-1 transition-all ${isSelectable ? "hover:scale-105 cursor-pointer active:scale-95" : "cursor-default"}`}
    >
      <div className="w-6 h-6 opacity-70">{Icon.parking}</div>
      <span className="font-black text-base" style={{ fontFamily: "'Outfit',sans-serif" }}>{slot.name}</span>
      <span className="text-xs font-semibold opacity-80">{label}</span>
    </button>
  );
}

function ConnectionNotice({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) {
    return (
      <div className="connection-notice border-blue-200 bg-blue-50 text-blue-700" role="status">
        <span className="status-dot bg-blue-500" /> Connecting to parking server…
      </div>
    );
  }

  if (error) {
    return (
      <div className="connection-notice border-red-200 bg-red-50 text-red-700" role="alert">
        <span className="status-dot bg-red-500" /> Unable to connect to parking server. Retrying automatically.
      </div>
    );
  }

  return (
    <div className="connection-notice border-green-200 bg-green-50 text-green-700" role="status">
      <span className="status-dot bg-green-500" /> Live availability · updates every 2 seconds
    </div>
  );
}

function SlotGrid({
  slots,
  loading,
  selectedSlot,
  onSelect,
}: {
  slots: ParkingSlot[];
  loading: boolean;
  selectedSlot?: string;
  onSelect?: (slotName: string) => void;
}) {
  if (loading && slots.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Loading parking slots">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return <p className="py-8 text-center text-sm font-semibold text-gray-500">No parking slots are available from the server.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {slots.map((slot) => (
        <SlotBadge
          key={slot.id}
          slot={slot}
          selected={selectedSlot === slot.name}
          onClick={onSelect ? () => onSelect(slot.name) : undefined}
        />
      ))}
    </div>
  );
}

interface LiveSlotProps {
  slots: ParkingSlot[];
  loading: boolean;
  error: string | null;
}

// ─── Screens ──────────────────────────────────────────────────────────────────

function HomeScreen({ navigate, slots, loading, error }: { navigate: (s: Screen) => void } & LiveSlotProps) {
  const counts = useMemo(
    () => ({
      available: slots.filter((slot) => slot.display_status === "AVAILABLE").length,
      occupied: slots.filter((slot) => slot.display_status === "OCCUPIED").length,
      reserved: slots.filter((slot) => slot.display_status === "RESERVED").length,
    }),
    [slots],
  );

  return (
    <AppShell>
      <div className="flex flex-col flex-1">
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 px-6 py-10 text-center sm:px-10 sm:py-12">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-3 pulse-ring">
            <div className="w-9 h-9 text-white">{Icon.parking}</div>
          </div>
          <h1 className="text-white text-3xl sm:text-4xl font-black tracking-tight" style={{ fontFamily: "'Outfit',sans-serif" }}>SmartPark AI</h1>
          <p className="text-blue-100 text-sm sm:text-base font-medium mt-1">Smart Parking, Made Simple</p>
        </div>

        {/* Cards */}
        <div className="mx-auto -mt-6 flex w-full max-w-4xl flex-1 flex-col gap-5 px-4 pb-8 sm:px-8 fade-in">
          <ConnectionNotice loading={loading} error={error} />
          <div className="grid gap-4 md:grid-cols-2">
          <button
            onClick={() => navigate("phone")}
            className="bg-white rounded-3xl p-6 shadow-xl border border-blue-100 flex items-center gap-5 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
              <div className="w-7 h-7 text-white">{Icon.car}</div>
            </div>
            <div className="text-left">
              <div className="text-gray-900 font-black text-lg" style={{ fontFamily: "'Outfit',sans-serif" }}>Reserve a Slot</div>
              <div className="text-gray-500 text-sm font-medium mt-0.5">Book your parking space in seconds</div>
            </div>
            <div className="ml-auto text-blue-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </button>

          <button
            onClick={() => navigate("find-car")}
            className="bg-white rounded-3xl p-6 shadow-xl border border-blue-100 flex items-center gap-5 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <div className="w-14 h-14 bg-cyan-500 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
              <div className="w-7 h-7 text-white">{Icon.locate}</div>
            </div>
            <div className="text-left">
              <div className="text-gray-900 font-black text-lg" style={{ fontFamily: "'Outfit',sans-serif" }}>Find My Car</div>
              <div className="text-gray-500 text-sm font-medium mt-0.5">Locate your vehicle in the lot</div>
            </div>
            <div className="ml-auto text-cyan-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </button>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-3xl p-5 shadow-lg border border-gray-100 mt-2">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Lot Status</div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-3xl font-black text-green-600" style={{ fontFamily: "'Outfit',sans-serif" }}>{counts.available}</div>
                <div className="text-xs font-semibold text-gray-500">Available</div>
              </div>
              <div>
                <div className="text-3xl font-black text-red-500" style={{ fontFamily: "'Outfit',sans-serif" }}>{counts.occupied}</div>
                <div className="text-xs font-semibold text-gray-500">Occupied</div>
              </div>
              <div>
                <div className="text-3xl font-black text-orange-500" style={{ fontFamily: "'Outfit',sans-serif" }}>{counts.reserved}</div>
                <div className="text-xs font-semibold text-gray-500">Reserved</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function PhoneScreen({ navigate, phone, setPhone }: {
  navigate: (s: Screen) => void;
  phone: string;
  setPhone: (phone: string) => void;
}) {
  const [validationError, setValidationError] = useState<string | null>(null);

  const continueToOtp = () => {
    const message = phoneValidationMessage(phone);
    setValidationError(message);
    if (!message) navigate("otp");
  };

  return (
    <AppShell>
      <TopBar title="Enter Phone Number" onBack={() => navigate("home")} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 fade-in">
        <div className="bg-blue-50 rounded-2xl p-4 flex gap-3 items-start">
          <div className="w-8 h-8 text-blue-600 flex-shrink-0 mt-0.5">{Icon.phone}</div>
          <div>
            <div className="font-bold text-gray-800 text-sm">Verify Your Number</div>
            <div className="text-gray-500 text-xs mt-0.5">We'll send a one-time password to confirm your identity.</div>
          </div>
        </div>

        <InputField
          label="Mobile Number"
          value={phone}
          onChange={setPhone}
          placeholder="+91 98765 43210"
          type="tel"
          maxLength={30}
        />

        {validationError && (
          <p className="-mt-3 text-sm font-semibold text-red-600" role="alert">
            {validationError}
          </p>
        )}

        <PrimaryBtn onClick={continueToOtp} disabled={!phone.trim()}>
          Send OTP →
        </PrimaryBtn>

        <p className="text-center text-xs text-gray-400 font-medium">By continuing you agree to our Terms of Service</p>
      </div>
    </AppShell>
  );
}

function OtpScreen({ navigate, phone }: { navigate: (s: Screen) => void; phone: string }) {
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [resent, setResent] = useState(false);

  const handleOtp = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 3) {
      document.getElementById(`otp-${i + 1}`)?.focus();
    }
  };

  const filled = otp.every(d => d !== "");

  return (
    <AppShell>
      <TopBar title="OTP Verification" onBack={() => navigate("phone")} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 fade-in">
        <div className="text-center">
          <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <div className="w-7 h-7 text-blue-600">{Icon.shield}</div>
          </div>
          <p className="text-gray-600 text-sm font-medium">Code sent to <span className="font-bold text-gray-800">{phone}</span></p>
        </div>

        <div className="flex justify-center gap-3">
          {otp.map((d, i) => (
            <input
              key={i}
              id={`otp-${i}`}
              type="tel"
              maxLength={1}
              value={d}
              onChange={e => handleOtp(i, e.target.value)}
              className="w-14 h-14 text-center text-2xl font-black border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-blue-500 bg-gray-50 focus:bg-white transition-all"
              style={{ fontFamily: "'Outfit',sans-serif" }}
            />
          ))}
        </div>

        <PrimaryBtn onClick={() => filled && navigate("vehicle")} disabled={!filled}>
          Verify & Continue →
        </PrimaryBtn>

        <div className="text-center">
          <button
            onClick={() => setResent(true)}
            className="text-blue-600 font-bold text-sm hover:underline"
          >
            {resent ? "✓ OTP Resent" : "Resend OTP"}
          </button>
          {!resent && <p className="text-xs text-gray-400 mt-1">Resend in 30 seconds</p>}
        </div>
      </div>
    </AppShell>
  );
}

function VehicleScreen({ navigate, vehicle, setVehicle }: {
  navigate: (s: Screen) => void;
  vehicle: string;
  setVehicle: (vehicle: string) => void;
}) {
  const [validationError, setValidationError] = useState<string | null>(null);

  const checkAvailability = () => {
    const message = vehicleValidationMessage(vehicle);
    setValidationError(message);
    if (!message) {
      setVehicle(vehicle.toUpperCase().replace(/\s/g, ""));
      navigate("availability");
    }
  };

  return (
    <AppShell>
      <TopBar title="Vehicle Details" onBack={() => navigate("otp")} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 fade-in">
        <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-3 border border-gray-200">
          <div className="w-10 h-10 text-blue-600">{Icon.car}</div>
          <div>
            <div className="font-bold text-gray-800 text-sm">Registration Number</div>
            <div className="text-gray-500 text-xs">Enter as shown on your vehicle (e.g. KL07AB1234)</div>
          </div>
        </div>

        <InputField
          label="Vehicle Registration Number"
          value={vehicle}
          onChange={v => setVehicle(v.toUpperCase())}
          placeholder="KL07AB1234"
          maxLength={30}
        />

        {validationError && (
          <p className="-mt-3 text-sm font-semibold text-red-600" role="alert">
            {validationError}
          </p>
        )}

        <div className="bg-blue-50 rounded-xl p-3 flex gap-2">
          <span className="text-blue-500 text-xs">ℹ️</span>
          <span className="text-blue-700 text-xs font-medium">Enter the number exactly as printed on your number plate, without spaces.</span>
        </div>

        <PrimaryBtn onClick={checkAvailability} disabled={!vehicle.trim()}>
          Check Availability →
        </PrimaryBtn>
      </div>
    </AppShell>
  );
}

function AvailabilityScreen({ navigate, vehicle, slots, loading, error, notice }: {
  navigate: (s: Screen) => void;
  vehicle: string;
  notice?: string | null;
} & LiveSlotProps) {
  const legend = [
    { cls: "bg-green-100 border-green-400 text-green-700", label: "Available" },
    { cls: "bg-red-100 border-red-400 text-red-600", label: "Occupied" },
    { cls: "bg-orange-100 border-orange-400 text-orange-600", label: "Reserved" },
  ];
  return (
    <AppShell>
      <TopBar title="Check Availability" onBack={() => navigate("vehicle")} />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-8 fade-in">
        <ConnectionNotice loading={loading} error={error} />
        {notice && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700" role="status">
            {notice}
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          {legend.map(l => (
            <span key={l.label} className={`${l.cls} border text-xs font-bold px-2.5 py-1 rounded-full`}>{l.label}</span>
          ))}
        </div>

        <div className="bg-white rounded-3xl p-4 shadow-lg border border-gray-100">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Lot A — Ground Floor</div>
          <SlotGrid slots={slots} loading={loading} />
        </div>

        <div className="bg-white rounded-2xl p-4 shadow border border-gray-100">
          <div className="text-xs font-semibold text-gray-500">Vehicle</div>
          <div className="font-black text-gray-800 text-base" style={{ fontFamily: "'Outfit',sans-serif" }}>{vehicle}</div>
        </div>

        <PrimaryBtn onClick={() => navigate("select-slot")}>
          Reserve a Slot →
        </PrimaryBtn>
      </div>
    </AppShell>
  );
}

function SelectSlotScreen({ navigate, vehicle, selectedSlot, setSelectedSlot, slots, loading, error }: {
  navigate: (s: Screen) => void;
  vehicle: string;
  selectedSlot: string;
  setSelectedSlot: (s: string) => void;
} & LiveSlotProps) {
  return (
    <AppShell>
      <TopBar title="Select Your Slot" onBack={() => navigate("availability")} />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-8 fade-in">
        <ConnectionNotice loading={loading} error={error} />
        <p className="text-gray-500 text-sm font-medium">Tap a <span className="text-green-600 font-bold">green</span> slot to select it.</p>

        <div className="bg-white rounded-3xl p-4 shadow-lg border border-gray-100">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Lot A — Ground Floor</div>
          <SlotGrid
            slots={slots}
            loading={loading}
            selectedSlot={selectedSlot}
            onSelect={setSelectedSlot}
          />
        </div>

        {selectedSlot && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3 items-center fade-in">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white flex-shrink-0">
              <div className="w-5 h-5">{Icon.parking}</div>
            </div>
            <div>
              <div className="text-xs text-blue-500 font-semibold">Selected Slot</div>
              <div className="font-black text-blue-800 text-lg" style={{ fontFamily: "'Outfit',sans-serif" }}>{selectedSlot}</div>
            </div>
          </div>
        )}

        <PrimaryBtn onClick={() => navigate("confirm")} disabled={!selectedSlot}>
          Proceed to Confirm →
        </PrimaryBtn>
      </div>
    </AppShell>
  );
}

function ConfirmScreen({
  navigate,
  phone,
  vehicle,
  selectedSlot,
  slots,
  refreshSlots,
  setSelectedSlot,
  setReservation,
}: {
  navigate: (s: Screen) => void;
  phone: string;
  vehicle: string;
  selectedSlot: string;
  slots: ParkingSlot[];
  refreshSlots: (force?: boolean) => Promise<void>;
  setSelectedSlot: (slot: string) => void;
  setReservation: (reservation: ActiveReservation) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);

  const submitReservation = async () => {
    if (submitting) return;

    const phoneError = phoneValidationMessage(phone);
    const vehicleError = vehicleValidationMessage(vehicle);
    if (phoneError || vehicleError) {
      setSubmitError(phoneError ?? vehicleError);
      return;
    }

    const backendSlot = slots.find((slot) => slot.name === selectedSlot);
    if (!backendSlot || backendSlot.display_status !== "AVAILABLE") {
      setHasConflict(true);
      setSubmitError("This parking slot is no longer available. Please choose another slot.");
      setSelectedSlot("");
      await refreshSlots(true);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setHasConflict(false);
    try {
      const created = await createReservation({
        slot_id: backendSlot.id,
        phone_number: phone,
        vehicle_number: vehicle,
      });
      setReservation({ data: created, slotName: backendSlot.name });
      await refreshSlots(true);
      navigate("success");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        setHasConflict(true);
        setSubmitError("This parking slot is no longer available. Please choose another slot.");
        setSelectedSlot("");
        await refreshSlots(true);
      } else if (requestError instanceof ApiError && requestError.status === 422) {
        setSubmitError("Please check your phone and vehicle details, then try again.");
      } else if (requestError instanceof TypeError) {
        setSubmitError("The parking server is unreachable. Please try again.");
      } else {
        setSubmitError("We couldn't create your reservation. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const rows = [
    { label: "Phone Number", value: phone },
    { label: "Vehicle Number", value: vehicle },
    { label: "Parking Slot", value: selectedSlot },
    { label: "Status", value: "Pending Confirmation" },
  ];
  return (
    <AppShell>
      <TopBar title="Confirm Reservation" onBack={() => navigate("select-slot")} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-5 py-8 sm:px-8 fade-in">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-lg">
            <div className="w-8 h-8 text-white">{Icon.car}</div>
          </div>
          <div className="font-black text-gray-800 text-lg" style={{ fontFamily: "'Outfit',sans-serif" }}>Review Booking</div>
          <div className="text-gray-500 text-xs">Please verify details before confirming</div>
        </div>

        <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden">
          {rows.map((r, i) => (
            <div key={r.label} className={`px-5 py-4 flex justify-between items-center ${i < rows.length - 1 ? "border-b border-gray-100" : ""}`}>
              <span className="text-gray-500 text-sm font-semibold">{r.label}</span>
              <span className="font-black text-gray-800 text-sm" style={{ fontFamily: "'Outfit',sans-serif" }}>{r.value}</span>
            </div>
          ))}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 text-xs text-blue-700 font-medium">
          Your slot will be reserved as soon as the parking server confirms this request.
        </div>

        {submitError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
            {submitError}
          </div>
        )}

        {hasConflict && (
          <button
            type="button"
            onClick={() => navigate("select-slot")}
            className="w-full rounded-2xl border-2 border-blue-600 py-3.5 font-bold text-blue-600 transition-colors hover:bg-blue-50"
          >
            Choose Another Slot
          </button>
        )}

        <PrimaryBtn onClick={() => void submitReservation()} disabled={submitting || !selectedSlot}>
          {submitting ? "Reserving..." : "Confirm Reservation ✓"}
        </PrimaryBtn>
      </div>
    </AppShell>
  );
}

function SuccessScreen({ navigate, reservation, refreshSlots, onCancelled }: {
  navigate: (s: Screen) => void;
  reservation: ActiveReservation;
  refreshSlots: (force?: boolean) => Promise<void>;
  onCancelled: (message: string) => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cancelActiveReservation = async () => {
    if (cancelling || reservation.data.status !== "ACTIVE") return;

    setCancelling(true);
    setCancelError(null);
    try {
      await cancelReservation(reservation.data.id);
      await refreshSlots(true);
      onCancelled(`Reservation cancelled. ${reservation.slotName} is available again.`);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) {
        setCancelError("This parking session has already started and can no longer be cancelled.");
      } else if (requestError instanceof ApiError && requestError.status === 404) {
        setCancelError("This reservation could not be found.");
      } else if (requestError instanceof TypeError) {
        setCancelError("The parking server is unreachable. Please try again.");
      } else {
        setCancelError("We couldn't cancel this reservation. Please try again.");
      }
    } finally {
      setCancelling(false);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-gradient-to-br from-blue-700 via-blue-600 to-cyan-500 px-5 py-10 sm:px-16 fade-in">
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl success-pop">
          <div className="w-12 h-12 text-green-500">{Icon.check}</div>
        </div>
        <div className="text-center">
          <h2 className="text-white text-2xl font-black mb-1" style={{ fontFamily: "'Outfit',sans-serif" }}>Reservation Successful!</h2>
          <p className="text-blue-100 text-sm font-medium">Your slot has been reserved.</p>
        </div>

        <div className="w-full max-w-2xl bg-white/20 backdrop-blur-sm rounded-3xl p-5 text-white">
          {[["Slot", reservation.slotName], ["Vehicle", reservation.data.vehicle_number], ["Status", reservation.data.status]].map(([k, v]) => (
            <div key={k} className="flex justify-between py-2 border-b border-white/20 last:border-0">
              <span className="text-blue-100 text-sm font-semibold">{k}</span>
              <span className="font-black text-sm" style={{ fontFamily: "'Outfit',sans-serif" }}>{v}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate("availability")}
          className="w-full max-w-2xl py-4 rounded-2xl bg-white text-blue-600 font-black text-base shadow-lg hover:bg-blue-50 active:scale-95 transition-all"
          style={{ fontFamily: "'Outfit',sans-serif" }}
        >
          View Parking Map
        </button>

        {reservation.data.status === "ACTIVE" && (
          <button
            type="button"
            onClick={() => void cancelActiveReservation()}
            disabled={cancelling}
            className="w-full max-w-2xl rounded-2xl border-2 border-white/70 py-3.5 font-black text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelling ? "Cancelling..." : "Cancel Reservation"}
          </button>
        )}

        {cancelError && (
          <div className="w-full max-w-2xl rounded-2xl border border-red-200 bg-white p-3 text-center text-sm font-semibold text-red-700" role="alert">
            {cancelError}
          </div>
        )}

        <button onClick={() => navigate("home")} className="text-blue-100 text-sm font-medium hover:text-white">
          Back to Home
        </button>
      </div>
    </AppShell>
  );
}

function FindCarScreen({
  navigate,
  vehicleNumber,
  setVehicleNumber,
  setVehicleLocation,
}: {
  navigate: (s: Screen) => void;
  vehicleNumber: string;
  setVehicleNumber: (vehicleNumber: string) => void;
  setVehicleLocation: (location: VehicleLocation) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const locateVehicle = async () => {
    if (locating) return;

    const validationError = vehicleValidationMessage(vehicleNumber);
    if (validationError) {
      setLookupError(validationError);
      return;
    }

    setLocating(true);
    setLookupError(null);
    try {
      const location = await fetchVehicleLocation(vehicleNumber);
      setVehicleLocation(location);
      navigate("car-located");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 404) {
        setLookupError("No active parking session found for this vehicle.");
      } else if (requestError instanceof ApiError && requestError.status === 422) {
        setLookupError("Enter a valid vehicle registration number.");
      } else if (requestError instanceof TypeError) {
        setLookupError("The parking server is unreachable. Please try again.");
      } else {
        setLookupError("We couldn't locate this vehicle. Please try again.");
      }
    } finally {
      setLocating(false);
    }
  };

  return (
    <AppShell>
      <TopBar title="Find My Car" onBack={() => navigate("home")} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-5 py-8 sm:px-8 fade-in">
        <div className="text-center">
          <div className="w-16 h-16 bg-cyan-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <div className="w-8 h-8 text-cyan-600">{Icon.locate}</div>
          </div>
          <p className="text-gray-600 text-sm font-medium">Enter your vehicle registration number to locate it in the parking lot.</p>
        </div>

        <InputField
          label="Vehicle Registration Number"
          value={vehicleNumber}
          onChange={v => setVehicleNumber(v.toUpperCase())}
          placeholder="KL07AB1234"
          maxLength={30}
        />

        {lookupError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
            {lookupError}
          </div>
        )}

        <PrimaryBtn onClick={() => void locateVehicle()} disabled={locating || !vehicleNumber.trim()}>
          {locating ? "Locating..." : "Locate Vehicle →"}
        </PrimaryBtn>

        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Recent Searches</div>
          {["KL07AB1234", "MH12XY9876"].map(v => (
            <button key={v} onClick={() => setVehicleNumber(v)} className="flex items-center gap-2 w-full py-2 text-sm font-semibold text-gray-600 hover:text-blue-600 border-b border-gray-100 last:border-0">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              {v}
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

interface RouteGeometry {
  width: number;
  height: number;
  entranceX: number;
  entranceY: number;
  approachY: number;
  targetX: number;
  targetY: number;
  pathLength: number;
}

// The route is measured against the rendered grid, so its endpoint stays on
// the target slot as the responsive layout changes size.
function ParkingMapWithRoute({
  targetSlot,
  slots,
  parkingStatus,
}: {
  targetSlot: string;
  slots: ParkingSlot[];
  parkingStatus: VehicleLocation["parking_status"];
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const slotElements = useRef(new Map<string, HTMLDivElement>());
  const [route, setRoute] = useState<RouteGeometry | null>(null);
  const isParked = parkingStatus === "PARKED";
  const routeColor = isParked ? "#2563eb" : "#f97316";

  useLayoutEffect(() => {
    const map = mapRef.current;
    const target = slotElements.current.get(targetSlot);
    if (!map || !target) {
      setRoute(null);
      return;
    }

    const updateRoute = () => {
      const mapRect = map.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const entranceX = mapRect.width / 2;
      const entranceY = mapRect.height - 15;
      const targetX = targetRect.left - mapRect.left + targetRect.width / 2;
      const targetY = targetRect.top - mapRect.top + targetRect.height / 2;
      const targetBottom = targetRect.bottom - mapRect.top;
      const approachY = Math.min(entranceY - 24, targetBottom + 10);

      setRoute({
        width: mapRect.width,
        height: mapRect.height,
        entranceX,
        entranceY,
        approachY,
        targetX,
        targetY,
        pathLength:
          Math.abs(entranceY - approachY) +
          Math.abs(entranceX - targetX) +
          Math.abs(approachY - targetY),
      });
    };

    updateRoute();
    const resizeObserver = new ResizeObserver(updateRoute);
    resizeObserver.observe(map);
    resizeObserver.observe(target);
    window.addEventListener("resize", updateRoute);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateRoute);
    };
  }, [parkingStatus, targetSlot, slots.length]);

  const pathD = route
    ? `M ${route.entranceX} ${route.entranceY} L ${route.entranceX} ${route.approachY} L ${route.targetX} ${route.approachY} L ${route.targetX} ${route.targetY}`
    : "";

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-gray-50 border border-gray-200" style={{ userSelect: "none" }}>
      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest px-4 pt-3 pb-2">Lot A — Ground Floor</div>
      <div ref={mapRef} className="relative pb-16">
        {/* Slot grid */}
        <div className="relative z-10 grid grid-cols-4 gap-2.5 px-4 pt-2">
          {slots.map((slot) => {
            const isTarget = slot.name === targetSlot;
            return (
              <div
                key={slot.id}
                ref={(element) => {
                  if (element) slotElements.current.set(slot.name, element);
                  else slotElements.current.delete(slot.name);
                }}
                data-slot-name={slot.name}
                className={`rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all ${
                  isTarget
                    ? isParked
                      ? "bg-blue-600 border-blue-700 text-white shadow-xl scale-105"
                      : "bg-orange-500 border-orange-600 text-white shadow-xl scale-105"
                    : `slot-${toUiSlotStatus(slot.display_status)}`
                } min-h-20 sm:min-h-24`}
              >
                {isTarget && isParked ? (
                  <div className="w-6 h-6">{Icon.car}</div>
                ) : (
                  <div className="w-5 h-5 opacity-60">{Icon.parking}</div>
                )}
                <span className="font-black text-sm" style={{ fontFamily: "'Outfit',sans-serif" }}>{slot.name}</span>
                {isTarget && (
                  <span className="text-[10px] font-bold sm:text-xs">
                    {isParked ? "YOUR CAR" : "RESERVED"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {route && (
          <svg
            width={route.width}
            height={route.height}
            className="pointer-events-none absolute inset-0 z-20 h-full w-full"
            viewBox={`0 0 ${route.width} ${route.height}`}
            aria-hidden="true"
          >
            <path
              key={targetSlot}
              data-route-target={targetSlot}
              d={pathD}
              fill="none"
              stroke={routeColor}
              strokeWidth="3"
              strokeDasharray="8 5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="path-animate"
              style={{
                opacity: 0.85,
                "--route-length": `${route.pathLength}px`,
              } as React.CSSProperties}
            />
            <circle
              data-route-end={targetSlot}
              cx={route.targetX}
              cy={route.targetY}
              r="7"
              fill={routeColor}
              opacity="0.35"
            />
            <g transform={`translate(${route.entranceX}, ${route.entranceY})`}>
              <circle r="10" fill="#22c55e" />
              <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="10" fontWeight="900">▲</text>
            </g>
            <text x={route.entranceX} y={route.entranceY + 18} textAnchor="middle" fontSize="9" fill="#16a34a" fontWeight="700">ENTRANCE</text>
          </svg>
        )}
      </div>
    </div>
  );
}

function CarLocatedScreen({
  navigate,
  slots,
  location,
}: {
  navigate: (s: Screen) => void;
  slots: ParkingSlot[];
  location: VehicleLocation;
}) {
  const liveTargetSlot = slots.find((slot) => slot.id === location.slot_id);
  const targetSlotName = liveTargetSlot?.name ?? location.slot_name;
  const isParked = location.parking_status === "PARKED";
  const statusLabel = isParked ? "Parked" : "Reserved — not parked";

  return (
    <AppShell>
      <TopBar title={isParked ? "Vehicle Located" : "Reservation Located"} onBack={() => navigate("find-car")} />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-8 fade-in">
        <div className={`${isParked ? "border-green-200 bg-green-50" : "border-orange-200 bg-orange-50"} flex items-center gap-3 rounded-2xl border p-4`}>
          <div className={`${isParked ? "bg-green-500" : "bg-orange-500"} flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl shadow`}>
            <div className="h-5 w-5 text-white">{isParked ? Icon.check : Icon.parking}</div>
          </div>
          <div>
            <div className={`${isParked ? "text-green-800" : "text-orange-800"} font-black`} style={{ fontFamily: "'Outfit',sans-serif" }}>
              {isParked ? "Vehicle Found!" : "Reservation Found"}
            </div>
            {isParked ? (
              <div className="text-xs font-medium text-green-600">Your vehicle is parked at <strong>{targetSlotName}</strong></div>
            ) : (
              <div className="text-xs font-medium text-orange-700">
                <div>Your vehicle has not been detected as parked yet.</div>
                <div className="mt-0.5"><strong>Reserved Slot: {targetSlotName}</strong></div>
              </div>
            )}
          </div>
        </div>

        {liveTargetSlot ? (
          <ParkingMapWithRoute
            targetSlot={liveTargetSlot.name}
            slots={slots}
            parkingStatus={location.parking_status}
          />
        ) : (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-700" role="status">
            Refreshing the live parking layout…
          </div>
        )}

        {/* Legend */}
        <div className="flex gap-3 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-600">Entrance</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-1 bg-blue-500 rounded" style={{ borderTop: "2px dashed #2563eb", background: "none" }} />
            <span className="text-gray-600">Walking Route</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`h-3 w-3 rounded-sm ${isParked ? "bg-blue-600" : "bg-orange-500"}`} />
            <span className="text-gray-600">{isParked ? "Your Car" : "Reserved Slot"}</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow border border-gray-100 overflow-hidden">
          {[["Vehicle", location.vehicle_number], [isParked ? "Parking Slot" : "Reserved Slot", targetSlotName], ["Status", statusLabel]].map(([k, v], i, arr) => (
            <div key={k} className={`flex justify-between px-5 py-3.5 ${i < arr.length - 1 ? "border-b border-gray-100" : ""}`}>
              <span className="text-gray-500 text-sm font-semibold">{k}</span>
              <span className={`font-black text-sm ${k === "Status" ? isParked ? "text-green-600" : "text-orange-600" : "text-gray-800"}`} style={{ fontFamily: "'Outfit',sans-serif" }}>{v}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate("home")}
          className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black text-base shadow-lg hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2"
          style={{ fontFamily: "'Outfit',sans-serif" }}
        >
          <div className="w-5 h-5">{Icon.navigation}</div>
          Back to Home
        </button>
      </div>
    </AppShell>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("KL07AB1234");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [reservation, setReservation] = useState<ActiveReservation | null>(null);
  const [findVehicleNumber, setFindVehicleNumber] = useState("");
  const [vehicleLocation, setVehicleLocation] = useState<VehicleLocation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [slots, setSlots] = useState<ParkingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const activeSlotRequest = useRef<AbortController | null>(null);

  const refreshSlots = useCallback(async (force = false) => {
    if (activeSlotRequest.current) {
      if (!force) return;
      activeSlotRequest.current.abort();
    }

    const controller = new AbortController();
    activeSlotRequest.current = controller;

    try {
      const nextSlots = await fetchParkingSlots(controller.signal);
      if (!mountedRef.current) return;
      setSlots(nextSlots);
      setError(null);
    } catch (requestError) {
      if (
        !mountedRef.current ||
        (requestError instanceof DOMException && requestError.name === "AbortError")
      ) return;
      setError("Unable to connect to parking server");
    } finally {
      if (activeSlotRequest.current === controller) {
        activeSlotRequest.current = null;
      }
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshSlots();
    const intervalId = window.setInterval(() => void refreshSlots(), 2_000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      const request = activeSlotRequest.current;
      activeSlotRequest.current = null;
      request?.abort();
    };
  }, [refreshSlots]);

  useEffect(() => {
    if (
      selectedSlot &&
      !slots.some(
        (slot) => slot.name === selectedSlot && slot.display_status === "AVAILABLE",
      )
    ) {
      setSelectedSlot("");
    }
  }, [selectedSlot, slots]);

  const navigate = (s: Screen) => {
    if (s !== "availability") setNotice(null);
    setScreen(s);
  };

  const handleCancellation = (message: string) => {
    setReservation(null);
    setSelectedSlot("");
    setNotice(message);
    setScreen("availability");
  };
  const liveSlots = { slots, loading, error };

  const renderScreen = () => {
    switch (screen) {
    case "home":
      return <HomeScreen navigate={navigate} {...liveSlots} />;
    case "phone":
      return <PhoneScreen navigate={navigate} phone={phone} setPhone={setPhone} />;
    case "otp":
      return <OtpScreen navigate={navigate} phone={phone} />;
    case "vehicle":
      return <VehicleScreen navigate={navigate} vehicle={vehicle} setVehicle={setVehicle} />;
    case "availability":
      return <AvailabilityScreen navigate={navigate} vehicle={vehicle} notice={notice} {...liveSlots} />;
    case "select-slot":
      return (
        <SelectSlotScreen
          navigate={navigate}
          vehicle={vehicle}
          selectedSlot={selectedSlot}
          setSelectedSlot={setSelectedSlot}
          {...liveSlots}
        />
      );
    case "confirm":
      return (
        <ConfirmScreen
          navigate={navigate}
          phone={phone}
          vehicle={vehicle}
          selectedSlot={selectedSlot}
          slots={slots}
          refreshSlots={refreshSlots}
          setSelectedSlot={setSelectedSlot}
          setReservation={setReservation}
        />
      );
    case "success":
      return reservation ? (
        <SuccessScreen
          navigate={navigate}
          reservation={reservation}
          refreshSlots={refreshSlots}
          onCancelled={handleCancellation}
        />
      ) : (
        <HomeScreen navigate={navigate} {...liveSlots} />
      );
    case "find-car":
      return (
        <FindCarScreen
          navigate={navigate}
          vehicleNumber={findVehicleNumber}
          setVehicleNumber={setFindVehicleNumber}
          setVehicleLocation={setVehicleLocation}
        />
      );
    case "car-located":
      return vehicleLocation ? (
        <CarLocatedScreen
          navigate={navigate}
          slots={slots}
          location={vehicleLocation}
        />
      ) : (
        <FindCarScreen
          navigate={navigate}
          vehicleNumber={findVehicleNumber}
          setVehicleNumber={setFindVehicleNumber}
          setVehicleLocation={setVehicleLocation}
        />
      );
      default:
        return <HomeScreen navigate={navigate} {...liveSlots} />;
    }
  };

  return (
    <>
      {renderScreen()}
      {DEV_TOOLS_ENABLED && (
        <DeveloperTools
          slots={slots}
          slotsLoading={loading}
          slotsError={error}
          refreshSlots={refreshSlots}
        />
      )}
    </>
  );
}
