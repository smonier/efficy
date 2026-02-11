import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KnowledgeBaseService } from "../../services/knowledgeBaseService";
import type { EfficyFaq } from "../../services/models";
import type { KnowledgeBaseIslandProps } from "./types";
import classes from "./KnowledgeBase.module.css";

type LoadState = "idle" | "loading" | "loaded" | "error";

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

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function toDisplayHtml(value: string): string {
  const decoded = decodeHtmlEntities(value).trim();
  if (!decoded) {
    return "";
  }

  if (/<[a-z][\s\S]*>/i.test(decoded)) {
    return decoded;
  }

  return decoded.replace(/\n/g, "<br />");
}

export default function KnowledgeBaseIsland({ title, apiBasePath }: KnowledgeBaseIslandProps) {
  const { t, i18n } = useTranslation();
  const knowledgeBaseService = useMemo(() => new KnowledgeBaseService(apiBasePath), [apiBasePath]);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<EfficyFaq[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  const currentLanguage = i18n.resolvedLanguage || i18n.language || "fr";

  const loadFaqs = useCallback(async () => {
    setLoadState("loading");
    setLoadErrorMessage(null);

    try {
      const nextFaqs = await knowledgeBaseService.listFaqsForLanguage(currentLanguage);
      setFaqs(nextFaqs);
      setSelectedTag("all");
      setOpenFaqId(nextFaqs[0]?.id ?? null);
      setLoadState("loaded");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : t("kb.errors.load");
      setLoadErrorMessage(nextMessage);
      setLoadState("error");
    }
  }, [currentLanguage, knowledgeBaseService, t]);

  useEffect(() => {
    void loadFaqs();
  }, [loadFaqs]);

  const allTags = useMemo(
    () =>
      Array.from(new Set(faqs.flatMap((faq) => faq.tags)))
        .filter((tag) => tag.trim().length > 0)
        .sort((left, right) => left.localeCompare(right, currentLanguage)),
    [currentLanguage, faqs],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredFaqs = useMemo(() => {
    return faqs.filter((faq) => {
      const matchesTag = selectedTag === "all" || faq.tags.includes(selectedTag);
      if (!matchesTag) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const titleText = decodeHtmlEntities(faq.title).toLowerCase();
      const responseText = stripHtml(decodeHtmlEntities(faq.response)).toLowerCase();
      const tagsText = faq.tags.join(" ").toLowerCase();

      return titleText.includes(normalizedQuery)
        || responseText.includes(normalizedQuery)
        || tagsText.includes(normalizedQuery);
    });
  }, [faqs, normalizedQuery, selectedTag]);

  useEffect(() => {
    if (filteredFaqs.length === 0) {
      setOpenFaqId(null);
      return;
    }

    if (!openFaqId || !filteredFaqs.some((faq) => faq.id === openFaqId)) {
      setOpenFaqId(filteredFaqs[0]?.id ?? null);
    }
  }, [filteredFaqs, openFaqId]);

  const resolvedTitle = title || t("kb.title");

  return (
    <section className={classes.container}>
      <header className={classes.header}>
        <div>
          <h2 className={classes.title}>{resolvedTitle}</h2>
          <p className={classes.subtitle}>{t("kb.subtitle")}</p>
        </div>
        <div className={classes.headerActions}>
          <button className={classes.refreshButton} type="button" onClick={() => void loadFaqs()}>
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ↻
              </span>
              {t("kb.actions.refresh")}
            </span>
          </button>
        </div>
      </header>

      <section className={classes.toolbar}>
        <div className={classes.searchField}>
          <input
            id="kb-search"
            className={classes.searchInput}
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder={t("kb.search.placeholder")}
          />
          {searchQuery && (
            <button className={classes.clearButton} type="button" onClick={() => setSearchQuery("")}>
              <span className={classes.buttonContent}>
                <span className={classes.buttonIcon} aria-hidden="true">
                  ×
                </span>
                {t("kb.actions.clearSearch")}
              </span>
            </button>
          )}
        </div>

        {allTags.length > 0 && (
          <div className={classes.tagFilters}>
            <button
              className={`${classes.tagButton} ${selectedTag === "all" ? classes.tagButtonActive : ""}`}
              type="button"
              onClick={() => setSelectedTag("all")}
            >
              {t("kb.filters.all")}
            </button>
            {allTags.map((tag) => (
              <button
                className={`${classes.tagButton} ${selectedTag === tag ? classes.tagButtonActive : ""}`}
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </section>

      {loadState === "loading" && (
        <div className={classes.loadingState}>
          <span className={classes.spinner} aria-hidden="true" />
          <span>{t("kb.loading")}</span>
        </div>
      )}

      {loadState === "error" && (
        <div className={classes.errorState} role="alert">
          <p>{t("kb.errors.load")}</p>
          <p className={classes.errorMessage}>{loadErrorMessage}</p>
          <button className={classes.retryButton} type="button" onClick={() => void loadFaqs()}>
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ↺
              </span>
              {t("kb.actions.retry")}
            </span>
          </button>
        </div>
      )}

      {loadState === "loaded" && faqs.length === 0 && (
        <div className={classes.emptyState}>{t("kb.empty")}</div>
      )}

      {loadState === "loaded" && faqs.length > 0 && filteredFaqs.length === 0 && (
        <div className={classes.emptyState}>{t("kb.noMatch")}</div>
      )}

      {loadState === "loaded" && filteredFaqs.length > 0 && (
        <div className={classes.list}>
          {filteredFaqs.map((faq) => {
            const isOpen = openFaqId === faq.id;
            const answerHtml = toDisplayHtml(faq.response);

            return (
              <article className={classes.faqCard} key={faq.id}>
                <button
                  className={classes.questionButton}
                  type="button"
                  onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                >
                  <span className={classes.buttonContent}>
                    <span className={classes.buttonIcon} aria-hidden="true">
                      {isOpen ? "▾" : "▸"}
                    </span>
                    {decodeHtmlEntities(faq.title) || t("kb.faq.untitled")}
                  </span>
                </button>

                {isOpen && (
                  <div className={classes.answer}>
                    {answerHtml ? (
                      <div
                        // FAQ content is authored in Efficy and intended to render rich text.
                        dangerouslySetInnerHTML={{ __html: answerHtml }}
                      />
                    ) : (
                      <p className={classes.answerEmpty}>{t("kb.faq.noContent")}</p>
                    )}
                  </div>
                )}

                {faq.tags.length > 0 && (
                  <div className={classes.cardTags}>
                    {faq.tags.map((tag) => (
                      <span className={classes.chip} key={`${faq.id}-${tag}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
