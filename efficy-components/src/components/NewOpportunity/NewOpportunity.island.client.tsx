import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NewOpportunityIslandProps, ServiceNode } from "./types";
import classes from "./NewOpportunity.module.css";
import { HttpClient, resolveApiBaseUrl } from "../../services/httpClient";
import { EfficyApiClient } from "../../services/efficyApiClient";

interface FormState {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phoneNumber: string;
  selectedServices: string[];
  stationId: string;
  comment: string;
}

interface EfficyContext {
  personId: string;
  enterpriseId: string;
}

function emptyFormState(): FormState {
  return {
    firstName: "",
    lastName: "",
    company: "",
    email: "",
    phoneNumber: "",
    selectedServices: [],
    stationId: "",
    comment: "",
  };
}

interface ServiceCheckboxProps {
  service: ServiceNode;
  selectedServices: string[];
  onToggle: (serviceId: string) => void;
}

function ServiceCheckbox({ service, selectedServices, onToggle }: ServiceCheckboxProps) {
  const isCatalog = service.type === "catalog";
  const isChecked = selectedServices.includes(service.id);
  
  return (
    <div className={classes.serviceItem}>
      <div className={classes.serviceRow}>
        {isCatalog ? (
          <span className={classes.catalogLabel}>{service.name}</span>
        ) : (
          <label className={classes.serviceLabel}>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => onToggle(service.id)}
              className={classes.checkbox}
            />
            <span>{service.name}</span>
          </label>
        )}
      </div>
      
      {service.children && service.children.length > 0 && (
        <div className={classes.serviceChildren}>
          {service.children.map((child) => (
            <ServiceCheckbox
              key={child.id}
              service={child}
              selectedServices={selectedServices}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function NewOpportunityIsland({
  title,
  apiBasePath,
  services,
  stations,
}: NewOpportunityIslandProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(emptyFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [efficyContext, setEfficyContext] = useState<EfficyContext | null>(null);

  const httpClient = useMemo(() => new HttpClient(resolveApiBaseUrl(apiBasePath)), [apiBasePath]);
  const efficyApiClient = useMemo(() => new EfficyApiClient(httpClient), [httpClient]);

  const resolvedTitle = title || t("efficy.newOpportunity.title");

  // Fetch current user context from Efficy
  useEffect(() => {
    const fetchEfficyContext = async () => {
      try {
        const personId = await efficyApiClient.getCurrentUserPersonId();
        if (!personId) {
          setEfficyContext({ personId: "", enterpriseId: "" });
          return;
        }

        const personBean = await efficyApiClient.getPersonById(personId);
        let enterpriseId = "";
        
        if (personBean) {
          // Extract PerEntID from person bean
          const perEntIDField = personBean.PerEntID;
          if (typeof perEntIDField === "string") {
            enterpriseId = perEntIDField;
          } else if (perEntIDField && typeof perEntIDField === "object" && !Array.isArray(perEntIDField)) {
            enterpriseId = String(perEntIDField.raw_value || perEntIDField.value || "");
          } else if (Array.isArray(perEntIDField) && perEntIDField.length > 0) {
            enterpriseId = String(perEntIDField[0]);
          }
        }

        setEfficyContext({ personId, enterpriseId });
      } catch (error) {
        console.error("Error fetching Efficy context:", error);
        setEfficyContext({ personId: "", enterpriseId: "" });
      }
    };

    void fetchEfficyContext();
  }, [efficyApiClient]);

  const updateField = useCallback((field: keyof FormState, value: string | string[]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSuccessMessage(null);
    setErrorMessage(null);
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const toggleService = useCallback((serviceId: string) => {
    setForm((current) => {
      const selectedServices = current.selectedServices.includes(serviceId)
        ? current.selectedServices.filter((id) => id !== serviceId)
        : [...current.selectedServices, serviceId];
      return { ...current, selectedServices };
    });
    setSuccessMessage(null);
    setErrorMessage(null);
  }, []);

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!form.firstName.trim()) {
      errors.firstName = t("efficy.newOpportunity.errors.firstNameRequired");
    }

    if (!form.lastName.trim()) {
      errors.lastName = t("efficy.newOpportunity.errors.lastNameRequired");
    }

    if (!form.company.trim()) {
      errors.company = t("efficy.newOpportunity.errors.companyRequired");
    }

    if (!form.email.trim()) {
      errors.email = t("efficy.newOpportunity.errors.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = t("efficy.newOpportunity.errors.emailInvalid");
    }

    if (form.selectedServices.length === 0) {
      errors.selectedServices = t("efficy.newOpportunity.errors.servicesRequired");
    }

    if (!form.stationId) {
      errors.stationId = t("efficy.newOpportunity.errors.stationRequired");
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [form, t]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();

      if (!validateForm()) {
        return;
      }

      if (!efficyContext) {
        setErrorMessage(t("efficy.newOpportunity.errors.contextNotLoaded"));
        return;
      }

      setIsSubmitting(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        const selectedStation = stations.find((s) => s.id === form.stationId);
        const stationName = selectedStation?.name || "";

        // Get today's date in YYYY-MM-DD format
        const today = new Date().toISOString().split("T")[0];

        // Create one opportunity per selected service
        const promises = form.selectedServices.map(async (serviceId) => {
          // Find service name
          let serviceName = "";
          for (const catalog of services) {
            const card = catalog.children?.find((c) => c.id === serviceId);
            if (card) {
              serviceName = card.name;
              break;
            }
          }

          const opportunityTitle = `${stationName} - ${serviceName}`;
          
          // Create opportunity using Efficy API structure with required fields
          return httpClient.post("/base/Opportunity", {
            data: {
              bean_data: {
                OppTitle: opportunityTitle,
                OppDetail: [
                  `First Name: ${form.firstName.trim()}`,
                  `Last Name: ${form.lastName.trim()}`,
                  `Company: ${form.company.trim()}`,
                  `Email: ${form.email.trim()}`,
                  form.phoneNumber.trim() ? `Phone: ${form.phoneNumber.trim()}` : "",
                  `Service: ${serviceName}`,
                  `Station: ${stationName}`,
                  form.comment.trim() ? `Comment: ${form.comment.trim()}` : "",
                ].filter(Boolean).join("\n"),
                // Required Efficy fields with defaults
                OppPerID: efficyContext.personId || "1",
                OppEntID: efficyContext.enterpriseId || "1",
                OppStoID: "000000000000074f", // Lead
                OppOpbID: "0000000000000b54", // 20%
                OppDate: today, // Today's date
                OppStake: 0, // Default amount
                OppGammeShouhaitee_: [], // Empty gamme array
              },
            },
          });
        });

        await Promise.all(promises);

        setSuccessMessage(
          t("efficy.newOpportunity.success", {
            count: form.selectedServices.length,
          }),
        );
        setForm(emptyFormState);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t("efficy.newOpportunity.errors.submit");
        setErrorMessage(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, httpClient, services, stations, t, validateForm, efficyContext],
  );

  return (
    <section className={classes.container}>
      <header className={classes.header}>
        <h2 className={classes.title}>{resolvedTitle}</h2>
      </header>

      {successMessage && <div className={classes.successState}>{successMessage}</div>}
      {errorMessage && <div className={classes.errorState}>{errorMessage}</div>}

      <form id="newOpportunityForm" name="newOpportunityForm" onSubmit={handleSubmit}>
        <div className={classes.formGrid}>
          <label className={classes.field}>
            {t("efficy.newOpportunity.fields.firstName")} *
            <input
              type="text"
              value={form.firstName}
              onChange={(e) => updateField("firstName", e.target.value)}
              className={classes.input}
              disabled={isSubmitting}
            />
            {fieldErrors.firstName && <p className={classes.fieldError}>{fieldErrors.firstName}</p>}
          </label>

          <label className={classes.field}>
            {t("efficy.newOpportunity.fields.lastName")} *
            <input
              type="text"
              value={form.lastName}
              onChange={(e) => updateField("lastName", e.target.value)}
              className={classes.input}
              disabled={isSubmitting}
            />
            {fieldErrors.lastName && <p className={classes.fieldError}>{fieldErrors.lastName}</p>}
          </label>

          <label className={classes.field}>
            {t("efficy.newOpportunity.fields.company")} *
            <input
              type="text"
              value={form.company}
              onChange={(e) => updateField("company", e.target.value)}
              className={classes.input}
              disabled={isSubmitting}
            />
            {fieldErrors.company && <p className={classes.fieldError}>{fieldErrors.company}</p>}
          </label>

          <label className={classes.field}>
            {t("efficy.newOpportunity.fields.email")} *
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              className={classes.input}
              disabled={isSubmitting}
            />
            {fieldErrors.email && <p className={classes.fieldError}>{fieldErrors.email}</p>}
          </label>

          <label className={classes.field}>
            {t("efficy.newOpportunity.fields.phoneNumber")}
            <input
              type="tel"
              value={form.phoneNumber}
              onChange={(e) => updateField("phoneNumber", e.target.value)}
              className={classes.input}
              disabled={isSubmitting}
            />
            {fieldErrors.phoneNumber && <p className={classes.fieldError}>{fieldErrors.phoneNumber}</p>}
          </label>

          <label className={classes.field}>
            {t("efficy.newOpportunity.fields.station")} *
            <select
              value={form.stationId}
              onChange={(e) => updateField("stationId", e.target.value)}
              className={classes.select}
              disabled={isSubmitting}
            >
              <option value="">{t("efficy.newOpportunity.fields.stationPlaceholder")}</option>
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
            {fieldErrors.stationId && <p className={classes.fieldError}>{fieldErrors.stationId}</p>}
          </label>

          <label className={`${classes.field} ${classes.fullWidth}`}>
            {t("efficy.newOpportunity.fields.services")} *
            <div className={classes.servicesTree}>
              {services.map((service) => (
                <ServiceCheckbox
                  key={service.id}
                  service={service}
                  selectedServices={form.selectedServices}
                  onToggle={toggleService}
                />
              ))}
            </div>
            {fieldErrors.selectedServices && <p className={classes.fieldError}>{fieldErrors.selectedServices}</p>}
          </label>

          <label className={`${classes.field} ${classes.fullWidth}`}>
            {t("efficy.newOpportunity.fields.comment")}
            <textarea
              value={form.comment}
              onChange={(e) => updateField("comment", e.target.value)}
              className={classes.textarea}
              rows={4}
              disabled={isSubmitting}
            />
          </label>
        </div>

        <div className={classes.actions}>
          <button type="submit" className={classes.primaryButton} disabled={isSubmitting}>
            {isSubmitting ? t("efficy.newOpportunity.submitting") : t("efficy.newOpportunity.submit")}
          </button>
        </div>
      </form>
    </section>
  );
}
