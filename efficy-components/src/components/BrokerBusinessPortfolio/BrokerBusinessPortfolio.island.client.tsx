import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { useTranslation } from "react-i18next";
import { BrokersService } from "../../services/brokersService";
import type { EfficyBrokerOpportunityWithDisplay } from "../../services/models";
import type { BrokerBusinessPortfolioIslandProps } from "./types";
import classes from "./BrokerBusinessPortfolio.module.css";

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend);

type LoadState = "idle" | "loading" | "loaded" | "error";
type SortDirection = "asc" | "desc";
type SortKey = "OppNumRef" | "OppTitle" | "statusLabel" | "OppDate" | "probability" | "OppStake";

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
  "rgba(255, 183, 178, 0.82)",
  "rgba(255, 223, 186, 0.82)",
  "rgba(255, 244, 177, 0.82)",
  "rgba(198, 239, 206, 0.82)",
  "rgba(190, 227, 255, 0.82)",
  "rgba(219, 210, 255, 0.82)",
];

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

export default function BrokerBusinessPortfolioIsland({
  title,
  pageSize,
  apiBasePath,
}: BrokerBusinessPortfolioIslandProps) {
  const { t, i18n } = useTranslation();
  const brokersService = useMemo(() => new BrokersService(apiBasePath), [apiBasePath]);

  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<EfficyBrokerOpportunityWithDisplay[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<EfficyBrokerOpportunityWithDisplay | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("OppNumRef");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [showCharts, setShowCharts] = useState(false);

  const resolvedTitle = title || t("broker.businessPortfolio.title");
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
      const leftValue = left[sortKey];
      const rightValue = right[sortKey];

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return sortDirection === "asc" ? leftValue - rightValue : rightValue - leftValue;
      }

      if (sortDirection === "asc") {
        return String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
      }

      return String(rightValue ?? "").localeCompare(String(leftValue ?? ""));
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

  const statusStakeDistribution = useMemo(() => {
    const counters = new Map<string, number>();

    rows.forEach((row) => {
      const label = asLabel(row.statusLabel);
      counters.set(label, (counters.get(label) || 0) + (Number(row.OppStake) || 0));
    });

    const entries = [...counters.entries()].sort((left, right) => right[1] - left[1]);
    return {
      labels: entries.map(([label]) => label),
      values: entries.map(([, value]) => Number(value.toFixed(2))),
    };
  }, [rows]);

  const monthlyTrend = useMemo(() => {
    const monthBuckets = new Map<number, { label: string; stake: number; count: number }>();
    const formatter = new Intl.DateTimeFormat(dateLocale || "fr-FR", {
      month: "short",
      year: "2-digit",
    });

    rows.forEach((row) => {
      const parsedDate = new Date(row.OppDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return;
      }

      const monthStart = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1);
      const key = monthStart.getTime();
      const existing = monthBuckets.get(key);

      if (existing) {
        existing.stake += Number(row.OppStake) || 0;
        existing.count += 1;
        return;
      }

      monthBuckets.set(key, {
        label: formatter.format(monthStart),
        stake: Number(row.OppStake) || 0,
        count: 1,
      });
    });

    const sorted = [...monthBuckets.entries()]
      .sort((left, right) => left[0] - right[0])
      .slice(-8)
      .map(([, month]) => month);

    return {
      labels: sorted.map((month) => month.label),
      stakeValues: sorted.map((month) => Number(month.stake.toFixed(2))),
      countValues: sorted.map((month) => month.count),
    };
  }, [dateLocale, rows]);

  const stakeByStatusData = useMemo(
    () => ({
      labels: statusStakeDistribution.labels,
      datasets: [
        {
          label: t("broker.businessPortfolio.charts.stakeSeries"),
          data: statusStakeDistribution.values,
          borderRadius: 8,
          maxBarThickness: 48,
          backgroundColor: statusStakeDistribution.values.map((_, index) => chartPalette[index % chartPalette.length]),
        },
      ],
    }),
    [statusStakeDistribution, t],
  );

  const monthlyTrendData = useMemo(
    () => ({
      labels: monthlyTrend.labels,
      datasets: [
        {
          type: "line" as const,
          label: t("broker.businessPortfolio.charts.countSeries"),
          data: monthlyTrend.countValues,
          borderColor: "rgba(62, 127, 210, 0.92)",
          backgroundColor: "rgba(62, 127, 210, 0.18)",
          tension: 0.32,
          pointRadius: 4,
          pointHoverRadius: 6,
          yAxisID: "yCount",
        },
        {
          type: "line" as const,
          label: t("broker.businessPortfolio.charts.stakeSeries"),
          data: monthlyTrend.stakeValues,
          borderColor: "rgba(255, 161, 113, 0.95)",
          backgroundColor: "rgba(255, 161, 113, 0.2)",
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          yAxisID: "yStake",
        },
      ],
    }),
    [monthlyTrend, t],
  );

  const stakeChartOptions = useMemo<ChartOptions<"bar">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1150,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
        },
        y: {
          ticks: {
            callback: (value) => formatMoney(Number(value), dateLocale),
          },
        },
      },
    }),
    [dateLocale],
  );

  const monthlyTrendOptions = useMemo<ChartOptions<"line">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      animation: {
        duration: 1350,
        easing: "easeOutQuart",
      },
      plugins: {
        legend: {
          position: "bottom",
        },
      },
      scales: {
        yStake: {
          type: "linear",
          position: "left",
          title: {
            display: true,
            text: t("broker.businessPortfolio.charts.stakeAxis"),
          },
          ticks: {
            callback: (value) => formatMoney(Number(value), dateLocale),
          },
        },
        yCount: {
          type: "linear",
          position: "right",
          title: {
            display: true,
            text: t("broker.businessPortfolio.charts.countAxis"),
          },
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            precision: 0,
          },
        },
      },
    }),
    [dateLocale, t],
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
          <h4 className={classes.detailSectionTitle}>{t("broker.businessPortfolio.details.main")}</h4>
          <div className={classes.detailInfoGrid}>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.table.number")}</span>
              <strong>{selectedOpportunity.OppNumRef || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.table.title")}</span>
              <strong>{selectedOpportunity.OppTitle || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.table.enterprise")}</span>
              <strong>{selectedOpportunity.enterpriseName || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.table.person")}</span>
              <strong>
                {selectedOpportunity.personName || "-"}
                {selectedOpportunity.personPosition ? ` (${selectedOpportunity.personPosition})` : ""}
              </strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.table.status")}</span>
              <strong>{selectedOpportunity.statusLabel || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.table.state")}</span>
              <strong>{selectedOpportunity.stateLabel || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.table.signDate")}</span>
              <strong>{formatDate(selectedOpportunity.OppDate, dateLocale)}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.table.probability")}</span>
              <strong>{selectedOpportunity.probability}%</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.table.stake")}</span>
              <strong>{formatMoney(selectedOpportunity.OppStake, dateLocale)}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.table.gamme")}</span>
              <strong>{selectedOpportunity.gammeLabels.join(", ") || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.details.protectionLevel")}</span>
              <strong>{selectedOpportunity.protectionLevelLabel || "-"}</strong>
            </div>
            <div className={classes.detailInfoItem}>
              <span>{t("broker.businessPortfolio.details.insuranceScheme")}</span>
              <strong>{selectedOpportunity.insuranceSchemeLabel || "-"}</strong>
            </div>
          </div>
        </section>

        <section className={classes.detailSection}>
          <h4 className={classes.detailSectionTitle}>{t("broker.businessPortfolio.details.description")}</h4>
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
            aria-labelledby="broker-business-charts-title"
            aria-modal="true"
            className={classes.dialogPanel}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className={classes.dialogHeader}>
              <h3 className={classes.dialogTitle} id="broker-business-charts-title">
                {t("broker.businessPortfolio.charts.title")}
              </h3>
              <button className={classes.secondaryButton} onClick={() => setShowCharts(false)} type="button">
                {t("broker.common.actions.cancel")}
              </button>
            </header>

            <div className={classes.chartGrid}>
              <article className={classes.chartCard}>
                <h4 className={classes.chartTitle}>{t("broker.businessPortfolio.charts.stakeByStatus")}</h4>
                <div className={classes.chartCanvas}>
                  {statusStakeDistribution.values.length > 0 ? (
                    <Bar data={stakeByStatusData} options={stakeChartOptions} />
                  ) : (
                    <p className={classes.chartEmpty}>{t("broker.common.charts.noData")}</p>
                  )}
                </div>
              </article>

              <article className={classes.chartCard}>
                <h4 className={classes.chartTitle}>{t("broker.businessPortfolio.charts.monthlyDynamics")}</h4>
                <div className={classes.chartCanvas}>
                  {monthlyTrend.labels.length > 0 ? (
                    <Line data={monthlyTrendData} options={monthlyTrendOptions} />
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
          <span>{t("broker.businessPortfolio.loading")}</span>
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
        <div className={classes.emptyState}>{infoMessage || t("broker.businessPortfolio.empty")}</div>
      )}

      {state === "loaded" && rows.length > 0 && (
        <>
          <div className={classes.tableWrapper}>
            <table className={classes.table}>
              <thead>
                <tr>
                  <th>
                    <button className={classes.sortableHeader} onClick={() => updateSort("OppNumRef")} type="button">
                      {t("broker.businessPortfolio.table.number")}
                      <span className={classes.sortIcon} aria-hidden="true">
                        ↕
                      </span>
                    </button>
                  </th>
                  <th>
                    <button className={classes.sortableHeader} onClick={() => updateSort("OppTitle")} type="button">
                      {t("broker.businessPortfolio.table.title")}
                      <span className={classes.sortIcon} aria-hidden="true">
                        ↕
                      </span>
                    </button>
                  </th>
                  <th>
                    <button className={classes.sortableHeader} onClick={() => updateSort("statusLabel")} type="button">
                      {t("broker.businessPortfolio.table.status")}
                      <span className={classes.sortIcon} aria-hidden="true">
                        ↕
                      </span>
                    </button>
                  </th>
                  <th>
                    <button className={classes.sortableHeader} onClick={() => updateSort("OppDate")} type="button">
                      {t("broker.businessPortfolio.table.signDate")}
                      <span className={classes.sortIcon} aria-hidden="true">
                        ↕
                      </span>
                    </button>
                  </th>
                  <th>
                    <button className={classes.sortableHeader} onClick={() => updateSort("probability")} type="button">
                      {t("broker.businessPortfolio.table.probability")}
                      <span className={classes.sortIcon} aria-hidden="true">
                        ↕
                      </span>
                    </button>
                  </th>
                  <th>
                    <button className={classes.sortableHeader} onClick={() => updateSort("OppStake")} type="button">
                      {t("broker.businessPortfolio.table.stake")}
                      <span className={classes.sortIcon} aria-hidden="true">
                        ↕
                      </span>
                    </button>
                  </th>
                  <th>{t("broker.businessPortfolio.table.gamme")}</th>
                  <th>{t("broker.businessPortfolio.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((opportunity) => (
                  <tr key={`${opportunity.OppNumRef}-${opportunity.OppPerID}-${opportunity.OppEntID}`}>
                    <td>{opportunity.OppNumRef || "-"}</td>
                    <td>{opportunity.OppTitle || "-"}</td>
                    <td>
                      <span className={`${classes.badge} ${getStatusClass(opportunity.statusLabel)}`}>
                        {opportunity.statusLabel || "-"}
                      </span>
                    </td>
                    <td>{formatDate(opportunity.OppDate, dateLocale)}</td>
                    <td>{opportunity.probability}%</td>
                    <td>{formatMoney(opportunity.OppStake, dateLocale)}</td>
                    <td>{opportunity.gammeLabels.join(", ") || "-"}</td>
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
