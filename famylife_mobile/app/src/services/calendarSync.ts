// src/services/calendarSync.ts
// Synchronisation de l'agenda FamiLyfe vers le calendrier natif du téléphone
// (iOS EventKit / Android Calendar Provider) via `expo-calendar`.
//
// Sens : app → téléphone (les événements créés dans FamiLyfe apparaissent dans
// le calendrier du tel, dans un calendrier dédié « FamiLyfe »).
//
// IMPORTANT : `expo-calendar` n'est PAS disponible dans Expo Go — il faut un
// development build. Le module est donc chargé en *lazy* (require différé) et
// tout est encapsulé dans des try/catch : dans Expo Go (ou si la permission est
// refusée), les fonctions ne font rien sans jamais planter l'app ni l'écran
// Agenda. Elles deviennent actives dès qu'on lance un dev build.
//
// Prérequis d'installation :  npx expo install expo-calendar
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Evenement } from './evenementService';

const CAL_ID_KEY = '@familyfe_calendar_id';
const MAP_KEY = '@familyfe_calendar_map'; // { [evenementId]: nativeEventId }
const CAL_TITLE = 'FamiLyfe';
const CAL_COLOR = '#EC5F4E';

// Chargement paresseux du module natif : on ne l'exécute qu'au moment d'un
// appel de synchro. S'il est absent (Expo Go) ou lève une erreur au chargement,
// on renvoie null et tout devient silencieusement inactif.
let _mod: any = null;
let _tried = false;
function cal(): any | null {
  if (_tried) return _mod;
  _tried = true;
  try {
    _mod = require('expo-calendar');
  } catch {
    _mod = null;
  }
  return _mod;
}

// Vrai si le module natif répond (faux dans Expo Go).
export function calendarDisponible(): boolean {
  const Calendar = cal();
  return !!Calendar && typeof Calendar.requestCalendarPermissionsAsync === 'function';
}

export async function demanderPermission(): Promise<boolean> {
  const Calendar = cal();
  if (!Calendar) return false;
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

async function loadMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(MAP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function saveMap(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(MAP_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

async function getSource(Calendar: any): Promise<any> {
  if (Platform.OS === 'ios') {
    const def = await Calendar.getDefaultCalendarAsync();
    return def.source;
  }
  return { isLocalAccount: true, name: CAL_TITLE };
}

// Récupère (ou crée) le calendrier « FamiLyfe » dédié, et mémorise son id.
async function ensureCalendar(Calendar: any): Promise<string | null> {
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

    const savedId = await AsyncStorage.getItem(CAL_ID_KEY);
    if (savedId && calendars.some((c: any) => c.id === savedId)) return savedId;

    const existing = calendars.find((c: any) => c.title === CAL_TITLE && c.allowsModifications);
    if (existing) {
      await AsyncStorage.setItem(CAL_ID_KEY, existing.id);
      return existing.id;
    }

    const source = await getSource(Calendar);
    const newId = await Calendar.createCalendarAsync({
      title: CAL_TITLE,
      color: CAL_COLOR,
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: source?.id,
      source,
      name: CAL_TITLE,
      ownerAccount: 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
    await AsyncStorage.setItem(CAL_ID_KEY, newId);
    return newId;
  } catch {
    return null;
  }
}

function eventDetails(e: Evenement): any {
  const start = new Date(e.date_debut);
  const end = e.date_fin ? new Date(e.date_fin) : new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title: e.titre,
    startDate: start,
    endDate: end,
    allDay: !!e.toute_la_journee,
    location: e.lieu ?? undefined,
    notes: e.description ?? undefined,
  };
}

// Ajoute l'événement au calendrier du tel (ou le met à jour s'il y est déjà).
// Renvoie true si l'opération a réussi.
export async function syncEvenement(e: Evenement): Promise<boolean> {
  const Calendar = cal();
  if (!Calendar) return false;
  try {
    if (!(await demanderPermission())) return false;
    const calId = await ensureCalendar(Calendar);
    if (!calId) return false;

    const map = await loadMap();
    const existingNativeId = map[String(e.id)];
    if (existingNativeId) {
      try {
        await Calendar.updateEventAsync(existingNativeId, eventDetails(e));
        return true;
      } catch {
        // L'événement natif a peut-être été supprimé à la main : on le recrée.
      }
    }
    const nativeId = await Calendar.createEventAsync(calId, eventDetails(e));
    map[String(e.id)] = nativeId;
    await saveMap(map);
    return true;
  } catch {
    return false;
  }
}

// Retire l'événement du calendrier du tel (à la suppression dans l'app).
export async function retirerEvenement(evenementId: number): Promise<void> {
  const Calendar = cal();
  if (!Calendar) return;
  try {
    const map = await loadMap();
    const nativeId = map[String(evenementId)];
    if (!nativeId) return;
    try {
      await Calendar.deleteEventAsync(nativeId);
    } catch {
      // déjà supprimé côté tel : rien à faire
    }
    delete map[String(evenementId)];
    await saveMap(map);
  } catch {
    // best-effort
  }
}

// Pousse une liste d'événements d'un coup (« tout synchroniser »).
// Renvoie le nombre d'événements synchronisés.
export async function synchroniserTout(evenements: Evenement[]): Promise<number> {
  if (!calendarDisponible()) return 0;
  let n = 0;
  for (const e of evenements) {
    if (await syncEvenement(e)) n += 1;
  }
  return n;
}
