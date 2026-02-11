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
        String restrictTo = URLEncoder.encode(
                "{DmdID,DmdToken,DmdStatus,DmdActID,DmdCrDt,DmdDescription,DmdPriority,DmdQualifID,DmdAttID}",
                StandardCharsets.UTF_8
        );

        String query = "filter=" + filter + "&restrict_to=" + restrictTo + "&nb_of_result=" + pageSize;

        return gatewayService.forward(
                EfficyResourceType.ADVANCED,
                "Demande",
                query,
                "GET",
                null,
                authorizationHeader,
                userEmail
        );
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
