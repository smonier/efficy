import { EfficyApiClient, type EfficyBean } from "./efficyApiClient";
import { HttpClient, resolveApiBaseUrl } from "./httpClient";
import type {
  EfficyBrokerCreateOpportunityInput,
  EfficyBrokerEnterprise,
  EfficyBrokerOpportunity,
  EfficyBrokerOpportunityFormOptions,
  EfficyBrokerOpportunityWithDisplay,
  EfficyBrokerPerson,
  EfficyReferentialOption,
} from "./models";

interface ReferentialItem {
  id?: string;
  te1?: string;
  nu1?: number | string;
}

interface PersonInfo {
  name: string;
  functionId: string;
}

const MAX_RESULTS = 100;

function decodeHtmlEntities(value: string): string {
  if (!value || !value.includes("&")) {
    return value;
  }

  const namedEntities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };

  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }

    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }

    return namedEntities[entity] ?? match;
  });
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

function readQueryRows(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const firstLevel = payload as Record<string, unknown>;
  const data = firstLevel.data;
  if (!data || typeof data !== "object") {
    return [];
  }

  const queryResults = (data as Record<string, unknown>).query_results;
  return Array.isArray(queryResults) ? queryResults : [];
}

function readSingleBean(payload: unknown): EfficyBean | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const firstLevel = payload as Record<string, unknown>;
  const data = firstLevel.data;
  if (!data || typeof data !== "object") {
    return null;
  }

  const beanData = (data as Record<string, unknown>).bean_data;
  if (beanData && typeof beanData === "object") {
    return beanData as EfficyBean;
  }

  return data as EfficyBean;
}

function readFieldValue(bean: EfficyBean, key: string): unknown {
  const value = bean[key];
  if (value === undefined) {
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
  const value = readFieldValue(bean, key);
  if (typeof value === "string") {
    return decodeHtmlEntities(value);
  }

  if (!Array.isArray(value)) {
    return "";
  }

  const firstValue = value.find((entry) => typeof entry === "string");
  return typeof firstValue === "string" ? decodeHtmlEntities(firstValue) : "";
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
    const first = rawValue.find((entry) => typeof entry === "string");
    return typeof first === "string" ? first : "";
  }

  return typeof rawValue === "string" ? rawValue : "";
}

function readAsRawArray(bean: EfficyBean, key: string): string[] {
  const value = bean[key];
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter((entry) => typeof entry === "string") as string[];
  }

  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }

  const raw = value.raw_value ?? value.value;
  if (Array.isArray(raw)) {
    return raw.filter((entry) => typeof entry === "string") as string[];
  }

  if (typeof raw === "string") {
    return raw.trim() ? [raw] : [];
  }

  return [];
}

function readAsNumber(bean: EfficyBean, key: string): number {
  const parseStringNumber = (input: string): number => {
    const compact = input
      .trim()
      .replace(/[\u00A0\u202F\s']/g, "")
      .replace(/[^\d,.\-+]/g, "");

    if (!compact) {
      return Number.NaN;
    }

    const hasComma = compact.includes(",");
    const hasDot = compact.includes(".");
    let normalized = compact;

    if (hasComma && hasDot) {
      normalized =
        compact.lastIndexOf(",") > compact.lastIndexOf(".")
          ? compact.replace(/\./g, "").replace(/,/g, ".")
          : compact.replace(/,/g, "");
    } else if (hasComma) {
      normalized = compact.replace(/,/g, ".");
    }

    return Number.parseFloat(normalized);
  };

  const parseUnknownNumber = (value: unknown): number => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      return parseStringNumber(value);
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        const parsed = parseUnknownNumber(entry);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return Number.NaN;
  };

  const raw = bean[key];
  const candidates: unknown[] = [];

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    candidates.push(raw.raw_value, raw.value, raw.label);
  }

  candidates.push(readFieldValue(bean, key));

  for (const candidate of candidates) {
    const parsed = parseUnknownNumber(candidate);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function extractReferentialRows(payload: unknown): ReferentialItem[] {
  if (Array.isArray(payload)) {
    return payload as ReferentialItem[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const firstLevel = payload as Record<string, unknown>;
  const data = firstLevel.data;

  if (Array.isArray(data)) {
    return data as ReferentialItem[];
  }

  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).data;
    if (Array.isArray(nested)) {
      return nested as ReferentialItem[];
    }
  }

  return [];
}

export class BrokersService {
  private readonly httpClient: HttpClient;
  private readonly apiClient: EfficyApiClient;
  private readonly referentialCache = new Map<string, Map<string, ReferentialItem>>();
  private readonly enterpriseCache = new Map<string, string>();
  private readonly personCache = new Map<string, PersonInfo>();

  constructor(apiBasePath: string) {
    this.httpClient = new HttpClient(resolveApiBaseUrl(apiBasePath));
    this.apiClient = new EfficyApiClient(this.httpClient);
  }

  async resolveCurrentBrokerEnterpriseId(): Promise<string> {
    const personId = await this.apiClient.getCurrentUserPersonId();
    if (!personId) {
      return "";
    }

    const personBean = await this.apiClient.getPersonById(personId);
    if (!personBean) {
      return "";
    }

    const rawArray = readAsRawArray(personBean, "PerEntID");
    if (rawArray.length > 0) {
      return rawArray[0] ?? "";
    }

    return readAsRawText(personBean, "PerEntID");
  }

  async fetchBrokerOpportunities(courtierEntId: string): Promise<EfficyBrokerOpportunityWithDisplay[]> {
    if (!courtierEntId) {
      return [];
    }

    const filter = encodeURIComponent(`{{[OppCourtier_,=,${courtierEntId}]}}`);
    const restrictTo = encodeURIComponent(
      "{OppEntID,OppPerID,OppStoID,OppStuID,OppTitle,OppDate,OppNumRef,OppGammeShouhaitee_,OppOpbID,OppNivSouhaite_,OppRegimeAssurance_,OppStake,OppDetail}",
    );

    const response = await this.httpClient.get<unknown>(
      `/base/Opportunity?filter=${filter}&restrict_to=${restrictTo}&nb_of_result=${MAX_RESULTS}`,
    );

    const rows = readQueryRows(response);
    return Promise.all(rows.map((row) => this.toDisplayOpportunity(toBean(row))));
  }

  async fetchEnterprises(courtierEntId: string): Promise<EfficyBrokerEnterprise[]> {
    if (!courtierEntId) {
      return [];
    }

    const filter = encodeURIComponent(`{{[EntCourtier_,=,${courtierEntId}]}}`);
    const restrictTo = encodeURIComponent("{EntID,EntCorpName}");
    const response = await this.httpClient.get<unknown>(
      `/base/Enterprise?filter=${filter}&restrict_to=${restrictTo}&nb_of_result=${MAX_RESULTS}`,
    );

    return readQueryRows(response)
      .map((row) => toBean(row))
      .map((bean) => ({
        id: readAsRawText(bean, "EntID"),
        name: readAsText(bean, "EntCorpName"),
      }))
      .filter((entry) => entry.id && entry.name);
  }

  async fetchPersonsByEnterprise(enterpriseId: string): Promise<EfficyBrokerPerson[]> {
    if (!enterpriseId) {
      return [];
    }

    const filter = encodeURIComponent(`{{[PerEntID,=,${enterpriseId}]}}`);
    const restrictTo = encodeURIComponent("{PerID,PerFstName,PerName,PerFctID}");
    const response = await this.httpClient.get<unknown>(
      `/base/Person?filter=${filter}&restrict_to=${restrictTo}&nb_of_result=${MAX_RESULTS}`,
    );

    return Promise.all(
      readQueryRows(response).map(async (row) => {
        const bean = toBean(row);
        const functionId = readAsRawText(bean, "PerFctID");
        const functionLabel = await this.getReferentialLabel("PerFctID", functionId);

        return {
          id: readAsRawText(bean, "PerID"),
          name: [readAsText(bean, "PerFstName"), readAsText(bean, "PerName")]
            .filter(Boolean)
            .join(" "),
          functionLabel,
        } satisfies EfficyBrokerPerson;
      }),
    ).then((entries) => entries.filter((entry) => entry.id));
  }

  async fetchOpportunityFormOptions(): Promise<EfficyBrokerOpportunityFormOptions> {
    const [statesMap, probabilitiesMap, gammesMap] = await Promise.all([
      this.getReferentialMap("OppStoID"),
      this.getReferentialMap("OppOpbID"),
      this.getReferentialMap("OppGammeShouhaitee_"),
    ]);

    const states = this.toReferentialOptions(statesMap, "te1");
    const probabilities = this.toReferentialOptions(probabilitiesMap, "nu1");
    const gammes = this.toReferentialOptions(gammesMap, "te1");

    return {
      states,
      probabilities,
      gammes,
    };
  }

  async createOpportunityWithCourtier(input: EfficyBrokerCreateOpportunityInput): Promise<void> {
    await this.httpClient.post<unknown>(
      "/base/Opportunity",
      {
        data: {
          bean_data: {
            OppTitle: input.title,
            OppDetail: input.detail,
            OppEntID: input.enterpriseId,
            OppPerID: input.personId,
            OppStoID: input.stateId,
            OppOpbID: input.probabilityId,
            OppDate: input.signDate,
            OppStake: input.amount,
            OppGammeShouhaitee_: input.gammeIds,
            OppCourtier_: input.courtierEntId,
          },
        },
      },
    );
  }

  private async toDisplayOpportunity(bean: EfficyBean): Promise<EfficyBrokerOpportunityWithDisplay> {
    const opportunity: EfficyBrokerOpportunity = {
      OppEntID: readAsRawText(bean, "OppEntID"),
      OppPerID: readAsRawText(bean, "OppPerID"),
      OppStoID: readAsRawText(bean, "OppStoID"),
      OppStuID: readAsRawText(bean, "OppStuID"),
      OppTitle: readAsText(bean, "OppTitle"),
      OppDate: readAsText(bean, "OppDate"),
      OppNumRef: readAsText(bean, "OppNumRef"),
      OppGammeShouhaitee_: readAsRawArray(bean, "OppGammeShouhaitee_"),
      OppOpbID: readAsRawText(bean, "OppOpbID"),
      OppNivSouhaite_: readAsRawText(bean, "OppNivSouhaite_"),
      OppRegimeAssurance_: readAsRawText(bean, "OppRegimeAssurance_"),
      OppStake: readAsNumber(bean, "OppStake"),
      OppDetail: readAsText(bean, "OppDetail"),
    };

    const [enterpriseName, personInfo, statusLabel, stateLabel, probability, protectionLevelLabel, insuranceSchemeLabel] =
      await Promise.all([
        this.getEnterpriseName(opportunity.OppEntID),
        this.getPersonInfo(opportunity.OppPerID),
        this.getReferentialLabel("OppStoID", opportunity.OppStoID),
        this.getReferentialLabel("OppStuID", opportunity.OppStuID),
        this.getReferentialNumber("OppOpbID", opportunity.OppOpbID),
        this.getReferentialLabel("OppNivSouhaite_", opportunity.OppNivSouhaite_),
        this.getReferentialLabel("OppRegimeAssurance_", opportunity.OppRegimeAssurance_),
      ]);

    const personPosition = await this.getReferentialLabel("PerFctID", personInfo.functionId);
    const gammeLabels = await Promise.all(
      opportunity.OppGammeShouhaitee_.map((id) => this.getReferentialLabel("OppGammeShouhaitee_", id)),
    );

    return {
      ...opportunity,
      enterpriseName,
      personName: personInfo.name,
      personPosition,
      statusLabel,
      stateLabel,
      gammeLabels: gammeLabels.filter(Boolean),
      probability,
      protectionLevelLabel,
      insuranceSchemeLabel,
    };
  }

  private async getEnterpriseName(enterpriseId: string): Promise<string> {
    if (!enterpriseId) {
      return "";
    }

    const cached = this.enterpriseCache.get(enterpriseId);
    if (cached !== undefined) {
      return cached;
    }

    const response = await this.httpClient.get<unknown>(`/base/Enterprise/${encodeURIComponent(enterpriseId)}`);
    const bean = readSingleBean(response);
    const name = bean ? readAsText(bean, "EntCorpName") : "";
    this.enterpriseCache.set(enterpriseId, name);
    return name;
  }

  private async getPersonInfo(personId: string): Promise<PersonInfo> {
    if (!personId) {
      return { name: "", functionId: "" };
    }

    const cached = this.personCache.get(personId);
    if (cached) {
      return cached;
    }

    const response = await this.httpClient.get<unknown>(`/base/Person/${encodeURIComponent(personId)}`);
    const bean = readSingleBean(response);
    if (!bean) {
      return { name: "", functionId: "" };
    }

    const info = {
      name: [readAsText(bean, "PerFstName"), readAsText(bean, "PerName")]
        .filter(Boolean)
        .join(" "),
      functionId: readAsRawText(bean, "PerFctID"),
    };

    this.personCache.set(personId, info);
    return info;
  }

  private async getReferentialMap(field: string): Promise<Map<string, ReferentialItem>> {
    const cached = this.referentialCache.get(field);
    if (cached) {
      return cached;
    }

    const response = await this.httpClient.get<unknown>(`/service/referential_for?field=${encodeURIComponent(field)}`);
    const rows = extractReferentialRows(response);
    const map = new Map<string, ReferentialItem>();
    rows.forEach((row) => {
      if (row.id) {
        map.set(row.id, row);
      }
    });

    this.referentialCache.set(field, map);
    return map;
  }

  private async getReferentialLabel(field: string, id: string): Promise<string> {
    if (!id) {
      return "";
    }

    const map = await this.getReferentialMap(field);
    const entry = map.get(id);
    if (!entry) {
      return "";
    }

    return typeof entry.te1 === "string" ? decodeHtmlEntities(entry.te1) : "";
  }

  private async getReferentialNumber(field: string, id: string): Promise<number> {
    if (!id) {
      return 0;
    }

    const map = await this.getReferentialMap(field);
    const entry = map.get(id);
    if (!entry) {
      return 0;
    }

    if (typeof entry.nu1 === "number") {
      return entry.nu1;
    }

    if (typeof entry.nu1 === "string") {
      const parsed = Number.parseFloat(entry.nu1);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private toReferentialOptions(
    map: Map<string, ReferentialItem>,
    labelField: "te1" | "nu1",
  ): EfficyReferentialOption[] {
    return Array.from(map.entries())
      .map(([id, row]) => ({
        id,
        label: labelField === "nu1" ? String(row.nu1 ?? "") : String(row.te1 ?? ""),
      }))
      .filter((entry) => entry.id && entry.label);
  }
}
