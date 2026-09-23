package org.jahia.se.modules.efficy.service.internal;

import org.jahia.se.modules.efficy.service.model.EfficyGatewayResponse;
import org.jahia.se.modules.efficy.service.model.EfficyResourceType;
import org.jahia.se.modules.efficy.service.spi.EfficyGatewayService;
import org.jahia.se.modules.efficy.service.spi.EfficyTenantService;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * {@inheritDoc}
 *
 * Every read goes through the {@code advanced} resource, because it is the one that answers a
 * reference field with its label - "Bail en cours", "T3", "Electricité" - alongside the id. The
 * portal shows labels; resolving each referential separately would cost a round trip per field.
 *
 * Two Efficy traps shape this class:
 * <ul>
 *   <li>{@code advanced} answers "Internal error" rather than an empty value when {@code
 *       restrict_to} names a field the instance does not declare. The housing fields are custom,
 *       so a person read is attempted with them and retried without, which is what lets the same
 *       bundle run against an instance that was never customised for housing.</li>
 *   <li>Multivalued object links come back {@code null} from {@code advanced}. None of the fields
 *       followed here is multivalued; {@code OppAttID} is, and is read for its presence only.</li>
 * </ul>
 */
@Component(service = EfficyTenantService.class)
public class DefaultEfficyTenantService implements EfficyTenantService {

    private static final String JSON_CONTENT_TYPE = "application/json;charset=UTF-8";
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    private static final Pattern EFFICY_ID_PATTERN = Pattern.compile("^[0-9a-fA-F]{16}$");
    private static final Pattern KO_PATTERN = Pattern.compile("\"return_status\"\\s*:\\s*\"KO\"");
    private static final Pattern EMPTY_RESULTS_PATTERN = Pattern.compile("\"query_results\"\\s*:\\s*\\[\\s*\\]");

    /** The tenant as the housing model describes them. Custom fields end in an underscore. */
    private static final String PERSON_HOUSING_FIELDS =
            "{PerID,PerCivID,PerFstName,PerName,PerMail,PerPhone,PerMobile,PerNumClient,"
                    + "PerType_,PerPrfID_,PerPrdID_,PerPrelevement_,PerImpaye_,PerImpayeDe_,PerDtNaissance_}";
    /** What every Efficy instance can answer, housing customisation or not. */
    private static final String PERSON_STANDARD_FIELDS =
            "{PerID,PerCivID,PerFstName,PerName,PerMail,PerPhone,PerMobile,PerNumClient}";
    private static final String RESIDENCE_FIELDS =
            "{PrfID,PrfTitle,PrfCode,PrfAd1_,PrfAd2_,PrfAd3_,PrfZip_,PrfCity_,PrfNbNiveaux_,"
                    + "PrfNbLogements_,PrfNbMontees_,PrfPresEqSpec_,PrfActID,PrfActID2_,PrfActID3_}";
    private static final String DWELLING_FIELDS =
            "{PrdID,PrdName,PrdCode,PrdFamilyID,PrdTl_ID_,PrdNbBedrooms_,PrdSurface_,PrdEtage_,"
                    + "PrdAscenseur_,PrdModeChauffage_,PrdTypeChauffage_,PrdAccessibilitePMR_,"
                    + "PrdEqPMR_,PrdStatutLogement_,PrdContratEnCours_}";
    private static final String LEASE_FIELDS =
            "{OppID,OppTitle,OppNumRef,OppDate,OppStoID,OppStuID,OppSl_ID_,OppCasPart_,"
                    + "OppDureeContrat_,OppDateSortie_,OppDemLogement_,OppSoldeCompte_,OppAttID,OppAttFileName}";
    /**
     * No ActTitle: the Actor object does not declare it, and advanced answers "Internal error"
     * for the whole read rather than an empty field - which silently emptied the team.
     */
    private static final String ACTOR_FIELDS =
            "{ActID,ActCivID,ActFstName,ActName,ActMail,ActPhone,ActMobile,ActFunction}";

    /**
     * The residence's named contacts, keyed by the field that names them so the browser knows
     * which role each one holds: PrfActID is the residence's "Contact" (the standard field, its
     * main contact), PrfActID2_ the "Chargé de clientèle", PrfActID3_ the "Gestionnaire interne
     * voisinage". PerCounselor is deliberately NOT here - it is the CRM account owner, not
     * someone a tenant is meant to call.
     */
    private static final String[] TEAM_FIELDS = { "PrfActID", "PrfActID2_", "PrfActID3_" };

    /** More than any tenant has; a bound, not a page. */
    private static final int LEASE_PAGE_SIZE = 20;

    /**
     * {@code Paiement_} is a custom object (radical {@code Pa_}): a date, an amount, a state and
     * three links. {@code Pa_Demande} is the one that gives a line a meaning a tenant can read.
     */
    private static final String PAYMENT_FIELDS =
            "{Pa_ID,Pa_Person,Pa_Opportunity_,Pa_Demande,Pa_DatePrelev,Pa_Montant,Pa_Etat,Pa_CrDt,Pa_Upd}";
    /** What the portal needs of a request a payment points at: what it is about, and its state. */
    private static final String PAYMENT_DEMANDE_FIELDS =
            "{DmdID,DmdToken,DmdStatus,DmdQualifID,DmdDescription,DmdRealCrDt,DmdCrDt}";
    /** Forty years of monthly rent. A bound, not a page: Efficy cannot order, so nothing is cut. */
    private static final int PAYMENT_PAGE_SIZE = 500;

    @Reference
    private EfficyGatewayService gatewayService;

    @Override
    public EfficyGatewayResponse fetchCurrentUserTenant(String authorizationHeader,
                                                        String userEmail) throws IOException {
        String email = normalizeUserEmail(userEmail);

        String person = fetchPerson(email, authorizationHeader, email);
        if (person == null) {
            return customerNotFoundResponse();
        }

        String personId = rawValue(person, "PerID");
        if (!EFFICY_ID_PATTERN.matcher(personId).matches()) {
            return customerNotFoundResponse();
        }

        String residenceId = rawValue(person, "PerPrfID_");
        String dwellingId = rawValue(person, "PerPrdID_");

        String residence = isEfficyId(residenceId)
                ? fetchOne("ProductFamily", "PrfID", residenceId, RESIDENCE_FIELDS, authorizationHeader, email)
                : null;
        String dwelling = isEfficyId(dwellingId)
                ? fetchOne("Product", "PrdID", dwellingId, DWELLING_FIELDS, authorizationHeader, email)
                : null;
        String leases = fetchList("Opportunity", "OppPerID", personId, LEASE_FIELDS, LEASE_PAGE_SIZE,
                authorizationHeader, email);

        Map<String, String> team = new LinkedHashMap<>();
        if (residence != null) {
            for (String field : TEAM_FIELDS) {
                String actorId = rawValue(residence, field);
                if (isEfficyId(actorId)) {
                    String actor = fetchOne("Actor", "ActID", actorId, ACTOR_FIELDS, authorizationHeader, email);
                    if (actor != null) {
                        team.put(field, actor);
                    }
                }
            }
        }

        return new EfficyGatewayResponse(200, JSON_CONTENT_TYPE,
                compose(person, residence, dwelling, leases, team, personId, residenceId, dwellingId));
    }

    @Override
    public EfficyGatewayResponse fetchCurrentUserPayments(String authorizationHeader,
                                                          String userEmail) throws IOException {
        String email = normalizeUserEmail(userEmail);

        String person = fetchPerson(email, authorizationHeader, email);
        if (person == null) {
            return customerNotFoundResponse();
        }
        String personId = rawValue(person, "PerID");
        if (!isEfficyId(personId)) {
            return customerNotFoundResponse();
        }

        // null on an instance that never generated the object: the person is still answered.
        String payments = fetchList("Paiement_", "Pa_Person", personId, PAYMENT_FIELDS, PAYMENT_PAGE_SIZE,
                authorizationHeader, email);

        Map<String, String> demandes = new LinkedHashMap<>();
        if (payments != null) {
            for (String demandeId : rawValues(payments, "Pa_Demande")) {
                String demande = fetchOne("Demande", "DmdID", demandeId, PAYMENT_DEMANDE_FIELDS,
                        authorizationHeader, email);
                if (demande != null) {
                    demandes.put(demandeId, demande);
                }
            }
        }

        return new EfficyGatewayResponse(200, JSON_CONTENT_TYPE,
                composePayments(person, payments, demandes, personId));
    }

    /**
     * The person with their housing fields, or without them on an instance that has none.
     *
     * The retry is what makes the difference between "this tenant has no dwelling" and "this CRM
     * has no notion of a dwelling" invisible to the caller: both come back as a person with no
     * {@code PerPrfID_}, and the widgets fall back the same way.
     */
    private String fetchPerson(String email, String authorizationHeader, String userEmail) throws IOException {
        String housing = fetchOne("Person", "PerMail", email, PERSON_HOUSING_FIELDS, authorizationHeader, userEmail);
        if (housing != null) {
            return housing;
        }
        return fetchOne("Person", "PerMail", email, PERSON_STANDARD_FIELDS, authorizationHeader, userEmail);
    }

    /** One record by an exact match on one field; {@code null} when Efficy errs or finds nothing. */
    private String fetchOne(String object, String field, String value, String restrictTo,
                            String authorizationHeader, String userEmail) throws IOException {
        String body = fetchList(object, field, value, restrictTo, 1, authorizationHeader, userEmail);
        if (body == null || EMPTY_RESULTS_PATTERN.matcher(body).find()) {
            return null;
        }
        return body;
    }

    /** A page of records by an exact match on one field; {@code null} when Efficy errs. */
    private String fetchList(String object, String field, String value, String restrictTo, int pageSize,
                             String authorizationHeader, String userEmail) throws IOException {
        String filter = URLEncoder.encode("{{[" + field + ",=," + value + "]}}", StandardCharsets.UTF_8);
        String restrict = URLEncoder.encode(restrictTo, StandardCharsets.UTF_8);
        String query = "filter=" + filter + "&restrict_to=" + restrict + "&nb_of_result=" + pageSize;

        EfficyGatewayResponse response = gatewayService.forward(
                EfficyResourceType.ADVANCED, object, query, "GET", null, authorizationHeader, userEmail);

        String body = response.getBody();
        if (response.getStatus() >= 400 || !isJsonObject(body) || KO_PATTERN.matcher(body).find()) {
            return null;
        }
        return body;
    }

    /**
     * The composite. Each part is Efficy's own response body, verbatim - it is already valid JSON,
     * so it is placed rather than re-serialised, and the browser reads it with the field readers
     * it uses everywhere else. {@code resolved} carries the ids that were followed, so the client
     * can pick the current lease without re-deriving them.
     */
    private String compose(String person, String residence, String dwelling, String leases,
                           Map<String, String> team, String personId, String residenceId, String dwellingId) {
        StringBuilder out = new StringBuilder(4096);
        out.append("{\"person\":").append(person.trim());
        out.append(",\"residence\":").append(orNull(residence));
        out.append(",\"dwelling\":").append(orNull(dwelling));
        out.append(",\"leases\":").append(orNull(leases));

        out.append(",\"team\":{");
        boolean first = true;
        for (Map.Entry<String, String> entry : team.entrySet()) {
            if (!first) {
                out.append(',');
            }
            first = false;
            out.append('"').append(entry.getKey()).append("\":").append(entry.getValue().trim());
        }
        out.append('}');

        out.append(",\"resolved\":{\"personId\":\"").append(personId).append('"');
        if (isEfficyId(residenceId)) {
            out.append(",\"residenceId\":\"").append(residenceId).append('"');
        }
        if (isEfficyId(dwellingId)) {
            out.append(",\"dwellingId\":\"").append(dwellingId).append('"');
        }
        out.append("}}");
        return out.toString();
    }

    /** Same placement rule as {@link #compose}: Efficy's bodies verbatim, one key each. */
    private String composePayments(String person, String payments, Map<String, String> demandes,
                                   String personId) {
        StringBuilder out = new StringBuilder(8192);
        out.append("{\"person\":").append(person.trim());
        out.append(",\"payments\":").append(orNull(payments));

        out.append(",\"demandes\":{");
        boolean first = true;
        for (Map.Entry<String, String> entry : demandes.entrySet()) {
            if (!first) {
                out.append(',');
            }
            first = false;
            out.append('"').append(entry.getKey()).append("\":").append(entry.getValue().trim());
        }
        out.append('}');

        out.append(",\"resolved\":{\"personId\":\"").append(personId).append("\"}}");
        return out.toString();
    }

    private static String orNull(String body) {
        return body == null ? "null" : body.trim();
    }

    private static boolean isJsonObject(String body) {
        if (body == null) {
            return false;
        }
        String trimmed = body.trim();
        return trimmed.startsWith("{") && trimmed.endsWith("}");
    }

    private static boolean isEfficyId(String value) {
        return value != null && EFFICY_ID_PATTERN.matcher(value).matches();
    }

    /**
     * The {@code raw_value} of a field in an {@code advanced} response - the id behind a
     * reference, the text of a string. Empty when absent or {@code null}, which is how Efficy
     * answers a field the record does not fill.
     */
    private static String rawValue(String body, String field) {
        Pattern pattern = Pattern.compile(
                "\"" + Pattern.quote(field) + "\"\\s*:\\s*\\{[^}]*?\"raw_value\"\\s*:\\s*\"([^\"]+)\"");
        Matcher matcher = pattern.matcher(body);
        return matcher.find() ? matcher.group(1) : "";
    }

    /**
     * Every distinct {@code raw_value} a field takes across the rows of a list response, in
     * order of first appearance, ids only. A field the rows leave empty contributes nothing.
     */
    private static Set<String> rawValues(String body, String field) {
        Pattern pattern = Pattern.compile(
                "\"" + Pattern.quote(field) + "\"\\s*:\\s*\\{[^}]*?\"raw_value\"\\s*:\\s*\"([^\"]+)\"");
        Matcher matcher = pattern.matcher(body);
        Set<String> values = new LinkedHashSet<>();
        while (matcher.find()) {
            if (isEfficyId(matcher.group(1))) {
                values.add(matcher.group(1));
            }
        }
        return values;
    }

    private String normalizeUserEmail(String userEmail) {
        if (userEmail == null) {
            throw new IllegalArgumentException("Unable to resolve logged user email");
        }
        String trimmed = userEmail.trim();
        if (!EMAIL_PATTERN.matcher(trimmed).matches()) {
            throw new IllegalArgumentException("Unable to resolve logged user email");
        }
        return trimmed;
    }

    private EfficyGatewayResponse customerNotFoundResponse() {
        return new EfficyGatewayResponse(404, JSON_CONTENT_TYPE,
                "{\"error\":\"No Efficy customer found for logged user email\"}");
    }
}
