import { HttpClient } from "./httpClient";
import type { EfficyAttachment, EfficyQualification, EfficyReferentialOption } from "./models";

export type EfficyResourceType = "advanced" | "base" | "service";

export interface EfficyBeanField {
  label?: string;
  value?: string | string[];
  raw_value?: string | string[];
}

export type EfficyBean = Record<string, EfficyBeanField | string | string[] | undefined>;

interface EfficyQueryResult {
  bean_data?: EfficyBean;
  [key: string]: unknown;
}

interface EfficyQueryResponse {
  data?: {
    query_results?: EfficyQueryResult[];
  };
}

interface EfficySingleBeanResponse {
  data?: {
    bean_data?: EfficyBean;
    bean_display?: string;
  };
}

interface EfficyReferentialItem {
  id?: string;
  te1?: string;
}

function encodeFilter(filter: string): string {
  return encodeURIComponent(filter);
}

function encodeRestrict(restrictTo: string): string {
  return encodeURIComponent(restrictTo);
}

function toText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export class EfficyApiClient {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async listDemandesForCurrentUser(pageSize: number): Promise<EfficyBean[]> {
    const response = await this.http.get<EfficyQueryResponse>(`/me/demandes?pageSize=${pageSize}`);

    return (response.data?.query_results ?? []).map((row) => this.toBean(row));
  }

  async getCurrentUserPersonId(): Promise<string> {
    const response = await this.http.get<EfficyQueryResponse>("/me/person");
    const person = response.data?.query_results?.[0];
    const bean = person ? this.toBean(person) : undefined;

    if (!bean) {
      return "";
    }

    const field = bean.PerID;
    if (typeof field === "string") {
      return field;
    }

    if (!field || Array.isArray(field)) {
      return "";
    }

    if (Array.isArray(field.raw_value)) {
      return toText(field.raw_value[0]);
    }

    if (Array.isArray(field.value)) {
      return toText(field.value[0]);
    }

    return field.raw_value?.toString() ?? field.value?.toString() ?? field.label ?? "";
  }

  async getPersonById(personId: string): Promise<EfficyBean | null> {
    const response = await this.http.get<EfficySingleBeanResponse>(
      `/base/Person/${encodeURIComponent(personId)}`,
    );

    const bean = ((response.data?.bean_data as EfficyBean | undefined) ??
      (response.data as unknown as EfficyBean | undefined) ??
      null) as EfficyBean | null;

    return bean;
  }

  async updatePersonFields(personId: string, fields: Record<string, unknown>): Promise<void> {
    await this.http.put<unknown>(
      `/base/Person/${encodeURIComponent(personId)}`,
      {
        data: {
          bean_data: fields,
        },
      },
    );
  }

  async fetchQualifications(): Promise<EfficyQualification[]> {
    const filter = encodeFilter(
      "{[[QulQualificationID:QuaIsExtranetAvailable,=,1],[QulLngID,=,00000000000008f4]]}",
    );
    const restrictTo = encodeRestrict(
      "{QulExtranetLabel,QulExtranetDescription,QulQualificationID,QulLngID}",
    );

    const response = await this.http.get<EfficyQueryResponse>(
      `/base/QualificationLabel?filter=${filter}&restrict_to=${restrictTo}`,
    );

    return (response.data?.query_results ?? [])
      .map((row) => this.toBean(row))
      .map((bean) => ({
        id: this.readAsRawText(bean, "QulQualificationID"),
        label: this.readAsText(bean, "QulExtranetLabel"),
        description: this.readAsText(bean, "QulExtranetDescription") || undefined,
      }))
      .filter((qualification) => qualification.id && qualification.label);
  }

  async fetchReferentialOptions(field: string): Promise<EfficyReferentialOption[]> {
    const response = await this.http.get<unknown>(
      `/service/referential_for?field=${encodeURIComponent(field)}`,
    );

    const rows = this.extractReferentialRows(response);

    return rows
      .map((row) => ({
        id: row.id ?? "",
        label: row.te1 ?? "",
      }))
      .filter((option) => option.id && option.label);
  }

  async createDemande(payload: unknown): Promise<unknown> {
    return this.http.post<unknown>("/base/Demande", payload);
  }

  extractCreatedDemandeId(response: unknown): string {
    const beanData = this.readPath(response, ["data", "bean_data"]);
    const fromBeanField = this.readStructuredFieldValue(beanData, "DmdID");
    if (fromBeanField) {
      return fromBeanField;
    }

    const fromTopDataField = this.readStructuredFieldValue(this.readPath(response, ["data"]), "DmdID");
    if (fromTopDataField) {
      return fromTopDataField;
    }

    return this.extractFirstString(response, [
      ["data", "DmdID"],
      ["DmdID"],
      ["data", "bean_display"],
      ["bean_display"],
    ]);
  }

  async createAttachment(file: File): Promise<string> {
    const base64 = await this.fileToBase64(file);
    const payload = {
      data: {
        bean_data: {
          AttFile: base64,
          AttContentType: file.type || "application/octet-stream",
          AttFileName: file.name,
          AttDesc: `[${file.name.replace(/\.[^.]+$/, "")}]`,
        },
      },
    };

    const response = await this.http.post<unknown>("/service/attachments", payload);

    return this.extractFirstString(response, [
      ["data", "bean_data", "AttID"],
      ["data", "bean_display"],
      ["data", "attID"],
      ["data", "AttID"],
      ["AttID"],
      ["attID"],
    ]);
  }

  async getDemandeAttachmentIds(demandeId: string): Promise<string[]> {
    const response = await this.http.get<EfficySingleBeanResponse>(
      `/base/Demande/${encodeURIComponent(demandeId)}`,
    );

    const bean = ((response.data?.bean_data as EfficyBean | undefined) ??
      (response.data as unknown as EfficyBean | undefined) ??
      {}) as EfficyBean;

    return this.readAsStringArray(bean, "DmdAttID");
  }

  async updateDemandeAttachmentIds(demandeId: string, attachmentIds: string[]): Promise<void> {
    await this.http.put<unknown>(
      `/base/Demande/${encodeURIComponent(demandeId)}`,
      {
        data: {
          bean_data: {
            DmdAttID: attachmentIds,
          },
        },
      },
    );
  }

  async getPersonAttachmentIds(personId: string): Promise<string[]> {
    const response = await this.http.get<EfficySingleBeanResponse>(
      `/base/Person/${encodeURIComponent(personId)}`,
    );

    const bean = ((response.data?.bean_data as EfficyBean | undefined) ??
      (response.data as unknown as EfficyBean | undefined) ??
      {}) as EfficyBean;

    return this.readAsStringArray(bean, "PerAttID");
  }

  async updatePersonAttachmentIds(personId: string, attachmentIds: string[]): Promise<void> {
    await this.http.put<unknown>(
      `/base/Person/${encodeURIComponent(personId)}`,
      {
        data: {
          bean_data: {
            PerAttID: attachmentIds,
          },
        },
      },
    );
  }

  async listAttachmentsById(attachmentId: string): Promise<EfficyAttachment[]> {
    const filter = encodeFilter(`{{[AttID,=,${attachmentId}]}}`);
    const response = await this.http.get<EfficyQueryResponse>(`/base/Attachment?filter=${filter}`);

    return (response.data?.query_results ?? [])
      .map((row) => this.toBean(row))
      .map((bean) => this.toAttachment(bean))
      .filter((attachment) => attachment.id);
  }

  async getAttachmentContent(attachmentId: string): Promise<EfficyAttachment | null> {
    const response = await this.http.get<EfficySingleBeanResponse>(
      `/base/Attachment/${encodeURIComponent(attachmentId)}`,
    );

    const bean = ((response.data?.bean_data as EfficyBean | undefined) ??
      (response.data as unknown as EfficyBean | undefined) ??
      null) as EfficyBean | null;

    if (!bean) {
      return null;
    }

    return this.toAttachment(bean);
  }

  async getActorDisplayName(actorId: string): Promise<string> {
    const filter = encodeFilter(`{{[ActID,=,${actorId}]}}`);
    const restrictTo = encodeRestrict("{ActID,ActCivID,ActName,ActFstName}");
    const response = await this.proxyGet("advanced", `Actor?filter=${filter}&restrict_to=${restrictTo}`);
    const actor = response.data?.query_results?.[0];
    const bean = actor ? this.toBean(actor) : undefined;

    if (!bean) {
      return "";
    }

    const civility = this.getLabel(bean, "ActCivID");
    const firstName = this.getLabel(bean, "ActFstName");
    const lastName = this.getLabel(bean, "ActName");

    return [civility, firstName, lastName].filter(Boolean).join(" ");
  }

  async getQualificationDisplayName(qualificationId: string): Promise<string> {
    const response = await this.http.get<EfficySingleBeanResponse>(
      `/base/Qualification/${encodeURIComponent(qualificationId)}`,
    );

    return response.data?.bean_display ?? "";
  }

  async proxyGet(resourceType: EfficyResourceType, path: string): Promise<EfficyQueryResponse> {
    return this.http.get<EfficyQueryResponse>(`/${resourceType}/${path}`);
  }

  private toBean(row: EfficyQueryResult): EfficyBean {
    return (row.bean_data as EfficyBean | undefined) ?? (row as EfficyBean);
  }

  private getLabel(bean: EfficyBean, key: string): string {
    const value = bean[key];
    if (typeof value === "string") {
      return value;
    }

    if (!value || Array.isArray(value)) {
      return "";
    }

    return value.label ?? value.value?.toString() ?? value.raw_value?.toString() ?? "";
  }

  private readAsText(bean: EfficyBean, key: string): string {
    const value = bean[key];
    if (typeof value === "string") {
      return value;
    }

    if (!value || Array.isArray(value)) {
      return "";
    }

    if (Array.isArray(value.label)) {
      return toText(value.label[0]);
    }

    if (Array.isArray(value.value)) {
      return toText(value.value[0]);
    }

    if (Array.isArray(value.raw_value)) {
      return toText(value.raw_value[0]);
    }

    return value.label ?? value.value?.toString() ?? value.raw_value?.toString() ?? "";
  }

  private readAsRawText(bean: EfficyBean, key: string): string {
    const value = bean[key];
    if (typeof value === "string") {
      return value;
    }

    if (!value || Array.isArray(value)) {
      return "";
    }

    const rawValue = value.raw_value ?? value.value;
    if (Array.isArray(rawValue)) {
      return rawValue[0] ?? "";
    }

    return rawValue ?? "";
  }

  private readAsStringArray(bean: EfficyBean, key: string): string[] {
    const value = bean[key];
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return this.normalizeStringArray(value);
    }

    if (typeof value === "string") {
      return this.normalizeStringArray([value]);
    }

    if (Array.isArray(value.raw_value)) {
      return this.normalizeStringArray(value.raw_value);
    }

    if (Array.isArray(value.value)) {
      return this.normalizeStringArray(value.value);
    }

    if (typeof value.raw_value === "string") {
      return this.normalizeStringArray([value.raw_value]);
    }

    if (typeof value.value === "string") {
      return this.normalizeStringArray([value.value]);
    }

    return [];
  }

  private normalizeStringArray(values: unknown[]): string[] {
    return values
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0);
  }

  private toAttachment(bean: EfficyBean): EfficyAttachment {
    const fileValue = this.readFieldValue(bean, "AttFile");
    const sizeFromField = this.readNumber(bean, "AttSize");

    let estimatedSize: number | undefined;
    if (!sizeFromField) {
      if (Array.isArray(fileValue)) {
        estimatedSize = fileValue.length;
      } else if (typeof fileValue === "string" && fileValue.length > 0) {
        estimatedSize = Math.floor(fileValue.length * 0.75);
      }
    }

    return {
      id: this.readAsRawText(bean, "AttID") || this.readAsText(bean, "AttID"),
      name: this.readAsText(bean, "AttFileName") || this.readAsText(bean, "AttName"),
      dateCreated: this.readAsText(bean, "AttCrDt"),
      mimeType: this.readAsText(bean, "AttContentType") || undefined,
      file: this.normalizeAttachmentFile(fileValue),
      size: sizeFromField ?? estimatedSize,
    };
  }

  private normalizeAttachmentFile(value: unknown): string | number[] | undefined {
    if (typeof value === "string") {
      return value;
    }

    if (!Array.isArray(value)) {
      return undefined;
    }

    const asNumbers = value.filter((entry) => typeof entry === "number") as number[];
    return asNumbers.length === value.length ? asNumbers : undefined;
  }

  private readFieldValue(bean: EfficyBean, key: string): unknown {
    const value = bean[key];
    if (value === undefined) {
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

  private readNumber(bean: EfficyBean, key: string): number | undefined {
    const raw = this.readFieldValue(bean, key);
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }

    if (typeof raw === "string") {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return undefined;
  }

  private extractFirstString(source: unknown, paths: string[][]): string {
    for (const path of paths) {
      const value = this.readPath(source, path);
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return "";
  }

  private readPath(source: unknown, path: string[]): unknown {
    let current: unknown = source;
    for (const segment of path) {
      if (!current || typeof current !== "object") {
        return undefined;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private readStructuredFieldValue(source: unknown, fieldName: string): string {
    if (!source || typeof source !== "object") {
      return "";
    }

    const field = (source as Record<string, unknown>)[fieldName];
    if (!field) {
      return "";
    }

    if (typeof field === "string") {
      return field.trim();
    }

    if (typeof field !== "object") {
      return "";
    }

    const value = field as Record<string, unknown>;
    const fromRaw = typeof value.raw_value === "string" ? value.raw_value.trim() : "";
    if (fromRaw) {
      return fromRaw;
    }

    const fromValue = typeof value.value === "string" ? value.value.trim() : "";
    if (fromValue) {
      return fromValue;
    }

    const fromLabel = typeof value.label === "string" ? value.label.trim() : "";
    if (fromLabel) {
      return fromLabel;
    }

    return "";
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = typeof reader.result === "string" ? reader.result : "";
        resolve(content.split(",")[1] ?? "");
      };
      reader.onerror = () => reject(reader.error ?? new Error("File reading failed"));
      reader.readAsDataURL(file);
    });
  }

  private extractReferentialRows(response: unknown): EfficyReferentialItem[] {
    if (Array.isArray(response)) {
      return response as EfficyReferentialItem[];
    }

    if (!response || typeof response !== "object") {
      return [];
    }

    const firstLevel = (response as Record<string, unknown>).data;
    if (Array.isArray(firstLevel)) {
      return firstLevel as EfficyReferentialItem[];
    }

    if (firstLevel && typeof firstLevel === "object") {
      const nested = (firstLevel as Record<string, unknown>).data;
      if (Array.isArray(nested)) {
        return nested as EfficyReferentialItem[];
      }
    }

    return [];
  }
}
