import { EfficyApiClient } from "./efficyApiClient";
import { DemandesService } from "./demandesService";
import { HttpClient, resolveApiBaseUrl } from "./httpClient";
import type { EfficyAttachment, EfficyDemande } from "./models";

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

type UploadTarget = "profile" | "demande";

export class DocumentsService {
  private readonly apiClient: EfficyApiClient;
  private readonly demandesService: DemandesService;

  constructor(apiBasePath: string) {
    this.apiClient = new EfficyApiClient(new HttpClient(resolveApiBaseUrl(apiBasePath)));
    this.demandesService = new DemandesService(apiBasePath);
  }

  async listCurrentUserDocuments(): Promise<{ personId: string; documents: EfficyAttachment[] }> {
    const personId = await this.apiClient.getCurrentUserPersonId();
    if (!personId) {
      throw new Error("Unable to resolve logged user Efficy person");
    }

    const personAttachmentIds = await this.apiClient.getPersonAttachmentIds(personId);
    const normalizedIds = Array.from(new Set(personAttachmentIds.flatMap((id) => splitIds(id))));
    const documents = await this.listAttachmentsByIds(normalizedIds);

    return { personId, documents };
  }

  async listDemandesForCurrentUser(pageSize: number): Promise<EfficyDemande[]> {
    return this.demandesService.listDemandes(pageSize);
  }

  async uploadAndAttachDocument(input: {
    file: File;
    target: UploadTarget;
    personId: string;
    demandeId?: string;
  }): Promise<void> {
    const attachmentId = await this.apiClient.createAttachment(input.file);
    if (!attachmentId) {
      throw new Error("documents.errors.upload");
    }

    if (input.target === "demande") {
      if (!input.demandeId) {
        throw new Error("documents.errors.requiredDemande");
      }

      const existingDemandeAttachmentIds = await this.apiClient.getDemandeAttachmentIds(input.demandeId);
      const mergedDemandeAttachmentIds = Array.from(
        new Set([...existingDemandeAttachmentIds.flatMap((id) => splitIds(id)), attachmentId]),
      );
      await this.apiClient.updateDemandeAttachmentIds(input.demandeId, mergedDemandeAttachmentIds);
      return;
    }

    const existingPersonAttachmentIds = await this.apiClient.getPersonAttachmentIds(input.personId);
    const mergedPersonAttachmentIds = Array.from(
      new Set([...existingPersonAttachmentIds.flatMap((id) => splitIds(id)), attachmentId]),
    );
    await this.apiClient.updatePersonAttachmentIds(input.personId, mergedPersonAttachmentIds);
  }

  async downloadDocument(attachment: EfficyAttachment): Promise<void> {
    const content = await this.apiClient.getAttachmentContent(attachment.id);
    const file = content?.file ?? attachment.file;
    if (!file) {
      throw new Error("documents.errors.download");
    }

    const bytes = this.toByteArray(file);
    if (!bytes) {
      throw new Error("documents.errors.download");
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

  private async listAttachmentsByIds(attachmentIds: string[]): Promise<EfficyAttachment[]> {
    const attachments: EfficyAttachment[] = [];

    for (const id of attachmentIds) {
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
        // Keep behavior resilient: one broken attachment should not block the full list.
      }
    }

    return attachments;
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
