export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

export function formatDateTimeInput(value: string) {
  const parts = new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}`;
}

export function formatDateTimeTextInput(value: string) {
  const parts = new Intl.DateTimeFormat("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Madrid",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.day}/${byType.month}/${byType.year} ${byType.hour}:${byType.minute}`;
}

export function parseMadridDateTimeInput(value: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return new Date(`${value}:00+02:00`).toISOString();
  }

  const textMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (textMatch) {
    const [, day, month, year, hour, minute] = textMatch;
    return new Date(`${year}-${month}-${day}T${hour}:${minute}:00+02:00`).toISOString();
  }

  throw new Error("Fecha no válida. Usa DD/MM/YYYY HH:mm.");
}

export function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    champion: "Campeón",
    group: "Fase de grupos",
    round_of_32: "Dieciseisavos",
    round_of_16: "Octavos",
    quarter_final: "Cuartos",
    semi_final: "Semifinales",
    third_place: "Tercer puesto",
    final: "Final",
  };

  return labels[stage] ?? stage;
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    scheduled: "Programado",
    in_play: "En juego",
    finished: "Finalizado",
    postponed: "Aplazado",
    cancelled: "Cancelado",
  };

  return labels[status] ?? status;
}

export function effectiveMatchStatus(status: string, startsAt: string) {
  if (status === "scheduled" && new Date(startsAt).getTime() <= Date.now()) {
    return "in_play";
  }

  return status;
}
