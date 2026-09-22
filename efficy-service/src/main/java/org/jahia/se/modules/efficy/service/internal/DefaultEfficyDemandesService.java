package org.jahia.se.modules.efficy.service.internal;

import org.jahia.se.modules.efficy.service.model.EfficyGatewayResponse;
import org.jahia.se.modules.efficy.service.model.EfficyResourceType;
import org.jahia.se.modules.efficy.service.spi.EfficyDemandesService;
import org.jahia.se.modules.efficy.service.spi.EfficyGatewayService;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component(service = EfficyDemandesService.class)
public class DefaultEfficyDemandesService implements EfficyDemandesService {

    private static final Pattern PERSON_ID_PATTERN = Pattern.compile("[A-Za-z0-9_-]+");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private static final Pattern PER_ID_RAW_VALUE_PATTERN = Pattern.compile("\\\"PerID\\\"\\s*:\\s*\\{[^}]*?\\\"raw_value\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    private static final Pattern PER_ID_VALUE_PATTERN = Pattern.compile("\\\"PerID\\\"\\s*:\\s*\\{[^}]*?\\\"value\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    private static final Pattern PER_ID_LABEL_PATTERN = Pattern.compile("\\\"PerID\\\"\\s*:\\s*\\{[^}]*?\\\"label\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    private static final Pattern PER_ID_STRING_PATTERN = Pattern.compile("\\\"PerID\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");

    private static final String JSON_CONTENT_TYPE = "application/json;charset=UTF-8";

    /**
     * The request list comes back carrying ids - DmdActID, DmdQualifID - and nothing a tenant can
     * read. The browser used to turn each of those into a name itself, one call per row per
     * field, so rendering five requests cost eleven round trips through this gateway to a remote
     * CRM. The CCTP asks for a screen in under a second (§3.7) and a consultation query in under
     * two (§3.2.4); eleven chained round trips is not a number anyone can commit to.
     *
     * So the names are resolved here instead, once, and appended to the response. Doing it on
     * this side also means the cache is shared by every tenant and every page load rather than
     * living in one browser tab.
     */
    private static final Pattern DMD_ACTOR_ID_PATTERN = Pattern.compile("\\\"DmdActID\\\"\\s*:\\s*\\{[^}]*?\\\"raw_value\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    private static final Pattern DMD_QUALIF_ID_PATTERN = Pattern.compile("\\\"DmdQualifID\\\"\\s*:\\s*\\{[^}]*?\\\"raw_value\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    private static final Pattern EXTRANET_LABEL_PATTERN = Pattern.compile("\\\"QulExtranetLabel\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
    private static final Pattern BEAN_DISPLAY_PATTERN = Pattern.compile("\\\"bean_display\\\"\\s*:\\s*\\\"([^\\\"]*)\\\"");

    /**
     * Actors and qualifications are referentials: they change on the scale of months, and a
     * demonstration or a working day is far shorter than that. Held for half an hour so a change
     * made in the CRM still reaches the portal the same morning.
     */
    private static final long REFERENTIAL_TTL_MS = 30L * 60L * 1000L;

    private final Map<String, String> actorNames = new ConcurrentHashMap<>();
    private final Map<String, String> qualificationNames = new ConcurrentHashMap<>();
    private volatile long referentialsLoadedAt = System.currentTimeMillis();

    @Reference
    private EfficyGatewayService gatewayService;

    @Override
    public EfficyGatewayResponse fetchCurrentUserPerson(String authorizationHeader,
                                                        String userEmail) throws IOException {
        String normalizedEmail = normalizeUserEmail(userEmail);
        return fetchPersonByEmail(normalizedEmail, authorizationHeader, normalizedEmail);
    }

    @Override
    public EfficyGatewayResponse fetchDemandesForCurrentUser(int pageSize,
                                                             String authorizationHeader,
                                                             String userEmail) throws IOException {
        String normalizedEmail = normalizeUserEmail(userEmail);

        EfficyGatewayResponse personResponse = fetchPersonByEmail(normalizedEmail, authorizationHeader, normalizedEmail);
        if (personResponse.getStatus() >= 400) {
            return personResponse;
        }

        String personId = extractPersonId(personResponse.getBody());
        if (personId == null || !PERSON_ID_PATTERN.matcher(personId).matches()) {
            return customerNotFoundResponse();
        }

        return fetchDemandesByPersonId(personId, pageSize, authorizationHeader, normalizedEmail);
    }

    private EfficyGatewayResponse fetchPersonByEmail(String email,
                                                     String authorizationHeader,
                                                     String userEmail) throws IOException {
        String filter = URLEncoder.encode("{{[PerMail,=," + email + "]}}", StandardCharsets.UTF_8);
        String restrictTo = URLEncoder.encode("{PerID}", StandardCharsets.UTF_8);
        String query = "filter=" + filter + "&restrict_to=" + restrictTo + "&nb_of_result=1";

        return gatewayService.forward(
                EfficyResourceType.ADVANCED,
                "Person",
                query,
                "GET",
                null,
                authorizationHeader,
                userEmail
        );
    }

    private EfficyGatewayResponse fetchDemandesByPersonId(String personId,
                                                          int pageSize,
                                                          String authorizationHeader,
                                                          String userEmail) throws IOException {
        String filter = URLEncoder.encode("{{[DmdPerID,=," + personId + "]}}", StandardCharsets.UTF_8);
        // DmdRealCrDt is the date the request was actually raised; DmdCrDt is the date the row
        // was inserted, and Efficy stamps it itself - it cannot be set through the API, so on any
        // instance whose history was loaded rather than accumulated the two differ. The portal
        // prefers DmdRealCrDt when it carries a value and falls back to DmdCrDt, which is correct
        // on a live instance too, where only DmdCrDt is populated.
        String restrictTo = URLEncoder.encode(
                "{DmdID,DmdToken,DmdStatus,DmdActID,DmdCrDt,DmdRealCrDt,DmdDescription,DmdPriority,DmdQualifID,DmdAttID}",
                StandardCharsets.UTF_8
        );

        String query = "filter=" + filter + "&restrict_to=" + restrictTo + "&nb_of_result=" + pageSize;

        EfficyGatewayResponse response = gatewayService.forward(
                EfficyResourceType.ADVANCED,
                "Demande",
                query,
                "GET",
                null,
                authorizationHeader,
                userEmail
        );

        return withResolvedReferentials(response, authorizationHeader, userEmail);
    }

    /**
     * Appends the adviser and qualification names the list refers to by id.
     *
     * Appended as a separate `resolved` object rather than written into each bean: rewriting
     * nested JSON with regular expressions is how a response gets quietly corrupted, and leaving
     * the beans untouched keeps this backward compatible - a client that does not know about
     * `resolved` still sees exactly the payload it saw before.
     *
     * Failure here is never fatal. If a name cannot be resolved the entry is simply absent and
     * the caller falls back to asking for it itself, which is what it did before this existed.
     */
    private EfficyGatewayResponse withResolvedReferentials(EfficyGatewayResponse response,
                                                           String authorizationHeader,
                                                           String userEmail) {
        String body = response.getBody();
        if (response.getStatus() >= 400 || body == null || !body.trim().endsWith("}")) {
            return response;
        }

        expireReferentialsIfStale();

        StringBuilder actors = new StringBuilder();
        for (String actorId : distinctMatches(body, DMD_ACTOR_ID_PATTERN)) {
            String name = actorNames.computeIfAbsent(actorId,
                    id -> fetchActorName(id, authorizationHeader, userEmail));
            appendEntry(actors, actorId, name);
        }

        StringBuilder qualifications = new StringBuilder();
        for (String qualificationId : distinctMatches(body, DMD_QUALIF_ID_PATTERN)) {
            String name = qualificationNames.computeIfAbsent(qualificationId,
                    id -> fetchQualificationName(id, authorizationHeader, userEmail));
            appendEntry(qualifications, qualificationId, name);
        }

        if (actors.length() == 0 && qualifications.length() == 0) {
            return response;
        }

        String trimmed = body.trim();
        String enriched = trimmed.substring(0, trimmed.lastIndexOf('}'))
                + ",\"resolved\":{\"actors\":{" + actors + "},\"qualifications\":{"
                + qualifications + "}}}";

        return new EfficyGatewayResponse(response.getStatus(), response.getContentType(), enriched);
    }

    private void expireReferentialsIfStale() {
        if (System.currentTimeMillis() - referentialsLoadedAt <= REFERENTIAL_TTL_MS) {
            return;
        }
        actorNames.clear();
        qualificationNames.clear();
        referentialsLoadedAt = System.currentTimeMillis();
    }

    private Set<String> distinctMatches(String body, Pattern pattern) {
        Set<String> found = new LinkedHashSet<>();
        Matcher matcher = pattern.matcher(body);
        while (matcher.find()) {
            found.add(matcher.group(1));
        }
        return found;
    }

    /** Composed exactly as the browser used to compose it: civility, first name, last name. */
    private String fetchActorName(String actorId, String authorizationHeader, String userEmail) {
        try {
            String filter = URLEncoder.encode("{{[ActID,=," + actorId + "]}}", StandardCharsets.UTF_8);
            String restrictTo = URLEncoder.encode("{ActID,ActCivID,ActName,ActFstName}", StandardCharsets.UTF_8);
            EfficyGatewayResponse actor = gatewayService.forward(
                    EfficyResourceType.ADVANCED, "Actor",
                    "filter=" + filter + "&restrict_to=" + restrictTo,
                    "GET", null, authorizationHeader, userEmail);

            if (actor.getStatus() >= 400 || actor.getBody() == null) {
                return "";
            }

            String body = actor.getBody();
            StringBuilder name = new StringBuilder();
            for (String field : new String[] { "ActCivID", "ActFstName", "ActName" }) {
                String part = fieldText(body, field);
                if (!part.isEmpty()) {
                    if (name.length() > 0) {
                        name.append(' ');
                    }
                    name.append(part);
                }
            }
            return name.toString();
        } catch (IOException e) {
            return "";
        }
    }

    /**
     * The name a tenant should read for a request type.
     *
     * Prefers `QulExtranetLabel`, which is the wording written FOR tenants - "Ascenseur bloqué" -
     * over the qualification's `bean_display`, which is the internal taxonomy path and reads as
     * "Technique > Ascenseur > Bloqué, sans personne à l'intérieur". A tenant has no use for the
     * landlord's classification tree, and the third level of it is internal shorthand.
     *
     * Falls back to `bean_display` when a qualification has no extranet label, which is the case
     * for the ones never offered on the portal but still attached to older requests.
     */
    private String fetchQualificationName(String qualificationId, String authorizationHeader, String userEmail) {
        String extranetLabel = fetchExtranetLabel(qualificationId, authorizationHeader, userEmail);
        if (!extranetLabel.isEmpty()) {
            return extranetLabel;
        }
        return fetchQualificationPath(qualificationId, authorizationHeader, userEmail);
    }

    private String fetchExtranetLabel(String qualificationId, String authorizationHeader, String userEmail) {
        try {
            String filter = URLEncoder.encode("{{[QulQualificationID,=," + qualificationId + "]}}",
                    StandardCharsets.UTF_8);
            String restrictTo = URLEncoder.encode("{QulExtranetLabel,QulLngID}", StandardCharsets.UTF_8);
            EfficyGatewayResponse labels = gatewayService.forward(
                    EfficyResourceType.BASE, "QualificationLabel",
                    "filter=" + filter + "&restrict_to=" + restrictTo,
                    "GET", null, authorizationHeader, userEmail);

            if (labels.getStatus() >= 400 || labels.getBody() == null) {
                return "";
            }
            String label = firstMatch(labels.getBody(), EXTRANET_LABEL_PATTERN);
            return label == null ? "" : decodeJsonString(label);
        } catch (IOException e) {
            return "";
        }
    }

    private String fetchQualificationPath(String qualificationId, String authorizationHeader, String userEmail) {
        try {
            EfficyGatewayResponse qualification = gatewayService.forward(
                    EfficyResourceType.BASE, "Qualification/" + qualificationId,
                    null, "GET", null, authorizationHeader, userEmail);

            if (qualification.getStatus() >= 400 || qualification.getBody() == null) {
                return "";
            }
            String display = firstMatch(qualification.getBody(), BEAN_DISPLAY_PATTERN);
            return display == null ? "" : decodeJsonString(display);
        } catch (IOException e) {
            return "";
        }
    }

    /**
     * Label, then value, then raw_value - the same precedence the browser applied.
     *
     * Efficy's reference fields are three-layered and the layers mean different things: raw_value
     * is an opaque id, value a code, label the text meant for a human.
     */
    private String fieldText(String body, String field) {
        for (String layer : new String[] { "label", "value", "raw_value" }) {
            Pattern pattern = Pattern.compile("\\\"" + field + "\\\"\\s*:\\s*\\{[^}]*?\\\"" + layer
                    + "\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
            String match = firstMatch(body, pattern);
            if (match != null && !match.isEmpty()) {
                return decodeJsonString(match);
            }
        }
        return "";
    }

    private void appendEntry(StringBuilder target, String id, String name) {
        if (name == null || name.isEmpty()) {
            return;
        }
        if (target.length() > 0) {
            target.append(',');
        }
        target.append('"').append(escapeJson(id)).append("\":\"").append(escapeJson(name)).append('"');
    }

    /**
     * Turns a captured JSON string fragment back into the text it represents.
     *
     * The regexes above capture raw JSON, so an Efficy label arrives still carrying its own
     * escapes - "Réclamation \\u003e Contrat". Re-escaping that as-is produces a doubled escape
     * and the portal displays the six characters "\\u003e" where it should show ">". Decode
     * first, then re-encode once.
     */
    private String decodeJsonString(String raw) {
        if (raw == null || raw.indexOf('\\') < 0) {
            return raw == null ? "" : raw;
        }

        StringBuilder decoded = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c != '\\' || i + 1 >= raw.length()) {
                decoded.append(c);
                continue;
            }

            char next = raw.charAt(++i);
            switch (next) {
                case 'n': decoded.append('\n'); break;
                case 'r': decoded.append('\r'); break;
                case 't': decoded.append('\t'); break;
                case 'b': decoded.append('\b'); break;
                case 'f': decoded.append('\f'); break;
                case '"': decoded.append('"'); break;
                case '/': decoded.append('/'); break;
                case '\\': decoded.append('\\'); break;
                case 'u':
                    if (i + 4 < raw.length()) {
                        try {
                            decoded.append((char) Integer.parseInt(raw.substring(i + 1, i + 5), 16));
                            i += 4;
                        } catch (NumberFormatException e) {
                            decoded.append("\\u");
                        }
                    } else {
                        decoded.append("\\u");
                    }
                    break;
                default:
                    decoded.append('\\').append(next);
            }
        }
        return decoded.toString();
    }
    private String escapeJson(String value) {
        StringBuilder escaped = new StringBuilder(value.length() + 8);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': escaped.append("\\\""); break;
                case '\\': escaped.append("\\\\"); break;
                case '\n': escaped.append("\\n"); break;
                case '\r': escaped.append("\\r"); break;
                case '\t': escaped.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        escaped.append(String.format("\\u%04x", (int) c));
                    } else {
                        escaped.append(c);
                    }
            }
        }
        return escaped.toString();
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

    private String extractPersonId(String responseBody) {
        String fromRawValue = firstMatch(responseBody, PER_ID_RAW_VALUE_PATTERN);
        if (fromRawValue != null) {
            return fromRawValue;
        }

        String fromValue = firstMatch(responseBody, PER_ID_VALUE_PATTERN);
        if (fromValue != null) {
            return fromValue;
        }

        String fromLabel = firstMatch(responseBody, PER_ID_LABEL_PATTERN);
        if (fromLabel != null) {
            return fromLabel;
        }

        return firstMatch(responseBody, PER_ID_STRING_PATTERN);
    }

    private String firstMatch(String value, Pattern pattern) {
        if (value == null || value.isEmpty()) {
            return null;
        }

        Matcher matcher = pattern.matcher(value);
        return matcher.find() ? matcher.group(1) : null;
    }

    private EfficyGatewayResponse customerNotFoundResponse() {
        return new EfficyGatewayResponse(
                404,
                JSON_CONTENT_TYPE,
                "{\"error\":\"No Efficy customer found for logged user email\"}"
        );
    }
}
