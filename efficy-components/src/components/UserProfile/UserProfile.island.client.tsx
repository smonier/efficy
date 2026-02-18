import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProfileService } from "../../services/profileService";
import type { EfficyReferentialOption, EfficyUserProfile } from "../../services/models";
import type { UserProfileIslandProps } from "./types";
import classes from "./UserProfile.module.css";

type LoadState = "idle" | "loading" | "loaded" | "error";
type SaveState = "idle" | "saving" | "success" | "error";

function toggleId(list: string[], id: string, isEnabled: boolean): string[] {
  if (isEnabled) {
    if (list.includes(id)) {
      return list;
    }

    return [...list, id];
  }

  return list.filter((entry) => entry !== id);
}

function formatDate(value: string, locale: string): string {
  if (!value) {
    return "";
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

export default function UserProfileIsland({ title, apiBasePath }: UserProfileIslandProps) {
  const { t } = useTranslation();
  const profileService = useMemo(() => new ProfileService(apiBasePath), [apiBasePath]);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [profile, setProfile] = useState<EfficyUserProfile | null>(null);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  const [newsletterOptions, setNewsletterOptions] = useState<EfficyReferentialOption[]>([]);
  const [consentOptions, setConsentOptions] = useState<EfficyReferentialOption[]>([]);
  const [mediaOptions, setMediaOptions] = useState<EfficyReferentialOption[]>([]);

  const [selectedNewsletterIds, setSelectedNewsletterIds] = useState<string[]>([]);
  const [selectedConsentIds, setSelectedConsentIds] = useState<string[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState("");
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoadState("loading");
    setSaveState("idle");
    setLoadErrorMessage(null);

    try {
      const [currentProfile, options] = await Promise.all([
        profileService.fetchCurrentUserProfile(),
        profileService.fetchPreferenceOptions(),
      ]);

      setProfile(currentProfile);
      setSelectedNewsletterIds(currentProfile.newsletterIds);
      setSelectedConsentIds(currentProfile.consentIds);
      setSelectedMediaId(currentProfile.preferredMediaId);

      setNewsletterOptions(options.newsletterOptions);
      setConsentOptions(options.consentOptions);
      setMediaOptions(options.mediaOptions);
      setLoadState("loaded");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : t("profile.errors.load");
      setLoadErrorMessage(nextMessage);
      setLoadState("error");
    }
  }, [profileService, t]);

  const savePreferences = useCallback(async () => {
    if (!profile?.personId) {
      return;
    }

    setSaveState("saving");
    setSaveErrorMessage(null);

    try {
      await profileService.updateCurrentUserPreferences(profile.personId, {
        newsletterIds: selectedNewsletterIds,
        consentIds: selectedConsentIds,
        preferredMediaId: selectedMediaId,
      });

      setProfile((current) =>
        current
          ? {
              ...current,
              newsletterIds: selectedNewsletterIds,
              consentIds: selectedConsentIds,
              preferredMediaId: selectedMediaId,
            }
          : current,
      );
      setSaveState("success");
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : t("profile.errors.save");
      setSaveErrorMessage(nextMessage);
      setSaveState("error");
    }
  }, [profile?.personId, profileService, selectedConsentIds, selectedMediaId, selectedNewsletterIds, t]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const resolvedTitle = title || t("profile.title");
  const dateLocale = navigator.language || "fr-FR";
  const hasContactInfo = Boolean(profile?.phone || profile?.mobile || profile?.fax);
  const hasAddressInfo = Boolean(
    profile?.address1 || profile?.address2 || profile?.address3 || profile?.postalCode || profile?.city || profile?.country,
  );
  const hasOtherInfo = Boolean(
    profile?.civility ||
      profile?.title ||
      profile?.status ||
      profile?.company ||
      profile?.birthDate ||
      profile?.clientNumber ||
      profile?.loyaltyScore,
  );
  const householdMembers = profile?.householdMembers ?? [];
  const hasHouseholdInfo = householdMembers.length > 0;
  const hasExtendedInfo = hasContactInfo || hasAddressInfo || hasOtherInfo || hasHouseholdInfo;

  if (loadState === "loading" || loadState === "idle") {
    return (
      <section className={classes.container}>
        <div className={classes.loadingState}>
          <span className={classes.spinner} aria-hidden="true" />
          <span>{t("profile.loading")}</span>
        </div>
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className={classes.container}>
        <div className={classes.errorState} role="alert">
          <p className={classes.errorTitle}>{t("profile.errors.load")}</p>
          <p className={classes.errorMessage}>{loadErrorMessage}</p>
          <button className={classes.retryButton} onClick={() => void loadProfile()} type="button">
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                ↺
              </span>
              {t("profile.actions.retry")}
            </span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={classes.container}>
      <header className={classes.header}>
        <div>
          <h2 className={classes.title}>{resolvedTitle}</h2>
          <p className={classes.subtitle}>{t("profile.subtitle")}</p>
        </div>
      </header>

      <section className={classes.identityPanel}>
        <h3 className={classes.sectionTitle}>{t("profile.identity.title")}</h3>
        <div className={classes.identityGrid}>
          <div className={classes.identityItem}>
            <span>{t("profile.identity.name")}</span>
            <strong>
              {[profile?.civility, profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "-"}
            </strong>
          </div>
          <div className={classes.identityItem}>
            <span>{t("profile.identity.email")}</span>
            <strong>{profile?.email || "-"}</strong>
          </div>
        </div>
      </section>

      <section className={classes.panel}>
        <div className={classes.collapseHeader}>
          <h3 className={classes.sectionTitle}>{t("profile.details.title")}</h3>
          <button
            className={classes.collapseToggle}
            type="button"
            onClick={() => setIsDetailsOpen((previous) => !previous)}
          >
            <span className={classes.buttonContent}>
              <span className={classes.buttonIcon} aria-hidden="true">
                {isDetailsOpen ? "▾" : "▸"}
              </span>
              {isDetailsOpen ? t("profile.details.hide") : t("profile.details.show")}
            </span>
          </button>
        </div>

        {isDetailsOpen && (
          <>
            {!hasExtendedInfo && <p className={classes.emptyHint}>{t("profile.details.empty")}</p>}

            {hasContactInfo && (
              <div className={classes.detailBlock}>
                <h4 className={classes.preferenceTitle}>{t("profile.details.contact")}</h4>
                <div className={classes.detailGrid}>
                  {profile?.phone && (
                    <div className={classes.detailItem}>
                      <span>{t("profile.details.fields.phone")}</span>
                      <strong>{profile.phone}</strong>
                    </div>
                  )}
                  {profile?.mobile && (
                    <div className={classes.detailItem}>
                      <span>{t("profile.details.fields.mobile")}</span>
                      <strong>{profile.mobile}</strong>
                    </div>
                  )}
                  {profile?.fax && (
                    <div className={classes.detailItem}>
                      <span>{t("profile.details.fields.fax")}</span>
                      <strong>{profile.fax}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {hasAddressInfo && (
              <div className={classes.detailBlock}>
                <h4 className={classes.preferenceTitle}>{t("profile.details.address")}</h4>
                <div className={classes.detailAddress}>
                  {profile?.address1 && <p>{profile.address1}</p>}
                  {profile?.address2 && <p>{profile.address2}</p>}
                  {profile?.address3 && <p>{profile.address3}</p>}
                  {(profile?.postalCode || profile?.city) && (
                    <p>{[profile.postalCode, profile.city].filter(Boolean).join(" ")}</p>
                  )}
                  {profile?.country && <p>{profile.country}</p>}
                </div>
              </div>
            )}

            {hasOtherInfo && (
              <div className={classes.detailBlock}>
                <h4 className={classes.preferenceTitle}>{t("profile.details.other")}</h4>
                <div className={classes.detailGrid}>
                  {profile?.title && (
                    <div className={classes.detailItem}>
                      <span>{t("profile.details.fields.title")}</span>
                      <strong>{profile.title}</strong>
                    </div>
                  )}
                  {profile?.status && (
                    <div className={classes.detailItem}>
                      <span>{t("profile.details.fields.status")}</span>
                      <strong>{profile.status}</strong>
                    </div>
                  )}
                  {profile?.company && (
                    <div className={classes.detailItem}>
                      <span>{t("profile.details.fields.company")}</span>
                      <strong>{profile.company}</strong>
                    </div>
                  )}
                  {profile?.birthDate && (
                    <div className={classes.detailItem}>
                      <span>{t("profile.details.fields.birthDate")}</span>
                      <strong>{formatDate(profile.birthDate, dateLocale)}</strong>
                    </div>
                  )}
                  {profile?.clientNumber && (
                    <div className={classes.detailItem}>
                      <span>{t("profile.details.fields.clientNumber")}</span>
                      <strong>{profile.clientNumber}</strong>
                    </div>
                  )}
                  {profile?.loyaltyScore && (
                    <div className={classes.detailItem}>
                      <span>{t("profile.details.fields.loyaltyScore")}</span>
                      <strong>{profile.loyaltyScore}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {hasHouseholdInfo && (
              <div className={classes.detailBlock}>
                <h4 className={classes.preferenceTitle}>{t("profile.details.household")}</h4>
                <ul className={classes.householdList}>
                  {householdMembers.map((member, index) => (
                    <li
                      className={classes.householdItem}
                      key={`${member.personId || `${member.firstName || ""}-${member.lastName || ""}`}-${index}`}
                    >
                      <span className={classes.householdName}>
                        {[member.civility, member.firstName, member.lastName].filter(Boolean).join(" ") || "-"}
                      </span>
                      {(member.title || member.status) && (
                        <span className={classes.householdMeta}>
                          {member.title ? ` - ${member.title}` : ""}
                          {member.status ? ` (${member.status})` : ""}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className={classes.panel}>
        <h3 className={classes.sectionTitle}>{t("profile.preferences.title")}</h3>

        <div className={classes.preferenceBlock}>
          <h4 className={classes.preferenceTitle}>{t("profile.preferences.subscriptions")}</h4>
          {newsletterOptions.length === 0 && <p className={classes.emptyHint}>{t("profile.preferences.empty")}</p>}
          <div className={classes.optionList}>
            {newsletterOptions.map((option) => {
              const inputId = `profile-newsletter-${option.id}`;

              return (
                <label className={classes.optionItem} key={option.id} htmlFor={inputId}>
                  <input
                    id={inputId}
                    className={classes.checkbox}
                    type="checkbox"
                    checked={selectedNewsletterIds.includes(option.id)}
                    onChange={(event) => {
                      const isChecked = event.currentTarget.checked;
                      setSelectedNewsletterIds((previous) => toggleId(previous, option.id, isChecked));
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className={classes.preferenceBlock}>
          <h4 className={classes.preferenceTitle}>{t("profile.preferences.consents")}</h4>
          {consentOptions.length === 0 && <p className={classes.emptyHint}>{t("profile.preferences.empty")}</p>}
          <div className={classes.optionList}>
            {consentOptions.map((option) => {
              const inputId = `profile-consent-${option.id}`;

              return (
                <label className={classes.optionItem} key={option.id} htmlFor={inputId}>
                  <input
                    id={inputId}
                    className={classes.checkbox}
                    type="checkbox"
                    checked={selectedConsentIds.includes(option.id)}
                    onChange={(event) => {
                      const isChecked = event.currentTarget.checked;
                      setSelectedConsentIds((previous) => toggleId(previous, option.id, isChecked));
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className={classes.preferenceBlock}>
          <h4 className={classes.preferenceTitle}>{t("profile.preferences.media")}</h4>
          {mediaOptions.length === 0 && <p className={classes.emptyHint}>{t("profile.preferences.empty")}</p>}
          <div className={classes.optionList}>
            {mediaOptions.map((option) => {
              const inputId = `profile-media-${option.id}`;

              return (
                <label className={classes.optionItem} key={option.id} htmlFor={inputId}>
                  <input
                    id={inputId}
                    className={classes.radio}
                    type="radio"
                    name="profile-preferred-media"
                    value={option.id}
                    checked={selectedMediaId === option.id}
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      setSelectedMediaId(nextValue);
                    }}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      <footer className={classes.actions}>
        <button
          className={classes.saveButton}
          type="button"
          onClick={() => void savePreferences()}
          disabled={saveState === "saving"}
        >
          <span className={classes.buttonContent}>
            <span className={classes.buttonIcon} aria-hidden="true">
              💾
            </span>
            {saveState === "saving" ? t("profile.actions.saving") : t("profile.actions.save")}
          </span>
        </button>

        {saveState === "success" && <p className={classes.saveSuccess}>{t("profile.feedback.saved")}</p>}
        {saveState === "error" && (
          <p className={classes.saveError}>{saveErrorMessage || t("profile.errors.save")}</p>
        )}
      </footer>
    </section>
  );
}
