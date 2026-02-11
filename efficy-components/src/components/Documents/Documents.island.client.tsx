import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DocumentsService } from "../../services/documentsService";
import type { EfficyAttachment, EfficyDemande } from "../../services/models";
import type { DocumentsIslandProps } from "./types";
import classes from "./Documents.module.css";

type LoadState = "idle" | "loading" | "loaded" | "error";
type SubmitState = "idle" | "submitting" | "success" | "error";
type UploadTarget = "profile" | "demande";

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

function formatSize(size?: number): string {
  if (!size || size <= 0) {
    return "-";
  }

  const kilobytes = size / 1024;
  if (kilobytes < 1024) {
    return `${Math.round(kilobytes)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

export default function DocumentsIsland({ title, pageSize, apiBasePath }: DocumentsIslandProps) {
  const { t, i18n } = useTranslation();
  const documentsService = useMemo(() => new DocumentsService(apiBasePath), [apiBasePath]);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);

  const [personId, setPersonId] = useState("");
  const [documents, setDocuments] = useState<EfficyAttachment[]>([]);
  const [demandes, setDemandes] = useState<EfficyDemande[]>([]);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>("demande");
  const [selectedDemandeId, setSelectedDemandeId] = useState("");

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadErrorMessage, setDownloadErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoadState("loading");
    setLoadErrorMessage(null);
    setDownloadErrorMessage(null);

    try {
      const [{ personId: currentPersonId, documents: nextDocuments }, nextDemandes] = await Promise.all([
        documentsService.listCurrentUserDocuments(),
        documentsService.listDemandesForCurrentUser(pageSize),
      ]);

      setPersonId(currentPersonId);
      setDocuments(nextDocuments);
      setDemandes(nextDemandes);
      setLoadState("loaded");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : t("documents.errors.load");
      setLoadErrorMessage(nextMessage);
      setLoadState("error");
    }
  }, [documentsService, pageSize, t]);

  const resetUploadState = useCallback(() => {
    setUploadFile(null);
    setUploadTarget("demande");
    setSelectedDemandeId("");
    setSubmitState("idle");
    setSubmitErrorMessage(null);
  }, []);

  const openUpload = useCallback(() => {
    resetUploadState();
    setIsUploadOpen(true);
  }, [resetUploadState]);

  const closeUpload = useCallback(() => {
    setIsUploadOpen(false);
    resetUploadState();
  }, [resetUploadState]);

  const submitUpload = useCallback(async () => {
    if (!uploadFile) {
      setSubmitState("error");
      setSubmitErrorMessage(t("documents.errors.requiredFile"));
      return;
    }

    if (uploadTarget === "demande" && !selectedDemandeId) {
      setSubmitState("error");
      setSubmitErrorMessage(t("documents.errors.requiredDemande"));
      return;
    }

    if (!personId) {
      setSubmitState("error");
      setSubmitErrorMessage(t("documents.errors.upload"));
      return;
    }

    setSubmitState("submitting");
    setSubmitErrorMessage(null);

    try {
      await documentsService.uploadAndAttachDocument({
        file: uploadFile,
        target: uploadTarget,
        personId,
        demandeId: uploadTarget === "demande" ? selectedDemandeId : undefined,
      });

      setSubmitState("success");
      await loadData();
      closeUpload();
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const nextMessage = rawMessage.startsWith("documents.") ? t(rawMessage) : rawMessage || t("documents.errors.upload");
      setSubmitState("error");
      setSubmitErrorMessage(nextMessage);
    }
  }, [
    closeUpload,
    documentsService,
    loadData,
    personId,
    selectedDemandeId,
    t,
    uploadFile,
    uploadTarget,
  ]);

  const downloadDocument = useCallback(
    async (document: EfficyAttachment) => {
      setDownloadingId(document.id);
      setDownloadErrorMessage(null);

      try {
        await documentsService.downloadDocument(document);
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "";
        const nextMessage = rawMessage.startsWith("documents.") ? t(rawMessage) : rawMessage || t("documents.errors.download");
        setDownloadErrorMessage(nextMessage);
      } finally {
        setDownloadingId(null);
      }
    },
    [documentsService, t],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const resolvedTitle = title || t("documents.title");
  const dateLocale = i18n.resolvedLanguage || i18n.language || "fr-FR";

  return (
    <section className={classes.container}>
      <header className={classes.header}>
        <div>
          <h2 className={classes.title}>{resolvedTitle}</h2>
          <p className={classes.subtitle}>{t("documents.subtitle")}</p>
        </div>
        <div className={classes.headerActions}>
          <button className={classes.primaryButton} type="button" onClick={openUpload}>
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ＋
              </span>
              {t("documents.actions.upload")}
            </span>
          </button>
          <button className={classes.secondaryButton} type="button" onClick={() => void loadData()}>
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ↻
              </span>
              {t("documents.actions.refresh")}
            </span>
          </button>
        </div>
      </header>

      {isUploadOpen && (
        <section className={classes.uploadPanel}>
          <h3 className={classes.panelTitle}>{t("documents.upload.title")}</h3>

          <div className={classes.fieldGrid}>
            <label className={classes.field} htmlFor="documents-upload-file">
              <span>{t("documents.upload.fields.file")}</span>
              <input
                id="documents-upload-file"
                className={classes.fileInput}
                type="file"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                disabled={submitState === "submitting"}
              />
            </label>

            <label className={classes.field} htmlFor="documents-upload-target">
              <span>{t("documents.upload.fields.target")}</span>
              <select
                id="documents-upload-target"
                className={classes.selectInput}
                value={uploadTarget}
                onChange={(event) => {
                  const nextTarget = event.target.value as UploadTarget;
                  setUploadTarget(nextTarget);
                  if (nextTarget === "profile") {
                    setSelectedDemandeId("");
                  }
                }}
                disabled={submitState === "submitting"}
              >
                <option value="demande">{t("documents.upload.targets.demande")}</option>
                <option value="profile">{t("documents.upload.targets.profile")}</option>
              </select>
            </label>

            {uploadTarget === "demande" && (
              <label className={`${classes.field} ${classes.fullWidth}`} htmlFor="documents-upload-demande">
                <span>{t("documents.upload.fields.demande")}</span>
                <select
                  id="documents-upload-demande"
                  className={classes.selectInput}
                  value={selectedDemandeId}
                  onChange={(event) => setSelectedDemandeId(event.target.value)}
                  disabled={submitState === "submitting"}
                >
                  <option value="">{t("documents.upload.selectDemande")}</option>
                  {demandes.map((demande) => (
                    <option key={demande.dmdId || demande.id} value={demande.dmdId}>
                      {demande.id || demande.dmdId}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {submitState === "error" && <p className={classes.errorText}>{submitErrorMessage}</p>}
          {submitState === "success" && <p className={classes.successText}>{t("documents.feedback.uploaded")}</p>}

          <div className={classes.uploadActions}>
            <button
              className={classes.secondaryButton}
              type="button"
              onClick={closeUpload}
              disabled={submitState === "submitting"}
            >
              <span className={classes.buttonContent}>
                <span className={classes.buttonIcon} aria-hidden="true">
                  ×
                </span>
                {t("documents.actions.cancel")}
              </span>
            </button>
            <button
              className={classes.primaryButton}
              type="button"
              onClick={() => void submitUpload()}
              disabled={submitState === "submitting"}
            >
              <span className={classes.buttonContent}>
                <span className={classes.buttonIcon} aria-hidden="true">
                  ↑
                </span>
                {submitState === "submitting" ? t("documents.actions.uploading") : t("documents.actions.submit")}
              </span>
            </button>
          </div>
        </section>
      )}

      {loadState === "loading" && (
        <div className={classes.loadingState}>
          <span className={classes.spinner} aria-hidden="true" />
          <span>{t("documents.loading")}</span>
        </div>
      )}

      {loadState === "error" && (
        <div className={classes.errorState} role="alert">
          <p>{t("documents.errors.load")}</p>
          <p className={classes.errorMessage}>{loadErrorMessage}</p>
          <button className={classes.retryButton} type="button" onClick={() => void loadData()}>
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ↺
              </span>
              {t("documents.actions.retry")}
            </span>
          </button>
        </div>
      )}

      {loadState === "loaded" && documents.length === 0 && (
        <div className={classes.emptyState}>{t("documents.empty")}</div>
      )}

      {loadState === "loaded" && documents.length > 0 && (
        <>
          <div className={classes.tableWrapper}>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>{t("documents.table.name")}</th>
                  <th>{t("documents.table.createdOn")}</th>
                  <th>{t("documents.table.type")}</th>
                  <th>{t("documents.table.size")}</th>
                  <th>{t("documents.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td>{document.name || document.id}</td>
                    <td>{formatDate(document.dateCreated, dateLocale)}</td>
                    <td>{document.mimeType || "-"}</td>
                    <td>{formatSize(document.size)}</td>
                    <td>
                      <button
                        className={classes.secondaryButton}
                        type="button"
                        onClick={() => void downloadDocument(document)}
                        disabled={downloadingId === document.id}
                      >
                        <span className={classes.buttonContent}>
                          <span className={classes.buttonIcon} aria-hidden="true">
                            ⤓
                          </span>
                          {downloadingId === document.id
                            ? t("documents.actions.downloading")
                            : t("documents.actions.download")}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={classes.mobileCards}>
            {documents.map((document) => (
              <article className={classes.mobileCard} key={`${document.id}-mobile`}>
                <div className={classes.mobileRow}>
                  <span className={classes.mobileLabel}>{t("documents.table.name")}</span>
                  <strong>{document.name || document.id}</strong>
                </div>
                <div className={classes.mobileRow}>
                  <span className={classes.mobileLabel}>{t("documents.table.createdOn")}</span>
                  <span>{formatDate(document.dateCreated, dateLocale)}</span>
                </div>
                <div className={classes.mobileRow}>
                  <span className={classes.mobileLabel}>{t("documents.table.type")}</span>
                  <span>{document.mimeType || "-"}</span>
                </div>
                <div className={classes.mobileRow}>
                  <span className={classes.mobileLabel}>{t("documents.table.size")}</span>
                  <span>{formatSize(document.size)}</span>
                </div>
                <div className={classes.mobileActions}>
                  <button
                    className={classes.secondaryButton}
                    type="button"
                    onClick={() => void downloadDocument(document)}
                    disabled={downloadingId === document.id}
                  >
                    <span className={classes.buttonContent}>
                      <span className={classes.buttonIcon} aria-hidden="true">
                        ⤓
                      </span>
                      {downloadingId === document.id
                        ? t("documents.actions.downloading")
                        : t("documents.actions.download")}
                    </span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {downloadErrorMessage && <p className={classes.errorText}>{downloadErrorMessage}</p>}
    </section>
  );
}
