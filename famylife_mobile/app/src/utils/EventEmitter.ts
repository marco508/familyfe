// src/utils/EventEmitter.ts
import EventEmitter from 'eventemitter3';

export const EVENTS = {
  // Émis par apiClient quand l'API renvoie 401 (token expiré/invalide).
  UNAUTHORIZED: 'UNAUTHORIZED',
  // Émis quand la maison active change (création/rejoint/switch) pour que
  // les écrans qui dépendent de la maison active se rafraîchissent.
  MAISON_CHANGED: 'MAISON_CHANGED',
};

class AppEventEmitter extends EventEmitter {}

export const appEvents = new AppEventEmitter();
