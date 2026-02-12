import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrokersService } from "../../services/brokersService";
import type {
  EfficyBrokerEnterprise,
  EfficyBrokerOpportunityFormOptions,
  EfficyBrokerPerson,
} from "../../services/models";
import type { BrokerNewOpportunityIslandProps } from "./types";
import classes from "./BrokerNewOpportunity.module.css";

type LoadState = "idle" | "loading" | "loaded" | "error";

interface FormState {
  title: string;
  detail: string;
  enterpriseId: string;
  personId: string;
  stateId: string;
  probabilityId: string;
  signDate: string;
  amount: string;
  gammeIds: string[];
}

function emptyFormState(): FormState {
  return {
    title: "",
    detail: "",
    enterpriseId: "",
    personId: "",
    stateId: "",
    probabilityId: "",
    signDate: "",
    amount: "",
    gammeIds: [],
  };
}

function toTrimmedValue(value: string): string {
  return value.trim();
}

export default function BrokerNewOpportunityIsland({
  title,
  apiBasePath,
}: BrokerNewOpportunityIslandProps) {
  const { t } = useTranslation();
  const brokersService = useMemo(() => new BrokersService(apiBasePath), [apiBasePath]);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [brokerEnterpriseId, setBrokerEnterpriseId] = useState("");
  const [form, setForm] = useState<FormState>(emptyFormState);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [enterprises, setEnterprises] = useState<EfficyBrokerEnterprise[]>([]);
  const [persons, setPersons] = useState<EfficyBrokerPerson[]>([]);
  const [formOptions, setFormOptions] = useState<EfficyBrokerOpportunityFormOptions>({
    states: [],
    probabilities: [],
    gammes: [],
  });

  const resolvedTitle = title || t("broker.newOpportunity.title");

  const loadFormData = useCallback(async () => {
    setLoadState("loading");
    setLoadErrorMessage(null);
    setSubmitErrorMessage(null);
    setSuccessMessage(null);

    try {
      const currentBrokerEnterpriseId = await brokersService.resolveCurrentBrokerEnterpriseId();
      if (!currentBrokerEnterpriseId) {
        setBrokerEnterpriseId("");
        setEnterprises([]);
        setFormOptions({ states: [], probabilities: [], gammes: [] });
        setLoadState("loaded");
        return;
      }

      const [nextEnterprises, nextOptions] = await Promise.all([
        brokersService.fetchEnterprises(currentBrokerEnterpriseId),
        brokersService.fetchOpportunityFormOptions(),
      ]);

      setBrokerEnterpriseId(currentBrokerEnterpriseId);
      setEnterprises(nextEnterprises);
      setFormOptions(nextOptions);
      setLoadState("loaded");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : t("broker.common.errors.load");
      setLoadErrorMessage(nextMessage);
      setLoadState("error");
    }
  }, [brokersService, t]);

  useEffect(() => {
    void loadFormData();
  }, [loadFormData]);

  useEffect(() => {
    if (!form.enterpriseId) {
      setPersons([]);
      setForm((current) => ({ ...current, personId: "" }));
      return;
    }

    let active = true;
    const loadPersons = async () => {
      try {
        const nextPersons = await brokersService.fetchPersonsByEnterprise(form.enterpriseId);
        if (!active) {
          return;
        }

        setPersons(nextPersons);
      } catch {
        if (!active) {
          return;
        }

        setPersons([]);
      }
    };

    void loadPersons();

    return () => {
      active = false;
    };
  }, [brokersService, form.enterpriseId]);

  const updateField = useCallback((field: keyof FormState, value: string | string[]) => {
    setForm((current) => {
      if (field === "enterpriseId") {
        return { ...current, enterpriseId: String(value), personId: "" };
      }

      return { ...current, [field]: value };
    });
    setSuccessMessage(null);
    setSubmitErrorMessage(null);
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const { [field]: _, ...rest } = current;
      return rest;
    });
  }, []);

  const resetForm = useCallback(() => {
    setForm(emptyFormState());
    setPersons([]);
    setFieldErrors({});
    setSubmitErrorMessage(null);
  }, []);

  const validateForm = useCallback((): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!toTrimmedValue(form.title)) {
      nextErrors.title = t("broker.newOpportunity.errors.requiredField");
    }

    if (!toTrimmedValue(form.detail)) {
      nextErrors.detail = t("broker.newOpportunity.errors.requiredField");
    }

    if (!form.enterpriseId) {
      nextErrors.enterpriseId = t("broker.newOpportunity.errors.requiredField");
    }

    if (!form.personId) {
      nextErrors.personId = t("broker.newOpportunity.errors.requiredField");
    }

    if (!form.stateId) {
      nextErrors.stateId = t("broker.newOpportunity.errors.requiredField");
    }

    if (!form.probabilityId) {
      nextErrors.probabilityId = t("broker.newOpportunity.errors.requiredField");
    }

    if (!form.signDate) {
      nextErrors.signDate = t("broker.newOpportunity.errors.requiredField");
    }

    if (!form.amount) {
      nextErrors.amount = t("broker.newOpportunity.errors.requiredField");
    } else {
      const amount = Number.parseFloat(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        nextErrors.amount = t("broker.newOpportunity.errors.invalidAmount");
      }
    }

    if (form.gammeIds.length === 0) {
      nextErrors.gammeIds = t("broker.newOpportunity.errors.requiredField");
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [form, t]);

  const handleSubmit = useCallback(async () => {
    if (!brokerEnterpriseId) {
      setSubmitErrorMessage(t("broker.common.noBrokerProfile"));
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitErrorMessage(null);
    setSuccessMessage(null);

    try {
      await brokersService.createOpportunityWithCourtier({
        title: toTrimmedValue(form.title),
        detail: toTrimmedValue(form.detail),
        enterpriseId: form.enterpriseId,
        personId: form.personId,
        stateId: form.stateId,
        probabilityId: form.probabilityId,
        signDate: form.signDate,
        amount: Number.parseFloat(form.amount),
        gammeIds: form.gammeIds,
        courtierEntId: brokerEnterpriseId,
      });

      setSuccessMessage(t("broker.newOpportunity.feedback.created"));
      resetForm();
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : t("broker.newOpportunity.errors.failed");
      setSubmitErrorMessage(nextMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [brokerEnterpriseId, brokersService, form, resetForm, t, validateForm]);

  return (
    <section className={classes.container}>
      <header className={classes.header}>
        <h2 className={classes.title}>{resolvedTitle}</h2>
        <p className={classes.subtitle}>{t("broker.newOpportunity.subtitle")}</p>
      </header>

      {loadState === "loading" && (
        <div className={classes.loadingState}>
          <span className={classes.spinner} aria-hidden="true" />
          <span>{t("broker.newOpportunity.loading")}</span>
        </div>
      )}

      {loadState === "error" && (
        <div className={classes.errorState} role="alert">
          <p>{loadErrorMessage || t("broker.common.errors.load")}</p>
          <button className={classes.primaryButton} onClick={() => void loadFormData()} type="button">
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ↺
              </span>
              {t("broker.common.actions.retry")}
            </span>
          </button>
        </div>
      )}

      {loadState === "loaded" && !brokerEnterpriseId && (
        <div className={classes.infoState}>{t("broker.common.noBrokerProfile")}</div>
      )}

      {loadState === "loaded" && brokerEnterpriseId && (
        <>
          {successMessage && <div className={classes.successState}>{successMessage}</div>}
          {submitErrorMessage && <div className={classes.errorState}>{submitErrorMessage}</div>}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <div className={classes.formGrid}>
              <label className={classes.field}>
                <span>{t("broker.newOpportunity.fields.title")}</span>
                <input
                  className={classes.input}
                  onChange={(event) => updateField("title", event.currentTarget.value)}
                  type="text"
                  value={form.title}
                />
                {fieldErrors.title && <p className={classes.fieldError}>{fieldErrors.title}</p>}
              </label>

              <label className={classes.field}>
                <span>{t("broker.newOpportunity.fields.enterprise")}</span>
                <select
                  className={classes.select}
                  onChange={(event) => updateField("enterpriseId", event.currentTarget.value)}
                  value={form.enterpriseId}
                >
                  <option value="">{t("broker.newOpportunity.placeholders.enterprise")}</option>
                  {enterprises.map((enterprise) => (
                    <option key={enterprise.id} value={enterprise.id}>
                      {enterprise.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.enterpriseId && <p className={classes.fieldError}>{fieldErrors.enterpriseId}</p>}
              </label>

              <label className={classes.field}>
                <span>{t("broker.newOpportunity.fields.person")}</span>
                <select
                  className={classes.select}
                  onChange={(event) => updateField("personId", event.currentTarget.value)}
                  value={form.personId}
                >
                  <option value="">{t("broker.newOpportunity.placeholders.person")}</option>
                  {persons.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                      {person.functionLabel ? ` (${person.functionLabel})` : ""}
                    </option>
                  ))}
                </select>
                {fieldErrors.personId && <p className={classes.fieldError}>{fieldErrors.personId}</p>}
              </label>

              <label className={classes.field}>
                <span>{t("broker.newOpportunity.fields.state")}</span>
                <select
                  className={classes.select}
                  onChange={(event) => updateField("stateId", event.currentTarget.value)}
                  value={form.stateId}
                >
                  <option value="">{t("broker.newOpportunity.placeholders.state")}</option>
                  {formOptions.states.map((stateOption) => (
                    <option key={stateOption.id} value={stateOption.id}>
                      {stateOption.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.stateId && <p className={classes.fieldError}>{fieldErrors.stateId}</p>}
              </label>

              <label className={classes.field}>
                <span>{t("broker.newOpportunity.fields.probability")}</span>
                <select
                  className={classes.select}
                  onChange={(event) => updateField("probabilityId", event.currentTarget.value)}
                  value={form.probabilityId}
                >
                  <option value="">{t("broker.newOpportunity.placeholders.probability")}</option>
                  {formOptions.probabilities.map((probabilityOption) => (
                    <option key={probabilityOption.id} value={probabilityOption.id}>
                      {probabilityOption.label}%
                    </option>
                  ))}
                </select>
                {fieldErrors.probabilityId && <p className={classes.fieldError}>{fieldErrors.probabilityId}</p>}
              </label>

              <label className={classes.field}>
                <span>{t("broker.newOpportunity.fields.signDate")}</span>
                <input
                  className={classes.input}
                  onChange={(event) => updateField("signDate", event.currentTarget.value)}
                  type="date"
                  value={form.signDate}
                />
                {fieldErrors.signDate && <p className={classes.fieldError}>{fieldErrors.signDate}</p>}
              </label>

              <label className={classes.field}>
                <span>{t("broker.newOpportunity.fields.amount")}</span>
                <input
                  className={classes.input}
                  min="0"
                  onChange={(event) => updateField("amount", event.currentTarget.value)}
                  step="0.01"
                  type="number"
                  value={form.amount}
                />
                {fieldErrors.amount && <p className={classes.fieldError}>{fieldErrors.amount}</p>}
              </label>

              <label className={`${classes.field} ${classes.fullWidth}`}>
                <span>{t("broker.newOpportunity.fields.gamme")}</span>
                <select
                  className={`${classes.select} ${classes.selectMultiple}`}
                  multiple
                  onChange={(event) => {
                    const selectedValues = Array.from(event.currentTarget.selectedOptions).map(
                      (option) => option.value,
                    );
                    updateField("gammeIds", selectedValues);
                  }}
                  value={form.gammeIds}
                >
                  {formOptions.gammes.map((gammeOption) => (
                    <option key={gammeOption.id} value={gammeOption.id}>
                      {gammeOption.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.gammeIds && <p className={classes.fieldError}>{fieldErrors.gammeIds}</p>}
              </label>

              <label className={`${classes.field} ${classes.fullWidth}`}>
                <span>{t("broker.newOpportunity.fields.detail")}</span>
                <textarea
                  className={classes.textarea}
                  onChange={(event) => updateField("detail", event.currentTarget.value)}
                  value={form.detail}
                />
                {fieldErrors.detail && <p className={classes.fieldError}>{fieldErrors.detail}</p>}
              </label>
            </div>

            <div className={classes.actions}>
              <button className={classes.secondaryButton} onClick={resetForm} type="button">
                {t("broker.common.actions.cancel")}
              </button>
              <button className={classes.primaryButton} disabled={isSubmitting} type="submit">
                <span className={classes.buttonContent}>
                  <span className={classes.buttonIcon} aria-hidden="true">
                    +
                  </span>
                  {isSubmitting ? t("broker.newOpportunity.submitting") : t("broker.newOpportunity.submit")}
                </span>
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
