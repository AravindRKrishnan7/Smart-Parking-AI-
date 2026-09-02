from dataclasses import dataclass

from .models import ServiceType


@dataclass(frozen=True)
class ServiceDefinition:
    service_type: ServiceType
    name: str
    category: str
    description: str
    price: int | None
    estimated_duration_minutes: int | None


SERVICE_CATALOG: dict[ServiceType, ServiceDefinition] = {
    ServiceType.EXTERIOR_WASH: ServiceDefinition(
        ServiceType.EXTERIOR_WASH,
        "Exterior Wash",
        "CAR CARE",
        "A careful wash of the vehicle exterior.",
        299,
        25,
    ),
    ServiceType.WATERLESS_WASH: ServiceDefinition(
        ServiceType.WATERLESS_WASH,
        "Waterless Wash",
        "CAR CARE",
        "A low-water exterior clean using specialist products.",
        199,
        15,
    ),
    ServiceType.WASH_POLISH: ServiceDefinition(
        ServiceType.WASH_POLISH,
        "Exterior Wash + Polish",
        "CAR CARE",
        "Exterior wash followed by a surface polish.",
        499,
        40,
    ),
    ServiceType.QUICK_WAX: ServiceDefinition(
        ServiceType.QUICK_WAX,
        "Quick Wax / Shine",
        "CAR CARE",
        "A quick exterior wax treatment for added shine.",
        249,
        20,
    ),
    ServiceType.WINDSHIELD_CLEAN: ServiceDefinition(
        ServiceType.WINDSHIELD_CLEAN,
        "Windshield Cleaning",
        "CAR CARE",
        "Exterior windshield cleaning for clearer visibility.",
        99,
        10,
    ),
    ServiceType.WHEEL_RIM_CLEAN: ServiceDefinition(
        ServiceType.WHEEL_RIM_CLEAN,
        "Wheel & Rim Cleaning",
        "WHEELS & TYRES",
        "Exterior cleaning for wheels and rims.",
        149,
        15,
    ),
    ServiceType.TYRE_SHINE: ServiceDefinition(
        ServiceType.TYRE_SHINE,
        "Tyre Shine",
        "WHEELS & TYRES",
        "An exterior tyre dressing for a clean finish.",
        99,
        10,
    ),
    ServiceType.TYRE_PRESSURE: ServiceDefinition(
        ServiceType.TYRE_PRESSURE,
        "Tyre Pressure Check",
        "WHEELS & TYRES",
        "A quick pressure check for all tyres.",
        49,
        5,
    ),
    ServiceType.QUICK_CARE: ServiceDefinition(
        ServiceType.QUICK_CARE,
        "Quick Care",
        "PACKAGES",
        "Exterior wash with windshield cleaning.",
        349,
        25,
    ),
    ServiceType.PREMIUM_SHINE: ServiceDefinition(
        ServiceType.PREMIUM_SHINE,
        "Premium Shine",
        "PACKAGES",
        "Wash, polish, wheel cleaning, and tyre shine.",
        699,
        45,
    ),
    ServiceType.EV_CHARGING: ServiceDefinition(
        ServiceType.EV_CHARGING,
        "EV Charging Request",
        "EV SERVICES",
        "Request access to available charging infrastructure.",
        None,
        None,
    ),
}
