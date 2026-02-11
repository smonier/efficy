import { EfficyApiClient, type EfficyBean } from "./efficyApiClient";
import { HttpClient, resolveApiBaseUrl } from "./httpClient";
import type { EfficyReferentialOption, EfficyUserProfile } from "./models";

export interface EfficyUserPreferences {
  newsletterIds: string[];
  consentIds: string[];
  preferredMediaId: string;
}

export interface EfficyUserPreferenceOptions {
  newsletterOptions: EfficyReferentialOption[];
  consentOptions: EfficyReferentialOption[];
  mediaOptions: EfficyReferentialOption[];
}

function splitIds(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    const unwrapped = trimmed.slice(1, -1).trim();
    if (!unwrapped) {
      return [];
    }

    return unwrapped
      .split(/[;,]/)
      .map((entry) => entry.replace(/^"+|"+$/g, "").trim())
      .filter((entry) => entry.length > 0);
  }

  return trimmed
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readField(bean: EfficyBean, key: string): unknown {
  const value = bean[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string" || Array.isArray(value)) {
    return value;
  }

  if (value.raw_value !== undefined) {
    return value.raw_value;
  }

  if (value.value !== undefined) {
    return value.value;
  }

  return value.label;
}

function readAsText(bean: EfficyBean, key: string): string {
  const value = readField(bean, key);
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const firstValue = value.find((entry) => typeof entry === "string");
    return typeof firstValue === "string" ? firstValue : "";
  }

  return "";
}

function readAsLabel(bean: EfficyBean, key: string): string {
  const value = bean[key];
  if (!value || typeof value === "string" || Array.isArray(value)) {
    return "";
  }

  if (typeof value.label === "string") {
    return value.label;
  }

  return "";
}

function readAsStringArray(bean: EfficyBean, key: string): string[] {
  const value = readField(bean, key);
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === "string")
      .flatMap((entry) => splitIds(entry));
  }

  if (typeof value === "string") {
    return splitIds(value);
  }

  return [];
}

function readNestedRawString(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const map = value as Record<string, unknown>;
  const rawValue = map.raw_value;
  if (typeof rawValue === "string") {
    return rawValue;
  }

  const plainValue = map.value;
  if (typeof plainValue === "string") {
    return plainValue;
  }

  const label = map.label;
  if (typeof label === "string") {
    return label;
  }

  return "";
}

function readPreferredMediaId(bean: EfficyBean): string {
  const directKeys = ["PerPreferedMedia", "PerPrefered.Media"];
  for (const key of directKeys) {
    const fromDirect = readAsText(bean, key);
    if (fromDirect) {
      return splitIds(fromDirect)[0] ?? fromDirect;
    }
  }

  const nested = (bean as Record<string, unknown>).PerPrefered;
  if (nested && typeof nested === "object") {
    const media = (nested as Record<string, unknown>).Media;
    const nestedMedia = readNestedRawString(media);
    if (nestedMedia) {
      return splitIds(nestedMedia)[0] ?? nestedMedia;
    }
  }

  return "";
}

export class ProfileService {
  private readonly apiClient: EfficyApiClient;

  constructor(apiBasePath: string) {
    this.apiClient = new EfficyApiClient(new HttpClient(resolveApiBaseUrl(apiBasePath)));
  }

  async fetchCurrentUserProfile(): Promise<EfficyUserProfile> {
    const personId = await this.apiClient.getCurrentUserPersonId();
    if (!personId) {
      throw new Error("Unable to resolve logged user Efficy person");
    }

    const bean = await this.apiClient.getPersonById(personId);
    if (!bean) {
      throw new Error("Unable to load current user profile");
    }

    return {
      personId,
      firstName: readAsText(bean, "PerFstName"),
      lastName: readAsText(bean, "PerName"),
      email: readAsText(bean, "PerMail") || readAsText(bean, "PerEmail"),
      civility: readAsLabel(bean, "PerCivID") || readAsText(bean, "PerCivility") || undefined,
      title: readAsText(bean, "PerTitle") || undefined,
      status: readAsLabel(bean, "PerDataPrivStatus") || readAsText(bean, "PerStatus") || undefined,
      phone: readAsText(bean, "PerPhone") || undefined,
      mobile: readAsText(bean, "PerMobile") || undefined,
      fax: readAsText(bean, "PerFax") || undefined,
      address1: readAsText(bean, "PerAd1") || undefined,
      address2: readAsText(bean, "PerAd2") || undefined,
      address3: readAsText(bean, "PerAd3") || undefined,
      city: readAsText(bean, "PerCity") || undefined,
      postalCode: readAsText(bean, "PerZip") || undefined,
      country: readAsLabel(bean, "PerCtrID") || readAsText(bean, "PerCountry") || undefined,
      company: readAsLabel(bean, "PerEntID") || readAsText(bean, "PerCompany") || undefined,
      birthDate: readAsText(bean, "PerBirthDate") || readAsText(bean, "PerBirthdayDate_") || undefined,
      clientNumber: readAsText(bean, "PerNumClient") || undefined,
      loyaltyScore: readAsText(bean, "PerLoyaltyScore") || undefined,
      newsletterIds: readAsStringArray(bean, "PerNltID"),
      consentIds: readAsStringArray(bean, "PerConsent_"),
      preferredMediaId: readPreferredMediaId(bean),
    };
  }

  async fetchPreferenceOptions(): Promise<EfficyUserPreferenceOptions> {
    const [newsletterOptions, consentOptions, mediaOptions] = await Promise.all([
      this.apiClient.fetchReferentialOptions("PerNltID"),
      this.apiClient.fetchReferentialOptions("PerConsent_"),
      this.apiClient.fetchReferentialOptions("PerPreferedMedia"),
    ]);

    return {
      newsletterOptions,
      consentOptions,
      mediaOptions,
    };
  }

  async updateCurrentUserPreferences(
    personId: string,
    preferences: EfficyUserPreferences,
  ): Promise<void> {
    await this.apiClient.updatePersonFields(personId, {
      PerNltID: preferences.newsletterIds,
      PerConsent_: preferences.consentIds,
      PerPreferedMedia: preferences.preferredMediaId || "",
    });
  }
}
