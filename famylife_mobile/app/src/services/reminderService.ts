// services/reminderService.ts
// Rappels locaux "best-effort" pour les activités/événements datés.
//
// IMPORTANT — Expo Go (SDK 53+) : le module `expo-notifications` lève une
// erreur DÈS SON IMPORT (le push distant y a été retiré). On évite donc de
// l'importer statiquement : on le charge paresseusement UNIQUEMENT hors Expo
// Go (dev build / standalone). Sous Expo Go, toutes les fonctions de ce module
// sont des no-op silencieux. Le centre de notifications in-app
// (services/notificationService.ts) reste le mécanisme principal et fonctionne
// indépendamment.
import Constants from 'expo-constants';

// Expo Go : `executionEnvironment === 'storeClient'` (ou `appOwnership === 'expo'`).
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  (Constants as any).executionEnvironment === 'storeClient';

// Chargement PARESSEUX et gardé : on ne require `expo-notifications` que hors
// Expo Go, et une seule fois. En Expo Go on renvoie null → tout devient no-op.
let _notifs: any = null;
let _loaded = false;
function getNotifications(): any | null {
  if (isExpoGo) return null;
  if (_loaded) return _notifs;
  _loaded = true;
  try {
    _notifs = require('expo-notifications');
  } catch {
    _notifs = null;
  }
  return _notifs;
}

let handlerConfigured = false;
function ensureHandler(N: any) {
  if (handlerConfigured) return;
  handlerConfigured = true;
  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // ignore — best effort
  }
}

let permissionDenied = false;

async function ensurePermission(N: any): Promise<boolean> {
  try {
    ensureHandler(N);
    const current = await N.getPermissionsAsync();
    if (current.granted) return true;
    if (permissionDenied) return false;
    const requested = await N.requestPermissionsAsync();
    if (!requested.granted) {
      permissionDenied = true;
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function scheduleAt(identifier: string, titre: string, corps: string, when: Date): Promise<void> {
  const N = getNotifications();
  if (!N) return; // Expo Go / module indisponible → no-op
  try {
    if (when.getTime() <= Date.now()) return; // déjà passé, on ignore
    const granted = await ensurePermission(N);
    if (!granted) return;
    await N.cancelScheduledNotificationAsync(identifier).catch(() => {});
    await N.scheduleNotificationAsync({
      identifier,
      content: { title: titre, body: corps },
      trigger: when as any,
    });
  } catch {
    // Best-effort uniquement : ne doit jamais interrompre le flux de l'app.
  }
}

export async function annulerRappelLocal(identifier: string): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(identifier);
  } catch {
    // ignore
  }
}

interface RappelActiviteInput {
  id: number;
  titre: string;
  date_echeance?: string | null; // AAAA-MM-JJ
  heure_echeance?: string | null; // HH:MM
  rappel?: boolean;
}

// Planifie un rappel local pour une activité datée (si `rappel` est activé et
// que la date est dans le futur). À appeler après création/édition réussie.
export async function planifierRappelActivite(activite: RappelActiviteInput): Promise<void> {
  const identifier = `activite-${activite.id}`;
  if (!activite.rappel || !activite.date_echeance) {
    await annulerRappelLocal(identifier);
    return;
  }
  const [y, m, d] = activite.date_echeance.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return;
  let hour = 9;
  let minute = 0;
  if (activite.heure_echeance) {
    const [h, mi] = activite.heure_echeance.split(':').map((x) => parseInt(x, 10));
    if (!isNaN(h)) hour = h;
    if (!isNaN(mi)) minute = mi;
  }
  const when = new Date(y, m - 1, d, hour, minute, 0);
  await scheduleAt(identifier, `🔔 ${activite.titre}`, "C'est le moment de s'en occuper !", when);
}

interface RappelEvenementInput {
  id: number;
  titre: string;
  date_debut: string; // ISO
  toute_la_journee?: boolean;
}

// Planifie un rappel local pour un événement d'agenda daté (ignore les
// événements "toute la journée", sans heure précise).
export async function planifierRappelEvenement(evenement: RappelEvenementInput): Promise<void> {
  const identifier = `evenement-${evenement.id}`;
  if (evenement.toute_la_journee) {
    await annulerRappelLocal(identifier);
    return;
  }
  const when = new Date(evenement.date_debut);
  if (isNaN(when.getTime())) return;
  await scheduleAt(identifier, `🔔 ${evenement.titre}`, 'Événement à venir', when);
}
