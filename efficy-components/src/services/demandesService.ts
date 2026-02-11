import { EfficyApiClient, type EfficyBean } from "./efficyApiClient";
import { HttpClient, resolveApiBaseUrl } from "./httpClient";
import type {
  EfficyAttachment,
  EfficyDemande,
  EfficyQualification,
  EfficyReferentialOption,
} from "./models";

const DEFAULT_EFFICY_ACTOR_ID = "00000000007d9285";

type CreateDemandeInput = {
  qualificationId: string;
  description: string;
  priorityId?: string;
  attachmentFile?: File;
};

function splitIds(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    const withoutBraces = trimmed.slice(1, -1).trim();
    if (!withoutBraces) {
      return [];
    }

    return withoutBraces
      .split(/[;,]/)
      .map((entry) => entry.replace(/^"+|"+$/g, "").trim())
      .filter((entry) => entry.length > 0);
  }

  return trimmed
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

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

function asArray(value: string | string[] | undefined): string[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .filter((entry) => typeof entry === "string")
      .flatMap((entry) => splitIds(entry));
    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const normalized = splitIds(value);
    return normalized.length > 0 ? normalized : undefined;
  }

  return undefined;
}

function readBeanField(bean: EfficyBean, key: string): string | string[] | undefined {
  const value = bean[key];
  if (typeof value === "string" || Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return undefined;
  }

  return value.label ?? value.raw_value ?? value.value;
}

function readRawBeanField(bean: EfficyBean, key: string): string | string[] | undefined {
  const value = bean[key];
  if (typeof value === "string" || Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return undefined;
  }

  return value.raw_value ?? value.value ?? value.label;
}

function readAsText(bean: EfficyBean, key: string): string {
  const field = readBeanField(bean, key);
  if (Array.isArray(field)) {
    return field.join(", ");
  }

  return field ?? "";
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
    return rawValue[0] ?? "";
  }

  return rawValue ?? "";
}

export class DemandesService {
  private readonly apiClient: EfficyApiClient;
  private readonly actorCache = new Map<string, string>();
  private readonly qualificationCache = new Map<string, string>();

  constructor(apiBasePath: string) {
    this.apiClient = new EfficyApiClient(new HttpClient(resolveApiBaseUrl(apiBasePath)));
  }

  async listDemandes(pageSize: number): Promise<EfficyDemande[]> {
    const demandes = await this.apiClient.listDemandesForCurrentUser(pageSize);

    return Promise.all(
      demandes.map(async (bean) => {
        const actorId = readAsRawText(bean, "DmdActID");
        const qualificationId = readAsRawText(bean, "DmdQualifID");

        const [assignedTo, type] = await Promise.all([
          this.resolveActorName(actorId),
          this.resolveQualificationName(qualificationId),
        ]);

        const dmdId = readAsRawText(bean, "DmdID");

        return {
          id: readAsText(bean, "DmdToken") || dmdId,
          dmdId,
          description: decodeHtmlEntities(readAsText(bean, "DmdDescription")),
          status: readAsText(bean, "DmdStatus"),
          dateCreated: readAsText(bean, "DmdCrDt"),
          priority: readAsText(bean, "DmdPriority"),
          type: type || undefined,
          assignedTo: assignedTo || undefined,
          attIds: asArray(readRawBeanField(bean, "DmdAttID")),
        } satisfies EfficyDemande;
      }),
    );
  }

  async fetchCreationOptions(): Promise<{
    qualifications: EfficyQualification[];
    priorities: EfficyReferentialOption[];
  }> {
    const [qualifications, priorities] = await Promise.all([
      this.apiClient.fetchQualifications(),
      this.apiClient.fetchReferentialOptions("DmdPriority"),
    ]);

    return { qualifications, priorities };
  }

  async createDemandeForCurrentUser(input: CreateDemandeInput): Promise<void> {
    const personId = await this.apiClient.getCurrentUserPersonId();
    if (!personId) {
      throw new Error("Unable to resolve logged user Efficy person");
    }

    const description = input.description.trim();
    if (!description || !input.qualificationId) {
      throw new Error("Missing required demande fields");
    }

    const payload = {
      data: {
        bean_data: {
          DmdActID: DEFAULT_EFFICY_ACTOR_ID,
          DmdPerID: personId,
          DmdBenefPerID: personId,
          DmdQualifID: input.qualificationId,
          DmdInChannel: "EXTRANET",
          DmdStatus: "TOQUALIFY",
          DmdDescription: description,
          ...(input.priorityId ? { DmdPriority: input.priorityId } : {}),
        },
      },
    };

    const createResponse = await this.apiClient.createDemande(payload);

    if (!input.attachmentFile) {
      return;
    }

    const demandeId = this.apiClient.extractCreatedDemandeId(createResponse);
    if (!demandeId) {
      throw new Error("demandes.create.errors.attachMissingDemande");
    }

    let attachmentId = "";
    try {
      attachmentId = await this.apiClient.createAttachment(input.attachmentFile);
    } catch {
      throw new Error("demandes.create.errors.attachUpload");
    }

    if (!attachmentId) {
      throw new Error("demandes.create.errors.attachUpload");
    }

    try {
      const existingAttachmentIds = await this.apiClient.getDemandeAttachmentIds(demandeId);
      const mergedAttachmentIds = Array.from(new Set([...existingAttachmentIds, attachmentId]));
      await this.apiClient.updateDemandeAttachmentIds(demandeId, mergedAttachmentIds);
    } catch {
      throw new Error("demandes.create.errors.attachLink");
    }
  }

  async listDemandeAttachments(attachmentIds: string[]): Promise<EfficyAttachment[]> {
    const normalizedIds = Array.from(new Set(attachmentIds.flatMap((id) => splitIds(id))));
    const attachments: EfficyAttachment[] = [];

    for (const id of normalizedIds) {
      if (!id) {
        continue;
      }

      try {
        const rows = await this.apiClient.listAttachmentsById(id);
        if (rows.length > 0) {
          attachments.push(...rows);
          continue;
        }

        const directAttachment = await this.apiClient.getAttachmentContent(id);
        if (directAttachment) {
          attachments.push(directAttachment);
        }
      } catch {
        // Keep behavior resilient: one broken attachment should not block details screen.
      }
    }

    return attachments;
  }

  async resolveDemandeAttachmentIds(demande: EfficyDemande): Promise<string[]> {
    const knownIds = Array.from(new Set((demande.attIds ?? []).flatMap((entry) => splitIds(entry))));

    if (!demande.dmdId) {
      return knownIds;
    }

    try {
      const currentIds = await this.apiClient.getDemandeAttachmentIds(demande.dmdId);
      const normalizedCurrentIds = Array.from(new Set(currentIds.flatMap((entry) => splitIds(entry))));

      if (normalizedCurrentIds.length > 0) {
        return normalizedCurrentIds;
      }
    } catch {
      // Fall back to list payload ids if direct read fails.
    }

    return knownIds;
  }

  async downloadAttachment(attachment: EfficyAttachment): Promise<void> {
    const content = await this.apiClient.getAttachmentContent(attachment.id);
    const file = content?.file ?? attachment.file;
    if (!file) {
      throw new Error("demandes.details.errors.download");
    }

    const bytes = this.toByteArray(file);
    if (!bytes) {
      throw new Error("demandes.details.errors.download");
    }

    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    const blob = new Blob([arrayBuffer], {
      type: content?.mimeType || attachment.mimeType || "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = content?.name || attachment.name || "attachment";
    link.click();
    URL.revokeObjectURL(url);
  }

  private async resolveActorName(actorId: string): Promise<string> {
    if (!actorId) {
      return "";
    }

    const cached = this.actorCache.get(actorId);
    if (cached !== undefined) {
      return cached;
    }

    const actor = await this.apiClient.getActorDisplayName(actorId);
    this.actorCache.set(actorId, actor);
    return actor;
  }

  private async resolveQualificationName(qualificationId: string): Promise<string> {
    if (!qualificationId) {
      return "";
    }

    const cached = this.qualificationCache.get(qualificationId);
    if (cached !== undefined) {
      return cached;
    }

    const qualification = await this.apiClient.getQualificationDisplayName(qualificationId);
    this.qualificationCache.set(qualificationId, qualification);
    return qualification;
  }

  private toByteArray(file: string | number[]): Uint8Array | null {
    if (Array.isArray(file)) {
      return new Uint8Array(file);
    }

    if (typeof file !== "string" || file.length === 0) {
      return null;
    }

    const binary = atob(file);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }
}
