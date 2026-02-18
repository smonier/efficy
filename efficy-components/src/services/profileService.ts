import { EfficyApiClient, type EfficyBean } from "./efficyApiClient";
import { HttpClient, resolveApiBaseUrl } from "./httpClient";
import type { EfficyHouseholdMember, EfficyReferentialOption, EfficyUserProfile } from "./models";

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

function toStringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function extractStringValues(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractStringValues(entry));
  }

  if (typeof value === "object") {
    const map = value as Record<string, unknown>;
    return [
      ...extractStringValues(map.raw_value),
      ...extractStringValues(map.value),
      ...extractStringValues(map.label),
    ];
  }

  const text = toStringValue(value).trim();
  return text ? [text] : [];
}

function readField(bean: EfficyBean, key: string): unknown {
  const value = bean[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string" || Array.isArray(value)) {
    return value;
  }

  if (value.raw_value !== undefined && value.raw_value !== null) {
    return value.raw_value;
  }

  if (value.value !== undefined && value.value !== null) {
    return value.value;
  }

  if (value.label !== undefined && value.label !== null) {
    return value.label;
  }

  return value;
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

function readAsValueFirst(bean: EfficyBean, key: string): string {
  const value = bean[key];
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const firstValue = value.find((entry) => typeof entry === "string");
    return typeof firstValue === "string" ? firstValue : "";
  }

  const field = value as Record<string, unknown>;
  const directValue = toStringValue(field.value);
  if (directValue) {
    return directValue;
  }

  const directLabel = toStringValue(field.label);
  if (directLabel) {
    return directLabel;
  }

  return toStringValue(field.raw_value);
}

function readAsStringArray(bean: EfficyBean, key: string): string[] {
  const value = readField(bean, key);
  const values = extractStringValues(value);
  return values.flatMap((entry) => splitIds(entry));
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

function toBean(row: unknown): EfficyBean {
  if (!row || typeof row !== "object") {
    return {};
  }

  const map = row as Record<string, unknown>;
  const beanData = map.bean_data;
  if (beanData && typeof beanData === "object") {
    return beanData as EfficyBean;
  }

  return map as EfficyBean;
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

    const personStatus = readAsLabel(bean, "PerStatut_") || readAsText(bean, "PerStatut_");
    const enterpriseIds = readAsStringArray(bean, "PerEntID");
    const householdMembers = await this.fetchHouseholdMembers(enterpriseIds);

    return {
      personId,
      firstName: readAsText(bean, "PerFstName"),
      lastName: readAsText(bean, "PerName"),
      email: readAsText(bean, "PerMail") || readAsText(bean, "PerEmail"),
      civility: readAsLabel(bean, "PerCivID") || readAsText(bean, "PerCivility") || undefined,
      title: readAsText(bean, "PerTitle") || undefined,
      status: personStatus || readAsLabel(bean, "PerDataPrivStatus") || readAsText(bean, "PerStatus") || undefined,
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
      householdMembers,
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

  private async fetchHouseholdMembers(enterpriseIds: string[]): Promise<EfficyHouseholdMember[]> {
    const uniqueEnterpriseIds = [...new Set(enterpriseIds.filter(Boolean))];
    if (uniqueEnterpriseIds.length === 0) {
      return [];
    }

    const membersByKey = new Map<string, EfficyHouseholdMember>();

    for (const enterpriseId of uniqueEnterpriseIds) {
      try {
        const enterpriseFilter = encodeURIComponent(`{{[EntID,=,${enterpriseId}]}}`);
        const enterpriseRestrict = encodeURIComponent("{EntID,EntOrgType}");
        const enterpriseResponse = await this.apiClient.proxyGet(
          "base",
          `Enterprise?filter=${enterpriseFilter}&restrict_to=${enterpriseRestrict}`,
        );

        const enterpriseBean = toBean(enterpriseResponse.data?.query_results?.[0]);
        const orgType = readAsValueFirst(enterpriseBean, "EntOrgType").trim().toUpperCase();
        const hasReadableOrgType = /^[A-Z_\s]+$/.test(orgType);
        if (orgType && hasReadableOrgType && orgType !== "FOYER") {
          continue;
        }

        const personFilter = encodeURIComponent(`{{[PerEntID,=,${enterpriseId}]}}`);
        const personRestrict = encodeURIComponent("{PerID,PerCivID,PerName,PerFstName,PerStatut_,PerTitle}");
        const personResponse = await this.apiClient.proxyGet(
          "base",
          `Person?filter=${personFilter}&restrict_to=${personRestrict}`,
        );

        (personResponse.data?.query_results ?? []).forEach((row) => {
          const bean = toBean(row);
          const member: EfficyHouseholdMember = {
            personId: readAsText(bean, "PerID") || undefined,
            civility: readAsLabel(bean, "PerCivID") || undefined,
            lastName: readAsText(bean, "PerName") || undefined,
            firstName: readAsText(bean, "PerFstName") || undefined,
            status: readAsLabel(bean, "PerStatut_") || readAsText(bean, "PerStatut_") || undefined,
            title: readAsText(bean, "PerTitle") || undefined,
          };

          const dedupeKey =
            member.personId ||
            [member.civility, member.firstName, member.lastName, member.status, member.title].join("|");

          if (dedupeKey && !membersByKey.has(dedupeKey)) {
            membersByKey.set(dedupeKey, member);
          }
        });
      } catch {
        // Household members are optional context for profile details.
      }
    }

    return [...membersByKey.values()];
  }
}
