import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DemandesService } from "../../services/demandesService";
import type {
  EfficyAttachment,
  EfficyDemande,
  EfficyQualification,
  EfficyReferentialOption,
} from "../../services/models";
import type { DemandesListIslandProps } from "./types";
import classes from "./DemandesList.module.css";

type LoadState = "idle" | "loading" | "loaded" | "error";

function formatDate(value: string, locale: string): string {
  if (!value) {
    return "-";
  }

  const maybeDate = new Date(value);
  if (Number.isNaN(maybeDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale || "fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(maybeDate);
}

function normalizeBadgeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getPriorityClass(priority: string): string {
  const normalized = normalizeBadgeLabel(priority);

  if (["urgent"].includes(normalized)) {
    return classes.priorityUrgent;
  }

  if (["elevee", "haute", "high"].includes(normalized)) {
    return classes.priorityHigh;
  }

  if (["moyenne", "medium"].includes(normalized)) {
    return classes.priorityMedium;
  }

  if (["normale", "normal"].includes(normalized)) {
    return classes.priorityNormal;
  }

  if (["basse", "faible", "low"].includes(normalized)) {
    return classes.priorityLow;
  }

  return classes.priorityDefault;
}

function getStatusClass(status: string): string {
  const normalized = normalizeBadgeLabel(status);

  if (["en cours", "in progress", "encours"].includes(normalized)) {
    return classes.statusInProgress;
  }

  if (["en attente client", "pending customer", "waiting customer"].includes(normalized)) {
    return classes.statusWaitingCustomer;
  }

  if (["a qualifier", "to qualify", "toqualify", "toqualifier"].includes(normalized)) {
    return classes.statusToQualify;
  }

  if (["fermee", "closed"].includes(normalized)) {
    return classes.statusClosed;
  }

  if (["termine", "terminee", "completed", "done"].includes(normalized)) {
    return classes.statusCompleted;
  }

  if (["annulee", "annule", "cancelled", "canceled"].includes(normalized)) {
    return classes.statusCancelled;
  }

  return classes.statusDefault;
}

function formatAttachmentSize(size?: number): string {
  if (!size || size <= 0) {
    return "";
  }

  const kilobytes = size / 1024;
  if (kilobytes < 1024) {
    return `${Math.round(kilobytes)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

export default function DemandesListIsland({
  title,
  pageSize,
  apiBasePath,
}: DemandesListIslandProps) {
  const { t, i18n } = useTranslation();

  const [state, setState] = useState<LoadState>("idle");
  const [demandes, setDemandes] = useState<EfficyDemande[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateLoading, setIsCreateLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(null);
  const [qualifications, setQualifications] = useState<EfficyQualification[]>([]);
  const [priorities, setPriorities] = useState<EfficyReferentialOption[]>([]);
  const [qualificationId, setQualificationId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const [selectedDemande, setSelectedDemande] = useState<EfficyDemande | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [detailErrorMessage, setDetailErrorMessage] = useState<string | null>(null);
  const [detailAttachments, setDetailAttachments] = useState<EfficyAttachment[]>([]);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);

  const demandesService = useMemo(() => new DemandesService(apiBasePath), [apiBasePath]);

  const loadDemandes = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);

    try {
      const data = await demandesService.listDemandes(pageSize);
      setDemandes(data);
      setState("loaded");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : t("demandes.errors.unexpected");
      setErrorMessage(nextMessage);
      setState("error");
    }
  }, [demandesService, pageSize, t]);

  const loadCreateOptions = useCallback(async () => {
    setIsCreateLoading(true);
    setCreateErrorMessage(null);

    try {
      const { qualifications: nextQualifications, priorities: nextPriorities } =
        await demandesService.fetchCreationOptions();
      setQualifications(nextQualifications);
      setPriorities(nextPriorities);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : t("demandes.errors.unexpected");
      setCreateErrorMessage(nextMessage);
    } finally {
      setIsCreateLoading(false);
    }
  }, [demandesService, t]);

  const openCreateForm = useCallback(async () => {
    setIsCreateOpen(true);

    if (qualifications.length === 0 || priorities.length === 0) {
      await loadCreateOptions();
    }
  }, [loadCreateOptions, priorities.length, qualifications.length]);

  const closeCreateForm = useCallback(() => {
    setIsCreateOpen(false);
    setCreateErrorMessage(null);
    setQualificationId("");
    setPriorityId("");
    setDescription("");
    setAttachmentFile(null);
  }, []);

  const submitCreateDemande = useCallback(async () => {
    if (!qualificationId || !description.trim()) {
      setCreateErrorMessage(t("demandes.create.errors.required"));
      return;
    }

    setIsCreating(true);
    setCreateErrorMessage(null);

    try {
      await demandesService.createDemandeForCurrentUser({
        qualificationId,
        priorityId: priorityId || undefined,
        description,
        attachmentFile: attachmentFile || undefined,
      });

      closeCreateForm();
      await loadDemandes();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const nextMessage =
        rawMessage.startsWith("demandes.") ? t(rawMessage) : rawMessage || t("demandes.create.errors.failed");
      setCreateErrorMessage(nextMessage);
    } finally {
      setIsCreating(false);
    }
  }, [
    attachmentFile,
    closeCreateForm,
    demandesService,
    description,
    loadDemandes,
    priorityId,
    qualificationId,
    t,
  ]);

  const openDemandeDetails = useCallback(
    async (demande: EfficyDemande) => {
      setSelectedDemande(demande);
      setDetailAttachments([]);
      setDetailErrorMessage(null);
      setDetailState("loading");

      try {
        const attachmentIds = await demandesService.resolveDemandeAttachmentIds(demande);
        if (attachmentIds.length === 0) {
          setDetailState("loaded");
          return;
        }

        const attachments = await demandesService.listDemandeAttachments(attachmentIds);
        setDetailAttachments(attachments);
        setDetailState("loaded");
      } catch (error) {
        const nextMessage = error instanceof Error ? error.message : t("demandes.details.errors.load");
        setDetailErrorMessage(nextMessage);
        setDetailState("error");
      }
    },
    [demandesService, t],
  );

  const closeDemandeDetails = useCallback(() => {
    setSelectedDemande(null);
    setDetailAttachments([]);
    setDetailErrorMessage(null);
    setDetailState("idle");
    setDownloadingAttachmentId(null);
  }, []);

  const downloadAttachment = useCallback(
    async (attachment: EfficyAttachment) => {
      setDownloadingAttachmentId(attachment.id);
      setDetailErrorMessage(null);

      try {
        await demandesService.downloadAttachment(attachment);
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "";
        const nextMessage =
          rawMessage.startsWith("demandes.") ? t(rawMessage) : rawMessage || t("demandes.details.errors.download");
        setDetailErrorMessage(nextMessage);
      } finally {
        setDownloadingAttachmentId(null);
      }
    },
    [demandesService, t],
  );

  useEffect(() => {
    void loadDemandes();
  }, [loadDemandes]);

  const resolvedTitle = title || t("demandes.title");
  const dateLocale = i18n.resolvedLanguage || i18n.language || "fr-FR";

  if (selectedDemande) {
    return (
      <section className={classes.container}>
        <header className={classes.detailHeader}>
          <button className={classes.secondaryButton} onClick={closeDemandeDetails} type="button">
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ←
              </span>
              <span>{t("demandes.details.back")}</span>
            </span>
          </button>
          <h3 className={classes.detailHeading}>{t("demandes.details.title", { id: selectedDemande.id })}</h3>
          <div className={classes.detailBadges}>
            <span className={`${classes.badge} ${getStatusClass(selectedDemande.status)}`}>{selectedDemande.status || "-"}</span>
            <span className={`${classes.badge} ${getPriorityClass(selectedDemande.priority)}`}>
              {selectedDemande.priority || "-"}
            </span>
          </div>
        </header>

        <section className={classes.detailSection}>
          <h4 className={classes.detailSectionTitle}>{t("demandes.details.description")}</h4>
          <p className={classes.detailDescription}>{selectedDemande.description || "-"}</p>
        </section>

        <section className={classes.detailSection}>
          <h4 className={classes.detailSectionTitle}>{t("demandes.details.info")}</h4>
          <div className={classes.detailInfoGrid}>
            <div className={classes.detailInfoItem}>
              <span>{t("demandes.table.code")}</span>
              <strong>{selectedDemande.id || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("demandes.table.type")}</span>
              <strong>{selectedDemande.type || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("demandes.table.createdOn")}</span>
              <strong>{formatDate(selectedDemande.dateCreated, dateLocale)}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("demandes.table.assignedTo")}</span>
              <strong>{selectedDemande.assignedTo || "-"}</strong>
            </div>
          </div>
        </section>

        <section className={classes.detailSection}>
          <h4 className={classes.detailSectionTitle}>{t("demandes.details.attachments")}</h4>

          {detailState === "loading" && <p>{t("demandes.details.loadingAttachments")}</p>}
          {detailState === "error" && (
            <p className={classes.createError}>{detailErrorMessage || t("demandes.details.errors.load")}</p>
          )}
          {detailState === "loaded" && detailAttachments.length === 0 && (
            <p>{t("demandes.details.noAttachments")}</p>
          )}

          {detailState === "loaded" && detailAttachments.length > 0 && (
            <ul className={classes.attachmentsList}>
              {detailAttachments.map((attachment) => (
                <li className={classes.attachmentItem} key={attachment.id}>
                  <div className={classes.attachmentInfo}>
                    <strong>{attachment.name || attachment.id}</strong>
                    <span>
                      {formatDate(attachment.dateCreated, dateLocale)}
                      {attachment.mimeType ? ` • ${attachment.mimeType}` : ""}
                      {attachment.size ? ` • ${formatAttachmentSize(attachment.size)}` : ""}
                    </span>
                  </div>
                  <button
                    className={classes.refreshButton}
                    onClick={() => void downloadAttachment(attachment)}
                    type="button"
                    disabled={downloadingAttachmentId === attachment.id}
                  >
                    <span className={classes.buttonContent}>
                      <span className={classes.buttonIcon} aria-hidden="true">
                        ⤓
                      </span>
                      <span>
                        {downloadingAttachmentId === attachment.id
                          ? t("demandes.details.downloading")
                          : t("demandes.details.download")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {detailErrorMessage && detailState !== "error" && <p className={classes.createError}>{detailErrorMessage}</p>}
        </section>
      </section>
    );
  }

  return (
    <section className={classes.container}>
      <header className={classes.header}>
        <h2 className={classes.title}>{resolvedTitle}</h2>
        <div className={classes.headerActions}>
          <button className={classes.createButton} onClick={() => void openCreateForm()} type="button">
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ＋
              </span>
              <span>{t("demandes.actions.new")}</span>
            </span>
          </button>
          <button className={classes.refreshButton} onClick={() => void loadDemandes()} type="button">
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ↻
              </span>
              <span>{t("demandes.actions.refresh")}</span>
            </span>
          </button>
        </div>
      </header>

      {isCreateOpen && (
        <section className={classes.createPanel}>
          <h3 className={classes.createTitle}>{t("demandes.create.title")}</h3>
          <p className={classes.createSubtitle}>{t("demandes.create.subtitle")}</p>

          {isCreateLoading && <p className={classes.createLoading}>{t("demandes.create.loadingOptions")}</p>}

          <div className={classes.createFormGrid}>
            <label className={classes.createField} htmlFor="demandes-qualification">
              <span>{t("demandes.create.fields.category")}</span>
              <select
                id="demandes-qualification"
                className={classes.selectInput}
                value={qualificationId}
                onChange={(event) => setQualificationId(event.target.value)}
                disabled={isCreateLoading || isCreating}
              >
                <option value="">{t("demandes.create.placeholders.category")}</option>
                {qualifications.map((qualification) => (
                  <option key={qualification.id} value={qualification.id}>
                    {qualification.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={classes.createField} htmlFor="demandes-priority">
              <span>{t("demandes.create.fields.priority")}</span>
              <select
                id="demandes-priority"
                className={classes.selectInput}
                value={priorityId}
                onChange={(event) => setPriorityId(event.target.value)}
                disabled={isCreateLoading || isCreating}
              >
                <option value="">{t("demandes.create.placeholders.priority")}</option>
                {priorities.map((priority) => (
                  <option key={priority.id} value={priority.id}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={`${classes.createField} ${classes.fullWidth}`} htmlFor="demandes-description">
              <span>{t("demandes.create.fields.description")}</span>
              <textarea
                id="demandes-description"
                className={classes.textareaInput}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("demandes.create.placeholders.description")}
                disabled={isCreating}
              />
            </label>

            <label className={`${classes.createField} ${classes.fullWidth}`} htmlFor="demandes-attachment">
              <span>{t("demandes.create.fields.attachment")}</span>
              <input
                id="demandes-attachment"
                className={classes.fileInput}
                type="file"
                onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                disabled={isCreating}
              />
              {attachmentFile && (
                <small className={classes.fileHint}>
                  {t("demandes.create.selectedFile", { name: attachmentFile.name })}
                </small>
              )}
            </label>
          </div>

          {createErrorMessage && <p className={classes.createError}>{createErrorMessage}</p>}

          <div className={classes.createActions}>
            <button className={classes.secondaryButton} onClick={closeCreateForm} type="button" disabled={isCreating}>
              <span className={classes.buttonContent}>
                <span className={classes.buttonIcon} aria-hidden="true">
                  ×
                </span>
                <span>{t("demandes.actions.cancel")}</span>
              </span>
            </button>
            <button
              className={classes.createSubmitButton}
              onClick={() => void submitCreateDemande()}
              type="button"
              disabled={isCreating || isCreateLoading}
            >
              <span className={classes.buttonContent}>
                <span className={classes.buttonIcon} aria-hidden="true">
                  ➤
                </span>
                <span>{isCreating ? t("demandes.actions.creating") : t("demandes.actions.submit")}</span>
              </span>
            </button>
          </div>
        </section>
      )}

      {state === "loading" && (
        <div className={classes.loadingState}>
          <span className={classes.spinner} aria-hidden="true" />
          <span>{t("demandes.loading")}</span>
        </div>
      )}

      {state === "error" && (
        <div className={classes.errorState} role="alert">
          <p>{t("demandes.errors.load")}</p>
          <p className={classes.errorMessage}>{errorMessage}</p>
          <button className={classes.retryButton} onClick={() => void loadDemandes()} type="button">
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ↺
              </span>
              <span>{t("demandes.actions.retry")}</span>
            </span>
          </button>
        </div>
      )}

      {state === "loaded" && demandes.length === 0 && <div className={classes.emptyState}>{t("demandes.empty")}</div>}

      {state === "loaded" && demandes.length > 0 && (
        <>
          <div className={classes.tableWrapper}>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>{t("demandes.table.code")}</th>
                  <th>{t("demandes.table.type")}</th>
                  <th>{t("demandes.table.status")}</th>
                  <th>{t("demandes.table.assignedTo")}</th>
                  <th>{t("demandes.table.createdOn")}</th>
                  <th>{t("demandes.table.priority")}</th>
                  <th>{t("demandes.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {demandes.map((demande) => (
                  <tr key={demande.id || demande.dmdId}>
                    <td>{demande.id || "-"}</td>
                    <td>{demande.type || "-"}</td>
                    <td>
                      <span className={`${classes.badge} ${getStatusClass(demande.status)}`}>{demande.status || "-"}</span>
                    </td>
                    <td>{demande.assignedTo || "-"}</td>
                    <td>{formatDate(demande.dateCreated, dateLocale)}</td>
                    <td>
                      <span className={`${classes.badge} ${getPriorityClass(demande.priority)}`}>
                        {demande.priority || "-"}
                      </span>
                    </td>
                    <td>
                      <button className={classes.secondaryButton} onClick={() => void openDemandeDetails(demande)} type="button">
                        <span className={classes.buttonContent}>
                          <span className={classes.buttonIcon} aria-hidden="true">
                            ➜
                          </span>
                          <span>{t("demandes.details.open")}</span>
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={classes.mobileCards}>
            {demandes.map((demande) => (
              <article className={classes.mobileCard} key={`${demande.id || demande.dmdId || "unknown"}-mobile`}>
                <div className={classes.mobileRow}>
                  <span className={classes.mobileLabel}>{t("demandes.table.code")}</span>
                  <strong>{demande.id || "-"}</strong>
                </div>
                <div className={classes.mobileRow}>
                  <span className={classes.mobileLabel}>{t("demandes.table.type")}</span>
                  <span>{demande.type || "-"}</span>
                </div>
                <div className={classes.mobileRow}>
                  <span className={classes.mobileLabel}>{t("demandes.table.status")}</span>
                  <span className={`${classes.badge} ${getStatusClass(demande.status)}`}>{demande.status || "-"}</span>
                </div>
                <div className={classes.mobileRow}>
                  <span className={classes.mobileLabel}>{t("demandes.table.priority")}</span>
                  <span className={`${classes.badge} ${getPriorityClass(demande.priority)}`}>
                    {demande.priority || "-"}
                  </span>
                </div>
                <div className={classes.mobileRow}>
                  <span className={classes.mobileLabel}>{t("demandes.table.createdOn")}</span>
                  <span>{formatDate(demande.dateCreated, dateLocale)}</span>
                </div>
                <div className={classes.mobileRow}>
                  <span className={classes.mobileLabel}>{t("demandes.table.assignedTo")}</span>
                  <span>{demande.assignedTo || "-"}</span>
                </div>
                <div className={classes.mobileActions}>
                  <button className={classes.secondaryButton} onClick={() => void openDemandeDetails(demande)} type="button">
                    <span className={classes.buttonContent}>
                      <span className={classes.buttonIcon} aria-hidden="true">
                        ➜
                      </span>
                      <span>{t("demandes.details.open")}</span>
                    </span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
