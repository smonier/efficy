import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArcElement,
  Chart as ChartJS,
  type ChartOptions,
  Legend,
  RadialLinearScale,
  Tooltip,
} from "chart.js";
import { Doughnut, PolarArea } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { BrokersService } from "../../services/brokersService";
import type { EfficyBrokerOpportunityWithDisplay } from "../../services/models";
import type { BrokerClientPortfolioIslandProps } from "./types";
import classes from "./BrokerClientPortfolio.module.css";

ChartJS.register(ArcElement, RadialLinearScale, Tooltip, Legend);

type LoadState = "idle" | "loading" | "loaded" | "error";
type SortDirection = "asc" | "desc";
type SortKey = "enterpriseName" | "personName" | "statusLabel" | "stateLabel" | "OppNumRef";

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

function formatMoney(value: number, locale: string): string {
  return value.toLocaleString(locale || "fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

const chartPalette = [
  "rgba(255, 179, 186, 0.75)",
  "rgba(255, 223, 186, 0.75)",
  "rgba(255, 255, 186, 0.75)",
  "rgba(186, 255, 201, 0.75)",
  "rgba(186, 225, 255, 0.75)",
  "rgba(223, 209, 255, 0.75)",
];
const chartLegendColor = "#1f3555";

function asLabel(value: string | undefined): string {
  return (value || "").trim() || "-";
}

function normalizeBadgeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

export default function BrokerClientPortfolioIsland({
  title,
  pageSize,
  apiBasePath,
}: BrokerClientPortfolioIslandProps) {
  const { t, i18n } = useTranslation();
  const brokersService = useMemo(() => new BrokersService(apiBasePath), [apiBasePath]);

  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<EfficyBrokerOpportunityWithDisplay[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<EfficyBrokerOpportunityWithDisplay | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("enterpriseName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [showCharts, setShowCharts] = useState(false);

  const resolvedTitle = title || t("broker.clientPortfolio.title");
  const dateLocale = i18n.resolvedLanguage || i18n.language || "fr-FR";

  useEffect(() => {
    if (!showCharts) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowCharts(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showCharts]);

  const loadPortfolio = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const brokerEnterpriseId = await brokersService.resolveCurrentBrokerEnterpriseId();
      if (!brokerEnterpriseId) {
        setRows([]);
        setInfoMessage(t("broker.common.noBrokerProfile"));
        setState("loaded");
        return;
      }

      const data = await brokersService.fetchBrokerOpportunities(brokerEnterpriseId);
      setRows(data);
      setPage(1);
      setShowCharts(false);
      setState("loaded");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : t("broker.common.errors.load");
      setErrorMessage(nextMessage);
      setState("error");
    }
  }, [brokersService, t]);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  const sortedRows = useMemo(() => {
    const sorted = [...rows];
    sorted.sort((left, right) => {
      const leftValue = String(left[sortKey] ?? "");
      const rightValue = String(right[sortKey] ?? "");

      if (sortDirection === "asc") {
        return leftValue.localeCompare(rightValue);
      }

      return rightValue.localeCompare(leftValue);
    });

    return sorted;
  }, [rows, sortDirection, sortKey]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pagedRows = useMemo(() => {
    const safePage = Math.min(Math.max(1, page), pageCount);
    const start = (safePage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [page, pageCount, pageSize, sortedRows]);

  const updateSort = useCallback((nextSortKey: SortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  }, [sortKey]);

  const statusDistribution = useMemo(() => {
    const counters = new Map<string, number>();

    rows.forEach((row) => {
      const label = asLabel(row.statusLabel);
      counters.set(label, (counters.get(label) || 0) + 1);
    });

    const entries = [...counters.entries()].sort((left, right) => right[1] - left[1]);
    return {
      labels: entries.map(([label]) => label),
      values: entries.map(([, value]) => value),
    };
  }, [rows]);

  const probabilityDistribution = useMemo(() => {
    const labels = [
      t("broker.clientPortfolio.charts.probabilityRanges.low"),
      t("broker.clientPortfolio.charts.probabilityRanges.medium"),
      t("broker.clientPortfolio.charts.probabilityRanges.high"),
      t("broker.clientPortfolio.charts.probabilityRanges.veryHigh"),
    ];
    const values = [0, 0, 0, 0];

    rows.forEach((row) => {
      const probability = Math.min(100, Math.max(0, Number(row.probability) || 0));
      if (probability <= 25) {
        values[0] += 1;
      } else if (probability <= 50) {
        values[1] += 1;
      } else if (probability <= 75) {
        values[2] += 1;
      } else {
        values[3] += 1;
      }
    });

    return { labels, values };
  }, [rows, t]);

  const statusChartData = useMemo(
    () => ({
      labels: statusDistribution.labels,
      datasets: [
        {
          label: t("broker.clientPortfolio.charts.statusDistribution"),
          data: statusDistribution.values,
          borderColor: "rgba(255, 255, 255, 0.8)",
          borderWidth: 2,
          backgroundColor: statusDistribution.values.map((_, index) => chartPalette[index % chartPalette.length]),
        },
      ],
    }),
    [statusDistribution, t],
  );

  const probabilityChartData = useMemo(
    () => ({
      labels: probabilityDistribution.labels,
      datasets: [
        {
          label: t("broker.clientPortfolio.charts.probabilitySegments"),
          data: probabilityDistribution.values,
          borderColor: "rgba(255, 255, 255, 0.85)",
          borderWidth: 2,
          backgroundColor: [
            "rgba(255, 230, 230, 0.82)",
            "rgba(255, 239, 214, 0.82)",
            "rgba(224, 247, 227, 0.82)",
            "rgba(214, 236, 255, 0.82)",
          ],
        },
      ],
    }),
    [probabilityDistribution, t],
  );

  const doughnutOptions = useMemo<ChartOptions<"doughnut">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      animation: {
        duration: 1200,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: chartLegendColor,
          },
        },
      },
    }),
    [],
  );

  const polarAreaOptions = useMemo<ChartOptions<"polarArea">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1200,
        easing: "easeOutQuart",
      },
      scales: {
        r: {
          grid: {
            color: "rgba(44, 67, 102, 0.12)",
          },
        },
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: chartLegendColor,
          },
        },
      },
    }),
    [],
  );

  if (selectedOpportunity) {
    return (
      <section className={classes.container}>
        <header className={classes.detailHeader}>
          <button className={classes.secondaryButton} onClick={() => setSelectedOpportunity(null)} type="button">
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ←
              </span>
              {t("broker.common.actions.back")}
            </span>
          </button>
          <h3 className={classes.detailHeading}>{selectedOpportunity.OppNumRef || "-"}</h3>
        </header>

        <section className={classes.detailSection}>
          <h4 className={classes.detailSectionTitle}>{t("broker.clientPortfolio.details.main")}</h4>
          <div className={classes.detailInfoGrid}>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.clientPortfolio.table.enterprise")}</span>
              <strong>{selectedOpportunity.enterpriseName || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.clientPortfolio.table.person")}</span>
              <strong>
                {selectedOpportunity.personName || "-"}
                {selectedOpportunity.personPosition ? ` (${selectedOpportunity.personPosition})` : ""}
              </strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.clientPortfolio.table.status")}</span>
              <strong>{selectedOpportunity.statusLabel || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.clientPortfolio.table.state")}</span>
              <strong>{selectedOpportunity.stateLabel || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.clientPortfolio.details.signDate")}</span>
              <strong>{formatDate(selectedOpportunity.OppDate, dateLocale)}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.clientPortfolio.details.stake")}</span>
              <strong>{formatMoney(selectedOpportunity.OppStake, dateLocale)}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.clientPortfolio.details.probability")}</span>
              <strong>{selectedOpportunity.probability}%</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.clientPortfolio.details.gamme")}</span>
              <strong>{selectedOpportunity.gammeLabels.join(", ") || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.clientPortfolio.details.protectionLevel")}</span>
              <strong>{selectedOpportunity.protectionLevelLabel || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.clientPortfolio.details.insuranceScheme")}</span>
              <strong>{selectedOpportunity.insuranceSchemeLabel || "-"}</strong>
            </div>
          </div>
        </section>

        <section className={classes.detailSection}>
          <h4 className={classes.detailSectionTitle}>{t("broker.clientPortfolio.details.description")}</h4>
          <p className={classes.detailDescription}>{selectedOpportunity.OppDetail || "-"}</p>
        </section>
      </section>
    );
  }

  return (
    <section className={classes.container}>
      <header className={classes.header}>
        <h2 className={classes.title}>{resolvedTitle}</h2>
        <div className={classes.actions}>
          <button
            className={classes.secondaryButton}
            disabled={state !== "loaded" || rows.length === 0}
            onClick={() => setShowCharts(true)}
            type="button"
          >
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ◔
              </span>
              {t("broker.common.actions.viewCharts")}
            </span>
          </button>
          <button className={classes.primaryButton} onClick={() => void loadPortfolio()} type="button">
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ↻
              </span>
              {t("broker.common.actions.refresh")}
            </span>
          </button>
        </div>
      </header>

      {showCharts && (
        <div className={classes.dialogBackdrop} onClick={() => setShowCharts(false)} role="presentation">
          <section
            aria-labelledby="broker-client-charts-title"
            aria-modal="true"
            className={classes.dialogPanel}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className={classes.dialogHeader}>
              <h3 className={classes.dialogTitle} id="broker-client-charts-title">
                {t("broker.clientPortfolio.charts.title")}
              </h3>
              <button className={classes.secondaryButton} onClick={() => setShowCharts(false)} type="button">
                {t("broker.common.actions.cancel")}
              </button>
            </header>

            <div className={classes.chartGrid}>
              <article className={classes.chartCard}>
                <h4 className={classes.chartTitle}>{t("broker.clientPortfolio.charts.statusDistribution")}</h4>
                <div className={classes.chartCanvas}>
                  {statusDistribution.values.length > 0 ? (
                    <Doughnut data={statusChartData} options={doughnutOptions} />
                  ) : (
                    <p className={classes.chartEmpty}>{t("broker.common.charts.noData")}</p>
                  )}
                </div>
              </article>

              <article className={classes.chartCard}>
                <h4 className={classes.chartTitle}>{t("broker.clientPortfolio.charts.probabilitySegments")}</h4>
                <div className={classes.chartCanvas}>
                  {probabilityDistribution.values.some((value) => value > 0) ? (
                    <PolarArea data={probabilityChartData} options={polarAreaOptions} />
                  ) : (
                    <p className={classes.chartEmpty}>{t("broker.common.charts.noData")}</p>
                  )}
                </div>
              </article>
            </div>
          </section>
        </div>
      )}

      {state === "loading" && (
        <div className={classes.loadingState}>
          <span className={classes.spinner} aria-hidden="true" />
          <span>{t("broker.clientPortfolio.loading")}</span>
        </div>
      )}

      {state === "error" && (
        <div className={classes.errorState} role="alert">
          <p className={classes.errorMessage}>{errorMessage || t("broker.common.errors.load")}</p>
          <button className={classes.primaryButton} onClick={() => void loadPortfolio()} type="button">
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ↺
              </span>
              {t("broker.common.actions.retry")}
            </span>
          </button>
        </div>
      )}

      {state === "loaded" && rows.length === 0 && (
        <div className={classes.emptyState}>{infoMessage || t("broker.clientPortfolio.empty")}</div>
      )}

      {state === "loaded" && rows.length > 0 && (
        <>
          <div className={classes.tableWrapper}>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>
                    <button className={classes.sortableHeader} onClick={() => updateSort("enterpriseName")} type="button">
                      {t("broker.clientPortfolio.table.enterprise")}
                      <span className={classes.sortIcon} aria-hidden="true">
                        ↕
                      </span>
                    </button>
                  </th>
                  <th>
                    <button className={classes.sortableHeader} onClick={() => updateSort("personName")} type="button">
                      {t("broker.clientPortfolio.table.person")}
                      <span className={classes.sortIcon} aria-hidden="true">
                        ↕
                      </span>
                    </button>
                  </th>
                  <th>
                    <button className={classes.sortableHeader} onClick={() => updateSort("statusLabel")} type="button">
                      {t("broker.clientPortfolio.table.status")}
                      <span className={classes.sortIcon} aria-hidden="true">
                        ↕
                      </span>
                    </button>
                  </th>
                  <th>
                    <button className={classes.sortableHeader} onClick={() => updateSort("stateLabel")} type="button">
                      {t("broker.clientPortfolio.table.state")}
                      <span className={classes.sortIcon} aria-hidden="true">
                        ↕
                      </span>
                    </button>
                  </th>
                  <th>
                    <button className={classes.sortableHeader} onClick={() => updateSort("OppNumRef")} type="button">
                      {t("broker.clientPortfolio.table.reference")}
                      <span className={classes.sortIcon} aria-hidden="true">
                        ↕
                      </span>
                    </button>
                  </th>
                  <th>{t("broker.clientPortfolio.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((opportunity) => (
                  <tr key={`${opportunity.OppNumRef}-${opportunity.OppPerID}-${opportunity.OppEntID}`}>
                    <td>{opportunity.enterpriseName || "-"}</td>
                    <td>
                      <div>{opportunity.personName || "-"}</div>
                      {opportunity.personPosition && (
                        <div className={classes.personMeta}>{opportunity.personPosition}</div>
                      )}
                    </td>
                    <td>
                      <span className={`${classes.badge} ${getStatusClass(opportunity.statusLabel)}`}>
                        {opportunity.statusLabel || "-"}
                      </span>
                    </td>
                    <td>{opportunity.stateLabel || "-"}</td>
                    <td>{opportunity.OppNumRef || "-"}</td>
                    <td>
                      <button
                        className={classes.rowButton}
                        onClick={() => setSelectedOpportunity(opportunity)}
                        type="button"
                      >
                        {t("broker.common.actions.viewDetails")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className={classes.pagination}>
              <button
                className={classes.pageButton}
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                {t("broker.common.pagination.prev")}
              </button>
              {Array.from({ length: pageCount }).map((_, index) => {
                const pageNumber = index + 1;
                const className =
                  pageNumber === page
                    ? `${classes.pageButton} ${classes.pageButtonActive}`
                    : classes.pageButton;

                return (
                  <button
                    className={className}
                    key={pageNumber}
                    onClick={() => setPage(pageNumber)}
                    type="button"
                  >
                    {pageNumber}
                  </button>
                );
              })}
              <button
                className={classes.pageButton}
                disabled={page >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                type="button"
              >
                {t("broker.common.pagination.next")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
