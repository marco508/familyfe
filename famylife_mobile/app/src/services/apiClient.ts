// services/apiClient.ts
// Repris quasi tel quel de yomu_mobile : détection automatique de l'IP LAN
// du serveur Metro pour joindre le backend FastAPI depuis Expo Go, sans
// configuration ni ngrok.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { appEvents, EVENTS } from '../utils/EventEmitter';

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  status: number;
  success?: boolean;
  message?: string;
}

interface NetworkConfig {
  local: string;
  remote: string;
}

interface GetOptions {
  params?: Record<string, any>;
}

const REQUEST_TIMEOUT_MS = 10000;

// Logger dev-only : aucune sortie en production.
const log = (...args: any[]) => {
  if (__DEV__) console.log(...args);
};
const logError = (...args: any[]) => {
  if (__DEV__) console.error(...args);
};

// URLs lues depuis app.json (extra) — aucune URL codée en dur ici.
const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiUrlLocal?: string;
  apiUrlRemote?: string;
};

// En dev sur téléphone (Expo Go / dev build en LAN), on récupère l'IP du PC
// depuis l'hôte du serveur Metro : l'app tape alors automatiquement sur
// http://<cette-ip>:8005, sans configuration ni ngrok.
function getDevServerIp(): string | null {
  const c: any = Constants as any;
  const candidates = [
    c.expoConfig?.hostUri,
    c.expoGoConfig?.debuggerHost,
    c.expoGoConfig?.hostUri,
    c.manifest?.debuggerHost,
    c.manifest?.hostUri,
    c.manifest2?.extra?.expoGo?.debuggerHost,
  ];
  const IPV4 = /^(\d{1,3})(\.\d{1,3}){3}$/;
  for (const cand of candidates) {
    if (typeof cand === 'string' && cand.length) {
      const host = cand.split('://').pop()!.split(':')[0];
      if (IPV4.test(host)) return host;
    }
  }
  return null;
}

class ApiClient {
  private baseURL: string;
  private token: string | null = null;
  private readonly STORAGE_KEY_URL = '@api_base_url';
  private readonly STORAGE_KEY_MANUAL = '@api_base_url_manual';
  private readonly STORAGE_KEY_TOKEN = 'access_token';
  private initPromise: Promise<void>;

  private NETWORK_URLS: NetworkConfig;

  constructor() {
    // Sur le web, l'API est joignable via le même hôte que la page.
    const w: any = globalThis as any;
    const isWeb = Platform.OS === 'web' && typeof w !== 'undefined' && !!w.location;
    // Téléphone en dev : IP du PC déduite du serveur Metro (aucune config, sans ngrok).
    const devHostIp = __DEV__ && !isWeb ? getDevServerIp() : null;
    const local = isWeb
      ? `${w.location.protocol}//${w.location.hostname}:8005`
      : devHostIp
        ? `http://${devHostIp}:8005`
        : (extra.apiUrlLocal ?? 'http://localhost:8005');
    // En dev, pas d'URL distante figée : on retombe sur le local si besoin.
    const remote = extra.apiUrlRemote ?? local;
    this.NETWORK_URLS = { local, remote };

    this.baseURL = __DEV__ ? local : remote;

    log('🍬 ApiClient init — platform:', Platform.OS, '| dev:', __DEV__, '| url:', this.baseURL);

    // Une seule promesse d'initialisation, attendue par chaque requête.
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await this.loadToken();
      await this.loadSavedUrl();
      await this.autoDetectNetwork();
      log('✅ ApiClient fully initialized');
    } catch (error) {
      logError('❌ Initialization error:', error);
    }
  }

  private ensureInitialized(): Promise<void> {
    return this.initPromise;
  }

  private async loadToken() {
    try {
      this.token = await AsyncStorage.getItem(this.STORAGE_KEY_TOKEN);
    } catch (error) {
      logError('❌ Error loading token:', error);
    }
  }

  private async loadSavedUrl() {
    try {
      const savedUrl = await AsyncStorage.getItem(this.STORAGE_KEY_URL);
      if (savedUrl) this.baseURL = savedUrl;
    } catch (error) {
      logError('❌ Error loading URL:', error);
    }
  }

  private async autoDetectNetwork() {
    try {
      // Priorité absolue à une adresse serveur saisie manuellement (réglages).
      const manual = await AsyncStorage.getItem(this.STORAGE_KEY_MANUAL);
      if (manual) { this.baseURL = manual; return; }
      // En développement, on pointe toujours sur le serveur local.
      if (__DEV__) {
        await this.setBaseUrl(this.NETWORK_URLS.local);
        return;
      }
      const networkState = await Network.getNetworkStateAsync();
      if (networkState.type === Network.NetworkStateType.WIFI) {
        const isLocalAvailable = await this.testUrl(this.NETWORK_URLS.local);
        await this.setBaseUrl(
          isLocalAvailable ? this.NETWORK_URLS.local : this.NETWORK_URLS.remote
        );
      } else {
        await this.setBaseUrl(this.NETWORK_URLS.remote);
      }
    } catch (error) {
      logError('❌ Network detection error:', error);
    }
  }

  private async testUrl(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  async setBaseUrl(url: string) {
    this.baseURL = url;
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY_URL, url);
    } catch (error) {
      logError('❌ Error saving URL:', error);
    }
  }

  getBaseUrl(): string {
    return this.baseURL;
  }

  // Adresse serveur saisie manuellement (persistée, prioritaire, sans rebuild).
  async setManualUrl(url: string) {
    const clean = url.trim().replace(/\/+$/, '');
    this.baseURL = clean;
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY_MANUAL, clean);
      await AsyncStorage.setItem(this.STORAGE_KEY_URL, clean);
    } catch (error) { logError('❌ Error saving manual URL:', error); }
  }

  async clearManualUrl() {
    try { await AsyncStorage.removeItem(this.STORAGE_KEY_MANUAL); } catch {}
    await this.autoDetectNetwork();
  }

  async getManualUrl(): Promise<string | null> {
    try { return await AsyncStorage.getItem(this.STORAGE_KEY_MANUAL); } catch { return null; }
  }

  async pingUrl(url: string): Promise<boolean> {
    return this.testUrl(url.trim().replace(/\/+$/, ''));
  }

  async switchToLocal() {
    await this.setBaseUrl(this.NETWORK_URLS.local);
  }

  async switchToRemote() {
    await this.setBaseUrl(this.NETWORK_URLS.remote);
  }

  async saveToken(token: string) {
    this.token = token;
    await AsyncStorage.setItem(this.STORAGE_KEY_TOKEN, token);
  }

  async clearToken() {
    this.token = null;
    await AsyncStorage.removeItem(this.STORAGE_KEY_TOKEN);
  }

  getToken(): string | null {
    return this.token;
  }

  private buildQueryString(params?: Record<string, any>): string {
    if (!params || Object.keys(params).length === 0) return '';
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });
    const queryString = queryParams.toString();
    return queryString ? `?${queryString}` : '';
  }

  async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    await this.ensureInitialized();
    const url = `${this.baseURL}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token && !endpoint.includes('/token') && !endpoint.includes('/signup')) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, { ...options, headers, signal: controller.signal });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        // Token expiré / invalide : nettoyer et notifier l'app (redirection login).
        if (response.status === 401) {
          await this.clearToken();
          appEvents.emit(EVENTS.UNAUTHORIZED);
        }
        return {
          error: data?.detail || 'Une erreur est survenue',
          status: response.status,
        };
      }

      return { data, status: response.status };
    } catch (error: any) {
      logError('❌ Network error:', error?.name, url);

      let errorMessage = 'Impossible de contacter le serveur';
      if (error?.name === 'AbortError') {
        errorMessage = "Délai d'attente dépassé - vérifiez votre connexion";
      } else if (typeof error?.message === 'string' && error.message.includes('Network request failed')) {
        errorMessage = 'Erreur réseau - vérifiez que le serveur est accessible';
      }

      return { error: errorMessage, status: 0 };
    }
  }

  async get<T = any>(endpoint: string, options?: GetOptions): Promise<ApiResponse<T>> {
    const fullEndpoint = `${endpoint}${this.buildQueryString(options?.params)}`;
    return this.request<T>(fullEndpoint, { method: 'GET' });
  }

  async post<T = any>(endpoint: string, body: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) });
  }

  async put<T = any>(endpoint: string, body: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) });
  }

  async patch<T = any>(endpoint: string, body: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async delete<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  // Résout une URL de média potentiellement relative (ex: "/uploads/avatars/x.jpg"
  // renvoyée par l'API — ANNEXE V3) en URL absolue utilisable par <Image>/expo-image.
  resolveMediaUrl(path?: string | null): string | null {
    if (!path) return null;
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('file://') || path.startsWith('data:')) {
      return path;
    }
    if (path.startsWith('/')) return `${this.baseURL}${path}`;
    return path;
  }

  // Upload multipart (avatar, preuve photo...) : FormData + header Authorization,
  // comme le reste de l'app (yomu/famylife). `fileUri` est l'uri locale renvoyée
  // par expo-image-picker.
  async uploadImage<T = any>(
    endpoint: string,
    fileUri: string,
    fieldName: string = 'image'
  ): Promise<ApiResponse<T>> {
    await this.ensureInitialized();
    const url = `${this.baseURL}${endpoint}`;

    const filename = fileUri.split('/').pop() || `photo-${Date.now()}.jpg`;
    const match = /\.(\w+)$/.exec(filename);
    const ext = (match?.[1] || 'jpg').toLowerCase();
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';

    const formData = new FormData();
    formData.append(fieldName, {
      uri: fileUri,
      name: filename,
      type: mime,
    } as any);

    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 3);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          await this.clearToken();
          appEvents.emit(EVENTS.UNAUTHORIZED);
        }
        return { error: data?.detail || "Impossible d'envoyer le fichier", status: response.status };
      }

      return { data, status: response.status };
    } catch (error: any) {
      logError('❌ Upload error:', error?.name);
      const errorMessage =
        error?.name === 'AbortError' ? "Délai d'attente dépassé" : "Impossible d'envoyer le fichier";
      return { error: errorMessage, status: 0 };
    }
  }

  async postUrlEncoded<T = any>(endpoint: string, body: string): Promise<ApiResponse<T>> {
    await this.ensureInitialized();
    const url = `${this.baseURL}${endpoint}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401) {
          await this.clearToken();
          appEvents.emit(EVENTS.UNAUTHORIZED);
        }
        return { error: data?.detail || 'Une erreur est survenue', status: response.status };
      }

      return { data, status: response.status };
    } catch (error: any) {
      logError('❌ URL-encoded network error:', error?.name);
      const errorMessage =
        error?.name === 'AbortError' ? "Délai d'attente dépassé" : 'Impossible de contacter le serveur';
      return { error: errorMessage, status: 0 };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.get('/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async getNetworkInfo() {
    try {
      const networkState = await Network.getNetworkStateAsync();
      const isConnected = await this.testConnection();
      return {
        baseUrl: this.baseURL,
        networkType: networkState.type === Network.NetworkStateType.WIFI ? 'WiFi' : 'Mobile',
        isConnected,
        hasToken: !!this.token,
      };
    } catch (error) {
      logError('❌ Error getting network info:', error);
      return {
        baseUrl: this.baseURL,
        networkType: 'Unknown',
        isConnected: false,
        hasToken: !!this.token,
      };
    }
  }
}

export const apiClient = new ApiClient();
export default apiClient;
