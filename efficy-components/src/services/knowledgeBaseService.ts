import { EfficyApiClient, type EfficyBean } from "./efficyApiClient";
import { HttpClient, resolveApiBaseUrl } from "./httpClient";
import type { EfficyFaq } from "./models";

const DEFAULT_AUDIENCE_IDS = ["0000000000028c93", "00000000008be92d"];
const FALLBACK_LANGUAGE_CODE = "fr_FR";

function toBean(row: unknown): EfficyBean {
  if (!row || typeof row !== "object") {
    return {};
  }

  const value = row as Record<string, unknown>;
  const beanData = value.bean_data;
  if (beanData && typeof beanData === "object") {
    return beanData as EfficyBean;
  }

  return value as EfficyBean;
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

function readAsRawText(bean: EfficyBean, key: string): string {
  const value = bean[key];
  if (typeof value === "string") {
    return value;
  }

  if (!value || Array.isArray(value)) {
    return "";
  }

  const rawValue = value.raw_value ?? value.value;
  if (Array.isArray(rawValue)) {
    const firstValue = rawValue.find((entry) => typeof entry === "string");
    return typeof firstValue === "string" ? firstValue : "";
  }

  if (typeof rawValue === "string") {
    return rawValue;
  }

  if (typeof value.label === "string") {
    return value.label;
  }

  return "";
}

export class KnowledgeBaseService {
  private readonly apiClient: EfficyApiClient;

  constructor(apiBasePath: string) {
    this.apiClient = new EfficyApiClient(new HttpClient(resolveApiBaseUrl(apiBasePath)));
  }

  async listFaqsForLanguage(language: string): Promise<EfficyFaq[]> {
    const languageCode = this.toEfficyLanguageCode(language);
    const primaryFaqs = await this.fetchFaqs(languageCode);
    const faqs = primaryFaqs.length > 0 || languageCode === FALLBACK_LANGUAGE_CODE
      ? primaryFaqs
      : await this.fetchFaqs(FALLBACK_LANGUAGE_CODE);

    if (faqs.length === 0) {
      return [];
    }

    return this.withTags(faqs);
  }

  private async fetchFaqs(languageCode: string): Promise<EfficyFaq[]> {
    const filter = encodeURIComponent(
      `{{[FaqFahID:FahStatus:RefVal,=,PUBLISHED],[FaqFahID:FahAudienceID,in,(${DEFAULT_AUDIENCE_IDS.join(",")})],[FaqLngID:RefVal,=,${languageCode}]}}`,
    );
    const response = await this.apiClient.proxyGet("base", `FAQ?filter=${filter}`);
    const rows = response.data?.query_results ?? [];

    return rows
      .map((row) => toBean(row))
      .map((bean, index) => ({
        id: readAsRawText(bean, "FaqID") || readAsText(bean, "FaqID") || `faq-${languageCode}-${index}`,
        headerId: readAsRawText(bean, "FaqFahID") || readAsText(bean, "FaqFahID"),
        title: readAsText(bean, "FaqTitle"),
        response: readAsText(bean, "FaqResponse"),
        tags: [],
      }))
      .filter((faq) => faq.title || faq.response);
  }

  private async withTags(faqs: EfficyFaq[]): Promise<EfficyFaq[]> {
    const headerIds = Array.from(
      new Set(
        faqs
          .map((faq) => faq.headerId.trim())
          .filter((headerId) => headerId.length > 0),
      ),
    );

    if (headerIds.length === 0) {
      return faqs;
    }

    const headerCodesEntries = await Promise.all(
      headerIds.map(async (headerId) => [headerId, await this.fetchTagCodes(headerId)] as const),
    );
    const headerCodes = new Map<string, string[]>(headerCodesEntries);

    const uniqueCodes = Array.from(new Set(headerCodesEntries.flatMap(([, codes]) => codes)));
    if (uniqueCodes.length === 0) {
      return faqs;
    }

    const codeLabelsEntries = await Promise.all(
      uniqueCodes.map(async (code) => [code, await this.fetchTagLabel(code)] as const),
    );
    const codeToLabel = new Map<string, string>();

    for (const [code, label] of codeLabelsEntries) {
      if (label) {
        codeToLabel.set(code, label);
      }
    }

    return faqs.map((faq) => {
      const codes = headerCodes.get(faq.headerId) ?? [];
      const tags = Array.from(
        new Set(
          codes
            .map((code) => codeToLabel.get(code) ?? "")
            .filter((label) => label.length > 0),
        ),
      );

      return {
        ...faq,
        tags,
      };
    });
  }

  private async fetchTagCodes(headerId: string): Promise<string[]> {
    const filter = encodeURIComponent(`{{[FhtFahID,=,${headerId}]}}`);
    const response = await this.apiClient.proxyGet("base", `FAQHeaderTagCode?filter=${filter}`);
    const rows = response.data?.query_results ?? [];

    return Array.from(
      new Set(
        rows
          .map((row) => toBean(row))
          .map((bean) => readAsRawText(bean, "FhtTagCode") || readAsText(bean, "FhtTagCode"))
          .filter((code) => code.length > 0),
      ),
    );
  }

  private async fetchTagLabel(code: string): Promise<string> {
    try {
      const filter = encodeURIComponent(`{{[TagCode,=,${code}]}}`);
      const response = await this.apiClient.proxyGet("base", `Tag?filter=${filter}`);
      const first = response.data?.query_results?.[0];
      if (!first) {
        return "";
      }

      const bean = toBean(first);
      return readAsText(bean, "TagText");
    } catch {
      return "";
    }
  }

  private toEfficyLanguageCode(language: string): string {
    const normalized = language.trim().toLowerCase();
    if (normalized.startsWith("fr")) {
      return "fr_FR";
    }

    if (normalized.startsWith("en")) {
      return "en_US";
    }

    return FALLBACK_LANGUAGE_CODE;
  }
}
