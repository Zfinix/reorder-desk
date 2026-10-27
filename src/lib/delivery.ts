import type { Route } from "../types.ts";

const DELIVERY_FEE = 2500;
const FREE_DELIVERY_FROM = 150000;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type Slot = {
  ok: true;
  route: string;
  day_name: string;
  date: string;
  days_away: number;
  missed_this_week: boolean;
};

export const deliveryFee = (subtotal: number) => (subtotal >= FREE_DELIVERY_FROM ? 0 : DELIVERY_FEE);

const depotNow = (now: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const field = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${field.year}-${field.month}-${field.day}`,
    hour: Number(field.hour) % 24,
    weekday: DAYS.indexOf(field.weekday),
  };
};

const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const nextSlot = (
  routes: Record<string, Route>,
  area: string,
  now = new Date(),
): Slot | { ok: false; reason: "no_route_for_area" } => {
  const route = routes[area];
  if (!route) return { ok: false, reason: "no_route_for_area" };

  const depot = depotNow(now);
  let days = (route.weekday - depot.weekday + 7) % 7;
  const missedLoading = days === 0 || (days === 1 && depot.hour >= route.cutoff_hour);
  if (missedLoading) days += 7;

  return {
    ok: true,
    route: route.label,
    day_name: route.day_name,
    date: addDays(depot.date, days),
    days_away: days,
    missed_this_week: missedLoading,
  };
};
